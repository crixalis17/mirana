import {createHash, randomUUID} from 'node:crypto';
import type {Transaction, InValue} from '@libsql/client';
import {databaseClient} from './database';
import {ensureResearchSchema} from './research/schema';

export type ResearchStage = 'plan' | 'gather' | 'read' | 'assess' | 'followup' | 'synthesize' | 'verify' | 'publish';
export type ResearchJobStatus = 'queued' | 'running' | 'retry_pending' | 'failed' | 'cancelled' | 'superseded' | 'completed';
export type ResearchUsage = {inputTokens?: number; outputTokens?: number};
type RecordValue = Record<string, unknown>;
const stages: ResearchStage[] = ['plan', 'gather', 'read', 'assess', 'followup', 'synthesize', 'verify', 'publish'];
const inactive = new Set(['cancelled', 'superseded', 'completed']);
const excludedBriefKeys = new Set(['id', 'userId', 'briefRevision', 'alerts', 'status', 'report', 'parsed', 'updatedAt', 'createdAt', 'lastCheckedAt', 'nextCheckAt', 'error', 'lastError', 'retryAt', 'retryCount', 'researchError', 'researchRetryAt']);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function canonicalResearchBrief(brief: RecordValue) {
  return canonical(Object.fromEntries(Object.entries(brief).filter(([key]) => !excludedBriefKeys.has(key)))) as RecordValue;
}
export function researchBriefHash(brief: RecordValue) {return createHash('sha256').update(JSON.stringify(canonicalResearchBrief(brief))).digest('hex');}
function revision(brief: RecordValue) {return typeof brief.briefRevision==='number' && Number.isSafeInteger(brief.briefRevision) && brief.briefRevision >= 0 ? brief.briefRevision : 0;}
function bound(name: string, fallback: number, maximum: number) {const value=Number(process.env[name]); return Number.isInteger(value)&&value>0 ? Math.min(value,maximum) : fallback;}
function limits() {return {maxCalls:bound('RESEARCH_MAX_CALLS',8,8),maxToolCalls:bound('RESEARCH_MAX_TOOL_CALLS',12,24),maxRounds:bound('RESEARCH_MAX_ROUNDS',2,2),maxInputTokens:bound('RESEARCH_MAX_INPUT_TOKENS',100000,200000),maxOutputTokens:bound('RESEARCH_MAX_OUTPUT_TOKENS',process.env.RESEARCH_TOOLS_ENABLED==='true'?196608:24000,196608)};}
const leaseMs=360000;
const now=()=>new Date().toISOString();
function event(stage: ResearchStage, message: string) {return {id:randomUUID(),at:now(),stage,message};}
const stageLabels: Record<ResearchStage,string>={plan:'Preparing a research plan.',gather:'Gathering product evidence.',read:'Reading original source documents.',assess:'Assessing evidence and requirements.',followup:'Checking gaps in the evidence.',synthesize:'Comparing supported candidates.',verify:'Checking recommendation evidence.',publish:'Preparing your results.'};
function read(row: RecordValue) {
  const payload=JSON.parse(String(row.payload));
  // Older checkpoints have no tool budget. Their model budget remains immutable.
  payload.limits={...payload.limits,maxToolCalls:Number.isSafeInteger(payload.limits?.maxToolCalls)&&payload.limits.maxToolCalls>0?Math.min(payload.limits.maxToolCalls,24):12};
  payload.attemptedToolCalls=Number.isSafeInteger(payload.attemptedToolCalls)&&payload.attemptedToolCalls>=0?payload.attemptedToolCalls:0;
  return {...payload,id:String(row.id),purchaseId:String(row.purchase_id),userId:String(row.user_id),briefRevision:Number(row.brief_revision),briefHash:String(row.brief_hash),status:row.status as ResearchJobStatus,stage:row.stage as ResearchStage,token:row.lease_token as string|null,leaseExpires:Number(row.lease_expires||0),retryAt:row.retry_at as string|null,createdAt:String(row.created_at),updatedAt:String(row.updated_at),steps:payload.outputs||{},outputs:payload.outputs||{}};
}
export type ResearchJob = ReturnType<typeof read>;
export class ResearchJobError extends Error {
  readonly code: string;
  constructor(message: string,code: string){super(message);this.name='ResearchJobError';this.code=code;}
}
// Serialize transactions on this client; the database transaction still fences other workers/processes.
let transactionTail: Promise<void>=Promise.resolve();
async function transaction<T>(work: (tx: Transaction)=>Promise<T>): Promise<T> {
  const previous=transactionTail;let unlock!: ()=>void;transactionTail=new Promise<void>(resolve=>{unlock=resolve;});
  await previous;
  let tx: Transaction | undefined;
  try {
    await ensureResearchSchema();
    for(let attempt=0;attempt<5;attempt++){try{tx=await databaseClient().transaction('write');break;}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='SQLITE_BUSY')||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,10*(attempt+1)));}}
    if(!tx)throw new Error('Research database is busy.');
    try {const result=await work(tx);await tx.commit();return result;} catch(error) {await tx.rollback();throw error;}
  } finally {tx?.close();unlock();}
}
async function find(tx: Transaction,id: string) {const result=await tx.execute({sql:'SELECT * FROM research_jobs WHERE id=?',args:[id]});return result.rows[0]?read(result.rows[0]):null;}
async function purchase(tx: Transaction,id: string,userId: string) {const result=await tx.execute({sql:'SELECT * FROM purchases WHERE id=? AND user_id=?',args:[id,userId]});return result.rows[0]||null;}
async function save(tx: Transaction,job: ResearchJob) {
  const {id,status,stage,token,leaseExpires,retryAt,updatedAt}=job;
  const payload={purchase:job.purchase,referenceDate:job.referenceDate,outputs:job.outputs,journal:job.journal,events:job.events,limits:job.limits,attemptedCalls:job.attemptedCalls,attemptedToolCalls:job.attemptedToolCalls,inputTokens:job.inputTokens,outputTokens:job.outputTokens,rounds:job.rounds,safeError:job.safeError};
  await tx.execute({sql:'UPDATE research_jobs SET payload=?,status=?,stage=?,lease_token=?,lease_expires=?,retry_at=?,updated_at=? WHERE id=?',args:[JSON.stringify(payload),status,stage,token,leaseExpires,retryAt,updatedAt,id]});
}
function stopped(row: RecordValue) {return row.status === 'paused'||row.status === 'bought';}
async function current(tx: Transaction,job: ResearchJob) {
  const row=await purchase(tx,job.purchaseId,job.userId);
  if(!row) return 'superseded';
  const brief=JSON.parse(String(row.brief));
  if(revision(brief)!==job.briefRevision||researchBriefHash(brief)!==job.briefHash) return 'superseded';
  if(stopped(row)) return 'cancelled';
  return null;
}
async function fenced(tx: Transaction,id: string,token: string) {
  const job=await find(tx,id);
  if(!job||job.status!=='running'||job.token!==token||job.leaseExpires<=Date.now())throw new ResearchJobError('Research lease is no longer current.','lease_lost');
  const stale=await current(tx,job);
  if(stale) {job.status=stale;job.token=null;job.leaseExpires=0;job.updatedAt=now();await save(tx,job);return {job,stale};}
  return {job,stale:null};
}
async function mutate(id: string,token: string,work: (tx: Transaction,job: ResearchJob)=>Promise<void>|void) {
  const result=await transaction(async tx=>{const {job,stale}=await fenced(tx,id,token);if(stale)return {job,stale};await work(tx,job);job.updatedAt=now();await save(tx,job);return {job,stale:null};});
  if(result.stale)throw new ResearchJobError(`Research job was ${result.stale}.`,result.stale);
  return result.job;
}
function publicStrings(value: unknown,maximum=12) {return Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,maximum).map(v=>v.slice(0,240)):[];}
export function researchJobDTO(job: ResearchJob) {
  const plan=job.outputs?.plan||{};
  const batches=[job.outputs?.gather,...(job.outputs?.followup||[])].filter(Boolean);
  const sourceCount=new Set(batches.flatMap(batch=>(batch.sources||[]).map((source:RecordValue)=>source.url)).filter((url:unknown)=>typeof url==='string'&&url.startsWith('https://'))).size;
  const gaps=publicStrings(job.outputs?.assess?.gaps);
  const originals=new Map<string,{accessStatus:string;bodyText?:string;textTrust?:string}>();
  for(const batch of (job.outputs?.read||[]))for(const source of (batch.sources||[]))originals.set(source.url,source);
  const readCount=[...originals.values()].filter(source=>source.accessStatus==='read'&&source.bodyText&&source.textTrust==='untrusted-original-page').length;
  const providerReadCount=[...originals.values()].filter(source=>source.accessStatus==='read'&&source.bodyText&&['untrusted-provider-api-json','untrusted-provider-page'].includes(source.textTrust||'')).length;
  const blockedCount=[...originals.values()].filter(source=>source.accessStatus!=='read').length;
  const toolNames=new Set(['search_products_india','fetch_product_listing','amazon_price_history','search_web_tavily','read_source_tavily','search_web_firecrawl','read_source_firecrawl','read_source_page','search_web_mcp','read_source_mcp','google_search']);
  const providers=new Set(['product-api','web-api','original-page','serpapi-mcp','brightdata-mcp','tavily','firecrawl','google']);
  const toolCalls=batches.flatMap(batch=>batch.toolCalls||[]).slice(0,36).filter((call:RecordValue)=>toolNames.has(String(call.tool))&&providers.has(String(call.provider))).map((call:RecordValue)=>({
    tool:String(call.tool),provider:String(call.provider),status:['ok','error','unavailable','limited'].includes(String(call.status))?String(call.status):'error',
    sourceCount:Number.isSafeInteger(call.sourceCount)?Number(call.sourceCount):0,offerCount:Number.isSafeInteger(call.offerCount)?Number(call.offerCount):0,
    ...(/^[A-Z_]{1,40}$/.test(String(call.errorCode||''))?{errorCode:String(call.errorCode)}:{})}));
  return {id:job.id,purchaseId:job.purchaseId,briefRevision:job.briefRevision,status:job.status,stage:job.stage,rounds:job.rounds,createdAt:job.createdAt,updatedAt:job.updatedAt,retryAt:job.retryAt,error:job.safeError||null,
    limits:{maxCalls:job.limits.maxCalls,maxToolCalls:job.limits.maxToolCalls,maxRounds:job.limits.maxRounds,attemptedCalls:job.attemptedCalls,attemptedToolCalls:job.attemptedToolCalls},
    events:job.events.slice(-40),plan:{criteria:publicStrings(plan.criteria),hardRequirements:publicStrings(plan.hardRequirements),softPreferences:publicStrings(plan.softPreferences),questions:publicStrings(plan.questions)},
    completedSteps:Object.keys(job.outputs).filter(key=>stages.includes(key as ResearchStage)),
    coverage:{sourceCount,readCount,providerReadCount,blockedCount,gapCount:gaps.length,gaps,toolCalls}};
}
export async function ensureResearchJob(purchaseId: string,userId: string) {
  return transaction(async tx=>{
    const row=await purchase(tx,purchaseId,userId);if(!row)throw new Error('Shopping item not found.');
    const brief=JSON.parse(String(row.brief)),briefHash=researchBriefHash(brief),briefRevision=revision(brief);
    const id=createHash('sha256').update(JSON.stringify([userId,purchaseId,briefRevision,briefHash])).digest('hex');
    const existing=await find(tx,id);if(existing)return existing;
    if(process.env.NODE_ENV==='production'||process.env.VERCEL){
      const since=new Date(Date.now()-86400000).toISOString();
      const userLimit=bound('RESEARCH_USER_DAILY_JOB_LIMIT',3,20),globalLimit=bound('RESEARCH_DAILY_JOB_LIMIT',10,100);
      const counts=await tx.execute({sql:'SELECT COUNT(*) AS total,SUM(CASE WHEN user_id=? THEN 1 ELSE 0 END) AS owned FROM research_jobs WHERE created_at>=?',args:[userId,since]});
      if(Number(counts.rows[0]?.total)>=globalLimit||Number(counts.rows[0]?.owned)>=userLimit)throw new ResearchJobError('The daily research allowance has been reached. Try again tomorrow.','daily_limit');
    }
    const timestamp=now(),payload={purchase:{...canonicalResearchBrief(brief),id:purchaseId,briefRevision},referenceDate:timestamp,outputs:{},journal:[],events:[event('plan','Research queued.')],limits:limits(),attemptedCalls:0,attemptedToolCalls:0,inputTokens:0,outputTokens:0,rounds:0,safeError:null};
    await tx.execute({sql:"UPDATE research_jobs SET status='superseded',lease_token=NULL,lease_expires=0,updated_at=? WHERE purchase_id=? AND user_id=? AND status NOT IN ('completed','cancelled','superseded')",args:[timestamp,purchaseId,userId]});
    await tx.execute({sql:'INSERT OR IGNORE INTO research_jobs (id,purchase_id,user_id,brief_revision,brief_hash,status,stage,payload,lease_token,lease_expires,retry_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[id,purchaseId,userId,briefRevision,briefHash,stopped(row)?'cancelled':'queued','plan',JSON.stringify(payload),null,0,null,timestamp,timestamp]});
    return (await find(tx,id))!;
  });
}
export async function getResearchJob(purchaseId: string,userId: string) {
  return transaction(async tx=>{const row=await purchase(tx,purchaseId,userId);if(!row)return null;const brief=JSON.parse(String(row.brief));const result=await tx.execute({sql:'SELECT * FROM research_jobs WHERE purchase_id=? AND user_id=? AND brief_revision=? AND brief_hash=? ORDER BY created_at DESC LIMIT 1',args:[purchaseId,userId,revision(brief),researchBriefHash(brief)]});return result.rows[0]?researchJobDTO(read(result.rows[0])):null;});
}
export async function listRunnableResearchJobs(options: {purchaseId?:string;userId?:string;limit?:number}={}) {
  await ensureResearchSchema();
  const args: InValue[]=[now(),Date.now()],clauses=["(status='queued' OR (status='retry_pending' AND (retry_at IS NULL OR retry_at<=?)) OR (status='running' AND lease_expires<=?))"];
  if(options.purchaseId){clauses.push('purchase_id=?');args.push(options.purchaseId);}if(options.userId){clauses.push('user_id=?');args.push(options.userId);}args.push(Math.max(1,Math.min(20,options.limit||5)));
  const result=await databaseClient().execute({sql:`SELECT * FROM research_jobs WHERE ${clauses.join(' AND ')} ORDER BY created_at LIMIT ?`,args});return result.rows.map(read);
}
export async function claimResearchJob(jobId: string) {
  return transaction(async tx=>{const job=await find(tx,jobId);if(!job||inactive.has(job.status)||job.status==='failed'||(job.status==='running'&&job.leaseExpires>Date.now())||(job.status==='retry_pending'&&job.retryAt&&Date.parse(job.retryAt)>Date.now()))return null;
    const stale=await current(tx,job);if(stale){job.status=stale;job.token=null;job.leaseExpires=0;job.updatedAt=now();await save(tx,job);return null;}
    job.status='running';job.token=randomUUID();job.leaseExpires=Date.now()+leaseMs;job.retryAt=null;job.updatedAt=now();await save(tx,job);return {token:job.token,job};});
}
export async function assertResearchJobCurrent(jobId: string,token: string) {return mutate(jobId,token,()=>{});}
type ResearchCallBudget={inputTokens?:number;maxOutputTokens?:number;pendingOutputTokens?:number;reserveCalls?:number;reserveOutputTokens?:number};
// Account for every returned generation even when parsing or validation fails.
export async function recordResearchUsage(jobId:string,token:string,usage:ResearchUsage){
  const input=usage.inputTokens??0,output=usage.outputTokens??0;
  if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)throw new Error('Invalid research usage.');
  return mutate(jobId,token,(_tx,job)=>{job.inputTokens+=input;job.outputTokens+=output;});
}
function callBudget(request:ResearchCallBudget) {
  const values={input:request.inputTokens??0,output:request.maxOutputTokens??0,pending:request.pendingOutputTokens??0,reserveCalls:request.reserveCalls??0,reserveOutput:request.reserveOutputTokens??0};
  if(Object.values(values).some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Invalid research request budget.');
  return values;
}
function enforceCallBudget(job:ResearchJob,request:ResearchCallBudget,additionalCalls:number) {
  const {input,output,pending,reserveCalls,reserveOutput}=callBudget(request);
  if(job.attemptedCalls+additionalCalls+reserveCalls>job.limits.maxCalls||job.inputTokens+input>job.limits.maxInputTokens||job.outputTokens+pending+output+reserveOutput>job.limits.maxOutputTokens)
    throw new ResearchJobError('Research budget reached.','budget_exhausted');
}
export async function reserveResearchCall(jobId: string,token: string,request:ResearchCallBudget={}) {
  callBudget(request);
  return mutate(jobId,token,(_tx,job)=>{enforceCallBudget(job,request,1);job.attemptedCalls++;});
}
/** Validate a stage's already-reserved first generation against its actual input. */
export async function checkResearchModelBudget(jobId:string,token:string,request:ResearchCallBudget) {
  callBudget(request);
  return mutate(jobId,token,(_tx,job)=>{enforceCallBudget(job,request,0);});
}
/** Charge before dispatch, including failed requests and attempts from prior leases. */
export async function reserveResearchToolCall(jobId:string,token:string) {
  return mutate(jobId,token,(_tx,job)=>{if(job.attemptedToolCalls>=job.limits.maxToolCalls)throw new ResearchJobError('Research tool budget reached.','budget_exhausted');job.attemptedToolCalls++;});
}
// Validate the actual constructed request, rather than every saved output in the job.
export async function checkResearchInputBudget(jobId:string,token:string,inputTokens:number) {
  if(!Number.isSafeInteger(inputTokens)||inputTokens<0)throw new Error('Invalid research input estimate.');
  return mutate(jobId,token,(_tx,job)=>{if(job.inputTokens+inputTokens>job.limits.maxInputTokens)
    throw new ResearchJobError('Research input budget reached.','budget_exhausted');});
}
// Preserve a usable assessment when optional work would consume the final report budget.
export async function finalizeResearchFromSavedAssessment(jobId:string,token:string) {
  return mutate(jobId,token,(_tx,job)=>{
    if(!['assess','followup'].includes(job.stage)||!job.outputs.assess)throw new Error('No saved assessment is available for finalization.');
    if(job.attemptedCalls>=job.limits.maxCalls||job.outputTokens+6000>job.limits.maxOutputTokens)
      throw new ResearchJobError('No final report budget remains.','budget_exhausted');
    const stage=job.stage,message='Research limits reserved the final report budget. Remaining new evidence was not fully assessed; the report uses the last completed assessment.';
    job.outputs.assess={...job.outputs.assess,gaps:[...new Set([...(job.outputs.assess.gaps||[]),message])]};
    job.journal.push({stage,nextStage:'synthesize',skipped:true,completedAt:now(),output:{reason:'final_report_budget'}});
    job.stage='synthesize';job.events.push(event('synthesize',message));
  });
}
export async function completeResearchStep(jobId: string,token: string,stage: ResearchStage,output: unknown,nextStage: ResearchStage,message=stageLabels[stage],usage: ResearchUsage={}) {
  if(!stages.includes(stage)||!stages.includes(nextStage))throw new Error('Unknown research stage.');
  return mutate(jobId,token,(_tx,job)=>{
    if(job.stage!==stage) {
      const last=job.journal.at(-1);if(last?.stage===stage&&last.nextStage===nextStage&&JSON.stringify(last.output)===JSON.stringify(output))return;
      throw new Error('Research stage is no longer current.');
    }
    const bytes=Buffer.byteLength(JSON.stringify(output));if(bytes>250000)throw new Error('Research step exceeds its storage limit.');
    const inputTokens=Number(usage.inputTokens??0),outputTokens=Number(usage.outputTokens??0);if(!Number.isSafeInteger(inputTokens)||inputTokens<0||!Number.isSafeInteger(outputTokens)||outputTokens<0)throw new Error('Invalid research usage.');
    if(stage==='followup'){if(job.rounds>=job.limits.maxRounds)throw new Error('Research follow-up limit reached.');job.rounds++;job.outputs.followup=[...(job.outputs.followup||[]),output];}
    else if(stage==='read')job.outputs.read=[...(job.outputs.read||[]),output];
    else job.outputs[stage]=output;job.journal.push({stage,nextStage,round:job.rounds,output,completedAt:now()});job.stage=nextStage;job.inputTokens+=inputTokens;job.outputTokens+=outputTokens;job.safeError=null;
    // Public progress is generated from fixed stage labels, never raw provider errors or output.
    job.events.push(event(stage,stageLabels[stage]));job.events=job.events.slice(-40);
    void message;
  });
}
export async function finishResearchJob(jobId: string,token: string) {return mutate(jobId,token,(_tx,job)=>{if(job.stage!=='publish')throw new Error('Research is not ready to publish.');job.status='completed';job.token=null;job.leaseExpires=0;job.safeError=null;job.events.push(event('publish','Research complete.'));});}
export async function failResearchJob(jobId: string,token: string,safeMessage: string,options: {retryAt?:string;retryable?:boolean;errorCode?:string}={}) {
  return mutate(jobId,token,(_tx,job)=>{
    if(options.retryAt&&!Number.isFinite(Date.parse(options.retryAt)))throw new Error('Invalid retry time.');
    const exhausted=job.attemptedCalls>=job.limits.maxCalls,retryable=options.retryable===true&&!exhausted;
    job.status=retryable?'retry_pending':'failed';job.retryAt=retryable?(options.retryAt||new Date(Date.now()+60000).toISOString()):null;
    const messages:Record<string,string>={RATE_LIMIT:'Google rate-limited the research request.',INCOMPLETE_OUTPUT:'The research response ended before its assessment was complete.',PROVIDER_UNAVAILABLE:'The research provider is temporarily unavailable.',PROVIDER_REJECTED:'The research provider rejected the request. Check its configuration.',BUDGET_EXHAUSTED:'This research reached its request or token limit.'};
    job.safeError=`${messages[options.errorCode||'']||'Research could not finish.'} ${exhausted?'This job has reached its request limit. ':''}Saved evidence is preserved.${exhausted?'':' You can retry from the last saved step.'}`;
    job.token=null;job.leaseExpires=0;job.events.push(event(job.stage,job.safeError));void safeMessage;
  });
}
export async function releaseResearchJob(jobId: string,token: string) {return mutate(jobId,token,(_tx,job)=>{job.status='queued';job.token=null;job.leaseExpires=0;});}
export async function cancelResearchJob(purchaseId: string,userId: string) {
  return transaction(async tx=>{if(!await purchase(tx,purchaseId,userId))throw new Error('Shopping item not found.');const result=await tx.execute({sql:"SELECT * FROM research_jobs WHERE purchase_id=? AND user_id=? AND status NOT IN ('completed','cancelled','superseded')",args:[purchaseId,userId]});for(const row of result.rows){const job=read(row);job.status='cancelled';job.token=null;job.leaseExpires=0;job.retryAt=null;job.updatedAt=now();job.events.push(event(job.stage,'Research cancelled.'));await save(tx,job);}return {cancelled:true};});
}
export async function retryResearchJob(purchaseId: string,userId: string) {
  const created=await ensureResearchJob(purchaseId,userId);
  return transaction(async tx=>{const job=(await find(tx,created.id))!,row=await purchase(tx,purchaseId,userId);if(!row||stopped(row))throw new Error('Resume the shopping item before retrying research.');if(job.status==='completed'||job.status==='superseded')throw new Error('This research cannot be retried.');if(job.status==='running'&&job.leaseExpires>Date.now())return researchJobDTO(job);if(process.env.RESEARCH_RETRY_JOB_ID===job.id){const extension=Number(process.env.RESEARCH_RETRY_OUTPUT_BUDGET);if(Number.isSafeInteger(extension)&&extension>0&&extension<=196608)job.limits.maxOutputTokens=Math.max(job.limits.maxOutputTokens,extension);}if(job.attemptedCalls>=job.limits.maxCalls)throw new Error('Research budget reached. Edit the brief to start a new bounded research job.');job.status='queued';job.token=null;job.leaseExpires=0;job.retryAt=null;job.safeError=null;job.updatedAt=now();job.events.push(event(job.stage,'Research queued from the last saved step.'));await save(tx,job);return researchJobDTO(job);});
}
