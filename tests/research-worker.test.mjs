import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const afterCallbacks=[];
globalThis.__miranaResearchTestAfter=afterCallbacks;
registerHooks({resolve(specifier,context,next){
  if(specifier==='next/server')return {url:'data:text/javascript,export function after(fn){globalThis.__miranaResearchTestAfter.push(fn)}',shortCircuit:true};
  if(specifier.startsWith('@/'))return next(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
  try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}
}});
const directory=await mkdtemp(join(tmpdir(),'mirana-research-worker-'));
const keys=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','NODE_ENV','APP_ORIGIN','AUTH_PREVIEW_MODE','MIRANA_DEMO_MODE','OPENAI_API_KEY','GOOGLE_API_KEY','GOOGLE_CLOUD_PROJECT','RESEARCH_PROVIDER','RESEND_API_KEY','OFFER_VERIFIER_URL','OFFER_VERIFIER_SECRET','RESEARCH_MAX_CALLS','RESEARCH_MAX_TOOL_CALLS','RESEARCH_MAX_ROUNDS','RESEARCH_MAX_INPUT_TOKENS','RESEARCH_MAX_OUTPUT_TOKENS','RESEARCH_STEP_TIMEOUT_MS','RESEARCH_LOG_LEVEL'];
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch;let networkAttempts=0,client;
try {
  for(const key of keys)delete process.env[key];
  process.env.RESEARCH_LOG_LEVEL='off';
  process.env.TURSO_DATABASE_URL=`file:${join(directory,'worker.db')}`;process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://127.0.0.1:5176';process.env.AUTH_PREVIEW_MODE='false';process.env.RESEARCH_STEP_TIMEOUT_MS='10000';
  globalThis.fetch=async()=>{networkAttempts++;throw new Error('Network is forbidden in this isolated worker integration test.');};
  const {databaseClient}=await import('../lib/database.ts');client=databaseClient();
  const sql=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');await client.batch(sql.split(';').map(s=>s.trim()).filter(Boolean),'write');
  const jobs=await import('../lib/research-jobs.ts'),{runResearchJob,runWorker}=await import('../lib/worker.ts'),{saveResearchResult}=await import('../lib/automation.ts'),{hash}=await import('../lib/auth.ts');
  const api=await import('../app/api/research/route.ts');
  const checkedAt=new Date().toISOString();
  const report={summary:'Previous or newly researched product evidence.',checkedAt,products:[],recommendedId:null,excluded:[],needsClarification:[]};
  const brief={briefRevision:1,requestText:'A quiet new air purifier for a small bedroom',budget:20000,topN:3,category:'Home',postcode:'600019',condition:'New only',customTags:['Quiet','Serviceable'],alerts:{enabled:false,mode:'interval',intervalHours:24,rule:'history'}};
  await client.execute({sql:'INSERT INTO workspace (id,settings) VALUES (?,?)',args:['owner',JSON.stringify({profile:{postcode:'600019',priorities:[],customTags:[]},email:'verified@example.invalid'})]});
  const insert=async(id,b=brief,previous=null,userId='owner')=>client.execute({sql:'INSERT INTO purchases (id,user_id,brief,report,status,updated_at) VALUES (?,?,?,?,?,?)',args:[id,userId,JSON.stringify(b),previous?JSON.stringify(previous):null,'queued',new Date().toISOString()]});
  const row=async id=>(await client.execute({sql:'SELECT * FROM purchases WHERE id=?',args:[id]})).rows[0];
  const create=async(id,b=brief,previous=null)=>{await insert(id,b,previous);return jobs.ensureResearchJob(id,'owner');};
  const stagesSeen=[];
  const runner=async(stage,context)=>{
    stagesSeen.push(stage);assert.deepEqual(context.purchase.customTags,['Quiet','Serviceable']);assert.equal(context.purchase.alerts,undefined);
    const usage={provider:'vertex',model:'isolated-fake',inputTokens:10,outputTokens:20,thinkingTokens:0,searchQueries:0};
    if(stage==='plan')return {output:{criteria:['Quiet','New only'],questions:['Filter availability']},nextStage:'gather',usage};
    if(stage==='gather')return {output:{round:0,sources:[{url:'https://example.invalid/product',title:'Research fixture',excerpts:['Quiet purifier']}],facts:[],notes:'Evidence gaps'},nextStage:'assess',usage};
    if(stage==='assess')return {output:{gaps:['Retailer delivery unknown'],followupQuestions:['Check delivery'],sufficient:false},nextStage:'followup',usage};
    if(stage==='followup')return {output:{round:(context.outputs.followup||[]).length+1,sources:[],facts:[],notes:'No new evidence'},nextStage:'assess',usage};
    if(stage==='synthesize')return {output:{report,parsed:{category:'Home',budget:20000}},nextStage:'verify',usage};
    if(stage==='verify')return {output:{report,parsed:{category:'Home',budget:20000},observations:[]},nextStage:'publish'};
    throw new Error('Unexpected fake stage');
  };
  // Checkpoint limit permits a new invocation without repeating completed or already-metered work.
  const checkpoint=await create('checkpoint');
  assert.deepEqual(await runResearchJob(checkpoint.id,{maxSteps:1},runner),{status:'pending',steps:1});
  let view=await jobs.getResearchJob('checkpoint','owner');assert.equal(view.stage,'gather');assert.equal(view.status,'queued');assert.equal(view.limits.attemptedCalls,1);assert.equal(view.events.filter(e=>e.stage==='plan').length,2);
  const resumed=await runResearchJob(checkpoint.id,{},runner);assert.equal(resumed.status,'completed');assert.deepEqual(stagesSeen,['plan','gather','assess','followup','assess','followup','assess','synthesize','verify']);
  view=await jobs.getResearchJob('checkpoint','owner');assert.equal(view.status,'completed');assert.equal(view.rounds,2);assert.equal(view.limits.attemptedCalls,8);assert.equal((await row('checkpoint')).status,'ready');assert.deepEqual(JSON.parse((await row('checkpoint')).report),report);
  assert.equal((await runResearchJob(checkpoint.id,{},runner)).status,'busy');
  // Optional research leaves room for the final report, without raising saved limits.
  const boundedOutput=await create('output-budget'),budgetStages=[];
  const outputRunner=async(stage,context)=>{budgetStages.push(stage);const result=await runner(stage,context);if(result.usage)result.usage.outputTokens=6000;return result;};
  assert.equal((await runResearchJob(boundedOutput.id,{},outputRunner)).status,'completed');
  assert.deepEqual(budgetStages,['plan','gather','assess','synthesize','verify']);
  const budgetView=await jobs.getResearchJob('output-budget','owner');assert.equal(budgetView.limits.attemptedCalls,4);assert.ok(budgetView.coverage.gaps.some(g=>g.includes('Follow-up limits')));
  // Recovery can use a previous assessment when only the final report fits, preserving new evidence.
  const recovery=await create('budget-recovery'),recoveryClaim=await jobs.claimResearchJob(recovery.id);
  await jobs.reserveResearchCall(recovery.id,recoveryClaim.token);await jobs.completeResearchStep(recovery.id,recoveryClaim.token,'plan',{},'gather',undefined,{outputTokens:6000});
  await jobs.reserveResearchCall(recovery.id,recoveryClaim.token);await jobs.completeResearchStep(recovery.id,recoveryClaim.token,'gather',{},'assess',undefined,{outputTokens:6000});
  await jobs.reserveResearchCall(recovery.id,recoveryClaim.token);await jobs.completeResearchStep(recovery.id,recoveryClaim.token,'assess',{gaps:['Stock unknown'],claimLedger:{candidates:[]}},'followup',undefined,{outputTokens:3000});
  await jobs.reserveResearchCall(recovery.id,recoveryClaim.token);await jobs.completeResearchStep(recovery.id,recoveryClaim.token,'followup',{notes:'New unassessed evidence stays private'},'assess',undefined,{outputTokens:3000});
  await jobs.releaseResearchJob(recovery.id,recoveryClaim.token);const recoveryStages=[];
  assert.equal((await runResearchJob(recovery.id,{},async(stage,context)=>{recoveryStages.push(stage);return runner(stage,context);})).status,'completed');
  assert.deepEqual(recoveryStages,['synthesize','verify']);assert.equal((await jobs.getResearchJob('budget-recovery','owner')).limits.attemptedCalls,5);
  assert.ok((await jobs.getResearchJob('budget-recovery','owner')).coverage.gaps.some(g=>g.includes('last completed assessment')));
  // Crash after call reservation/checkpoint but before lease release preserves both attempt and completed work.
  const crashed=await create('crash'),claim=await jobs.claimResearchJob(crashed.id);await jobs.reserveResearchCall(crashed.id,claim.token);await jobs.completeResearchStep(crashed.id,claim.token,'plan',{criteria:['Quiet']},'gather');
  await client.execute({sql:'UPDATE research_jobs SET lease_expires=? WHERE id=?',args:[Date.now()-1,crashed.id]});
  const restartStages=[];assert.equal((await runResearchJob(crashed.id,{maxSteps:1},async(...args)=>{restartStages.push(args[0]);return runner(...args);})).status,'pending');assert.deepEqual(restartStages,['gather']);assert.equal((await jobs.getResearchJob('crash','owner')).limits.attemptedCalls,2);
  // A retryable provider exception retains the previous report and completed plan.
  const previous={...report,summary:'Previously reviewed evidence must survive.'},failure=await create('failure',brief,previous);
  await runResearchJob(failure.id,{maxSteps:1},runner);
  const providerFailure=Object.assign(new Error('Private upstream response body'),{retryable:true});
  assert.equal((await runResearchJob(failure.id,{},async()=>{throw providerFailure;})).status,'retry_pending');
  view=await jobs.getResearchJob('failure','owner');assert.equal(view.stage,'gather');assert.equal(view.limits.attemptedCalls,2);assert.deepEqual(JSON.parse((await row('failure')).report),previous);assert.equal(JSON.stringify(view).includes('Private upstream'),false);
  // A rate-limited last attempt cannot schedule or advertise an impossible retry.
  process.env.RESEARCH_MAX_CALLS='1';const quotaExhausted=await create('quota-exhausted');delete process.env.RESEARCH_MAX_CALLS;
  const quotaFailure=Object.assign(new Error('SECRET-CANARY upstream response'),{retryable:true,code:'RATE_LIMIT',statusCode:429});
  assert.equal((await runResearchJob(quotaExhausted.id,{},async()=>{throw quotaFailure;})).status,'failed');
  const quotaView=await jobs.getResearchJob('quota-exhausted','owner');assert.equal(quotaView.status,'failed');assert.equal(quotaView.retryAt,null);assert.equal(quotaView.limits.attemptedCalls,1);
  assert.match(quotaView.error,/Google rate-limited/);assert.match(quotaView.error,/request limit/);assert.equal(JSON.stringify(quotaView).includes('SECRET-CANARY'),false);
  await assert.rejects(jobs.retryResearchJob('quota-exhausted','owner'),/budget reached/i);
  // Cancellation during an outstanding call prevents its output from becoming a checkpoint/report.
  const cancelled=await create('inflight-cancel',brief,previous);
  const stopped=await runResearchJob(cancelled.id,{},async(stage,context)=>{await jobs.cancelResearchJob('inflight-cancel','owner');return runner(stage,context);});
  assert.equal(stopped.status,'superseded');view=await jobs.getResearchJob('inflight-cancel','owner');assert.equal(view.status,'cancelled');assert.equal(view.stage,'plan');assert.deepEqual(JSON.parse((await row('inflight-cancel')).report),previous);
  // Concurrent invocations cannot dispatch another billable call while one holds a current lease.
  const concurrent=await create('concurrent');let release,start;const waiting=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{start=resolve;});let calls=0;
  const running=runResearchJob(concurrent.id,{maxSteps:1},async(stage,context)=>{calls++;start();await waiting;return runner(stage,context);});await started;
  assert.equal((await runResearchJob(concurrent.id,{maxSteps:1},runner)).status,'busy');release();await running;assert.equal(calls,1);
  // Saver's SQL job/lease guard rejects cancellation even without any purchase timestamp mutation.
  const atomic=await create('atomic-cancel',brief,previous),atomicClaim=await jobs.claimResearchJob(atomic.id);
  for(const [stage,next] of [['plan','gather'],['gather','assess'],['assess','synthesize'],['synthesize','verify'],['verify','publish']])await jobs.completeResearchStep(atomic.id,atomicClaim.token,stage,{},next);
  const before=await row('atomic-cancel');await jobs.cancelResearchJob('atomic-cancel','owner');assert.equal((await row('atomic-cancel')).updated_at,before.updated_at);
  await assert.rejects(saveResearchResult({purchaseId:'atomic-cancel',expectedUpdatedAt:before.updated_at,report,preserveBrief:true,researchJobId:atomic.id,researchLeaseToken:atomicClaim.token}),error=>error.status===409);
  assert.deepEqual(JSON.parse((await row('atomic-cancel')).report),previous);
  // Alert preferences may change during research without invalidating the immutable buying brief.
  const alert=await create('alert-edit');await runResearchJob(alert.id,{maxSteps:1},runner);const alertRow=await row('alert-edit');
  await client.execute({sql:'UPDATE purchases SET brief=?,updated_at=? WHERE id=?',args:[JSON.stringify({...brief,alerts:{...brief.alerts,enabled:true,intervalHours:48},nextCheckAt:new Date().toISOString()}),new Date().toISOString(),'alert-edit']});
  assert.equal((await jobs.ensureResearchJob('alert-edit','owner')).id,alert.id);assert.equal((await runResearchJob(alert.id,{maxSteps:1},runner)).status,'pending');assert.equal((await jobs.getResearchJob('alert-edit','owner')).stage,'assess');assert.equal(JSON.parse(alertRow.brief).briefRevision,1);
  const edited=await create('brief-edit');
  const editResult=await runResearchJob(edited.id,{},async(stage,context)=>{await client.execute({sql:'UPDATE purchases SET brief=?,updated_at=? WHERE id=?',args:[JSON.stringify({...brief,briefRevision:2,budget:15000}),new Date().toISOString(),'brief-edit']});return runner(stage,context);});
  assert.equal(editResult.status,'superseded');assert.equal(await jobs.getResearchJob('brief-edit','owner'),null);
  // Scheduled saved-offer checks remain independent of AI setup and never rediscover candidates.
  await insert('watch-without-ai',{...brief,alerts:{...brief.alerts,enabled:true},nextCheckAt:'2020-01-01T00:00:00.000Z'},report);
  await client.execute({sql:"UPDATE purchases SET status='ready' WHERE id=?",args:['watch-without-ai']});
  const watched=await runWorker({purchaseId:'watch-without-ai',userId:'owner'});
  assert.equal(watched.status,'complete');assert.equal(watched.processed,1);
  assert.equal(await jobs.getResearchJob('watch-without-ai','owner'),null);
  assert.equal(networkAttempts,0);assert.equal((await row('watch-without-ai')).status,'ready');
  // Real authenticated route boundaries with after() captured, not scheduled/provider execution.
  const token='isolated-owner-session',otherToken='isolated-other-session';
  for(const [id,value] of [['owner',token],['other',otherToken]])await client.execute({sql:'INSERT INTO sessions (id,user,expires) VALUES (?,?,?)',args:[await hash(value),JSON.stringify({id,name:id,email:`${id}@example.invalid`,preview:false}),Date.now()+600000]});
  const request=(method,data=null,session=token,headers={})=>new Request(`http://127.0.0.1:5176/api/research${method==='GET'?`?purchaseId=${data}`:''}`,{method,headers:{origin:process.env.APP_ORIGIN,...(session?{cookie:`mirana_session=${session}`} :{}),...(method==='GET'?{}:{'content-type':'application/json'}),...headers},...(method==='GET'?{}:{body:JSON.stringify(data)})});
  assert.equal((await api.GET(request('GET','checkpoint'))).status,200);assert.equal((await api.GET(request('GET','checkpoint',otherToken))).status,404);assert.equal((await api.GET(request('GET','checkpoint',null))).status,401);assert.equal((await api.GET(request('GET',''))).status,400);
  assert.equal((await api.PATCH(request('PATCH',{purchaseId:'concurrent',action:'cancel'},otherToken))).status,404);assert.equal((await api.PATCH(request('PATCH',{purchaseId:'concurrent',action:'cancel'},null))).status,401);
  assert.equal((await api.PATCH(request('PATCH',{purchaseId:'concurrent',action:'cancel'},token,{origin:'https://evil.invalid'}))).status,409);assert.equal((await jobs.getResearchJob('concurrent','owner')).status,'queued');
  assert.equal((await api.PATCH(request('PATCH',{purchaseId:'concurrent',action:'cancel'}))).status,200);
  const apiJob=await create('api-job');process.env.OPENAI_API_KEY='isolated-fake-credential';process.env.RESEARCH_PROVIDER='openai';
  assert.equal((await api.POST(request('POST',{purchaseId:'api-job'},otherToken))).status,404);assert.equal((await api.POST(request('POST',{purchaseId:'api-job'},token,{'sec-fetch-site':'cross-site'}))).status,400);
  const posted=await api.POST(request('POST',{purchaseId:'api-job'}));assert.equal(posted.status,202);const postedBody=await posted.json();assert.equal(postedBody.job.id,apiJob.id);assert.equal(postedBody.job.purchase,undefined);assert.equal(postedBody.job.outputs,undefined);assert.equal(postedBody.job.token,undefined);assert.equal(afterCallbacks.length,1);
  assert.equal(networkAttempts,0);assert.equal((await client.execute('SELECT count(*) AS count FROM notifications')).rows[0].count,0);
  // SDK callbacks count every generation, without double charging the pre-reserved first call.
  const sdkJob=await create('sdk-accounting');let modelDispatches=0,toolDispatches=0;
  const sdkRunner=async(stage,context)=>{
    if(['plan','gather','assess','synthesize'].includes(stage)){await context.beforeModelCall(100,200);modelDispatches++;}
    if(stage==='gather'){
      await context.beforeToolCall('rainforest','fetch_product_listing');toolDispatches++;
      await context.beforeToolCall('serpapi','search_products_india');toolDispatches++;
      await context.beforeModelCall(300,200);modelDispatches++;
    }
    const result=await runner(stage,context);if(stage==='assess')result.nextStage='synthesize';return result;
  };
  assert.equal((await runResearchJob(sdkJob.id,{},sdkRunner)).status,'completed');
  const sdkView=await jobs.getResearchJob('sdk-accounting','owner');assert.equal(modelDispatches,5);assert.equal(sdkView.limits.attemptedCalls,5);assert.equal(toolDispatches,2);assert.equal(sdkView.limits.attemptedToolCalls,2);
  // A blocked callback does not dispatch; cancellation fences tool and model callbacks too.
  const callbackCancel=await create('sdk-cancel');let afterCancelDispatches=0;
  assert.equal((await runResearchJob(callbackCancel.id,{maxSteps:1},async(stage,context)=>{
    await context.beforeModelCall(100,200);await jobs.cancelResearchJob('sdk-cancel','owner');
    await assert.rejects(async()=>{await context.beforeToolCall('rainforest','fetch_product_listing');afterCancelDispatches++;},error=>error.code==='lease_lost');
    await assert.rejects(async()=>{await context.beforeModelCall(100,200);afterCancelDispatches++;},error=>error.code==='lease_lost');
    return runner(stage,context);
  })).status,'superseded');
  assert.equal(afterCancelDispatches,0);assert.equal((await jobs.getResearchJob('sdk-cancel','owner')).limits.attemptedToolCalls,0);
  // A model loop stops before it can spend the final assessment/synthesis calls.
  process.env.RESEARCH_MAX_CALLS='5';const sdkReserve=await create('sdk-final-reserve');delete process.env.RESEARCH_MAX_CALLS;
  const reserveStages=[];let deniedExtraCalls=0;
  assert.equal((await runResearchJob(sdkReserve.id,{},async(stage,context)=>{
    reserveStages.push(stage);
    if(['plan','gather','assess','synthesize'].includes(stage))await context.beforeModelCall(100,200);
    if(stage==='gather'){
      await context.beforeModelCall(200,200);
      await assert.rejects(async()=>{await context.beforeModelCall(300,200);deniedExtraCalls++;},error=>error.code==='budget_exhausted');
    }
    const result=await runner(stage,context);if(stage==='assess')result.nextStage='synthesize';return result;
  })).status,'completed');
  assert.equal(deniedExtraCalls,0);assert.deepEqual(reserveStages,['plan','gather','assess','synthesize','verify']);assert.equal((await jobs.getResearchJob('sdk-final-reserve','owner')).limits.attemptedCalls,5);
  // Failed requests remain charged when the stage is retried.
  const sdkFailure=await create('sdk-failure');
  assert.equal((await runResearchJob(sdkFailure.id,{maxSteps:1},async(_stage,context)=>{await context.beforeModelCall(100,200);await context.beforeToolCall('keepa','amazon_price_history');throw providerFailure;})).status,'retry_pending');
  const failedView=await jobs.getResearchJob('sdk-failure','owner');assert.equal(failedView.limits.attemptedCalls,1);assert.equal(failedView.limits.attemptedToolCalls,1);
  await jobs.retryResearchJob('sdk-failure','owner');
  await runResearchJob(sdkFailure.id,{maxSteps:1},async(stage,context)=>{await context.beforeModelCall(100,200);return runner(stage,context);});
  assert.equal((await jobs.getResearchJob('sdk-failure','owner')).limits.attemptedCalls,2);assert.equal((await jobs.getResearchJob('sdk-failure','owner')).limits.attemptedToolCalls,1);
  // Returned usage survives validation failure; checkpoint completion must
  // not double-charge tokens already recorded by the model callback.
  const metered=await create('metered-failure');
  const observed={provider:'vertex',model:'gemini-3.8-flash',inputTokens:11,outputTokens:7,thinkingTokens:5,searchQueries:0};
  assert.equal((await runResearchJob(metered.id,{maxSteps:1},async(_stage,context)=>{
    await context.beforeModelCall(100,200);await context.onModelUsage(observed);
    throw Object.assign(new Error('Truncated generation'),{code:'INCOMPLETE_OUTPUT'});
  })).status,'failed');
  const meteredPayload=async()=>JSON.parse((await client.execute({sql:'SELECT payload FROM research_jobs WHERE id=?',args:[metered.id]})).rows[0].payload);
  assert.equal((await meteredPayload()).outputTokens,12);
  await jobs.retryResearchJob('metered-failure','owner');
  await runResearchJob(metered.id,{maxSteps:1},async(stage,context)=>{
    await context.beforeModelCall(100,200);await context.onModelUsage(observed);
    return {...await runner(stage,context),usage:observed};
  });
  assert.equal((await meteredPayload()).outputTokens,24);
  // The final model call can assess evidence; rendering the validated ledger
  // then completes without resetting counters or making a ninth generation.
  process.env.RESEARCH_MAX_CALLS='4';const lastCall=await create('last-assessment-call');delete process.env.RESEARCH_MAX_CALLS;
  const lastLease=await jobs.claimResearchJob(lastCall.id);
  await jobs.reserveResearchCall(lastCall.id,lastLease.token);await jobs.completeResearchStep(lastCall.id,lastLease.token,'plan',{},'gather');
  await jobs.reserveResearchCall(lastCall.id,lastLease.token);await jobs.completeResearchStep(lastCall.id,lastLease.token,'gather',{},'assess');
  await jobs.reserveResearchCall(lastCall.id,lastLease.token);await jobs.releaseResearchJob(lastCall.id,lastLease.token);
  let renderedWithoutModel=false;
  assert.equal((await runResearchJob(lastCall.id,{},async(stage,context)=>{
    if(['plan','gather','assess'].includes(stage))await context.beforeModelCall(100,200);
    const result=await runner(stage,context);
    if(stage==='assess')result.output.claimLedger={candidates:[],gaps:['No supported exact variant']};
    if(stage==='synthesize'){renderedWithoutModel=context.finalizeWithoutModel;delete result.usage;}
    return result;
  })).status,'completed');
  assert.equal(renderedWithoutModel,true);assert.equal((await jobs.getResearchJob('last-assessment-call','owner')).limits.attemptedCalls,4);
  console.log('PASS: worker checkpoints/crash resume, bounded research, prior report retention, in-flight cancellation, concurrent dispatch, atomic publication fencing, brief/alert edits, authenticated API ownership, token usage retained across failure without double counting; no network or email');
}finally{globalThis.fetch=originalFetch;delete globalThis.__miranaResearchTestAfter;client?.close();await rm(directory,{recursive:true,force:true});for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
