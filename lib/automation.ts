import {db,validateReport,validUrl} from './store';
import {sendDeal} from './email';
import {nextCheck} from './deals';
export class AutomationError extends Error {constructor(message:string,readonly status=400){super(message);}}
export async function getResearchQueue(options:{all?:boolean,limit?:number,purchaseId?:string,userId?:string}={}){
  let sql="SELECT * FROM purchases WHERE status NOT IN ('paused','bought')";const args:string[]=[];
  if(options.purchaseId){sql+=' AND id=?';args.push(options.purchaseId);}
  if(options.userId){sql+=' AND user_id=?';args.push(options.userId);}
  sql+=' ORDER BY updated_at ASC';
  const p=await db().prepare(sql).bind(...args).all();const now=Date.now();
  let queue=p.results.map((r:any)=>({...JSON.parse(r.brief),id:r.id,userId:r.user_id,status:r.status,updatedAt:r.updated_at,report:r.report?JSON.parse(r.report):null})).filter((p:any)=>(!p.retryAt||Date.parse(p.retryAt)<=now)&&(options.all||p.status==='queued'||p.alerts?.enabled&&(!p.nextCheckAt||Date.parse(p.nextCheckAt)<=now)));
  if(options.limit!==undefined)queue=queue.slice(0,Math.max(0,Math.min(options.limit,100)));
  const observations=queue.length?(await db().prepare(`SELECT purchase_id,payload FROM observations WHERE purchase_id IN (${queue.map(()=>'?').join(',')})`).bind(...queue.map((p:any)=>p.id)).all()).results.map((r:any)=>({...JSON.parse(r.payload),purchaseId:r.purchase_id})):[];
  return {queue,observations,instructions:{sources:['Official manufacturer stores','Amazon India','Flipkart','Other reputable Indian stores when useful'],reportFields:['summary','checkedAt','recommendedId','products','excluded'],productFields:['id','name','variant','verdict','fit','pros','cons','offers','sources','dealAssessment'],offerFields:['retailer','url','price','total','checkedAt','availability','delivery','accessories','condition','verified','deliveryVerified','sellerReliable','mandatoryCostsVerified'],note:'Use exact variants and verified complete costs. No unverified bank savings. No padding the shortlist. Email eligibility is evaluated by the server.'}};
}
export async function setSchedule(schedule:string,lastRun?:string){
  if(!['active','pending','error'].includes(schedule))throw new Error('Invalid schedule state.');
  const settings:{schedule:string,lastRun?:string}={schedule};if(lastRun)settings.lastRun=lastRun;
  await db().prepare('INSERT INTO workspace (id,settings) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings').bind('system',JSON.stringify(settings)).run();
}
export async function acquireLease(name:string,ttlMs=300000){
  const token=crypto.randomUUID(),now=Date.now();
  const row=await db().prepare('INSERT INTO job_leases (name,token,expires) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE job_leases.expires<=? RETURNING token').bind(name,token,now+Math.max(1000,Math.min(ttlMs,600000)),now).first();
  return row?.token===token?token:null;
}
export async function releaseLease(name:string,token:string){await db().prepare('DELETE FROM job_leases WHERE name=? AND token=?').bind(name,token).run();}
export async function recordResearchFailure(purchaseId:string,expectedUpdatedAt:string,message:string,retryAt:string){
  if(!Number.isFinite(Date.parse(retryAt)))throw new Error('Invalid retry timestamp.');
  await db().prepare("UPDATE purchases SET brief=json_set(brief,'$.researchError',?,'$.retryAt',?),updated_at=? WHERE id=? AND updated_at=? AND status NOT IN ('paused','bought')").bind(message.slice(0,500),retryAt,new Date().toISOString(),purchaseId,expectedUpdatedAt).run();
}
export async function saveResearchResult(d:any){
if(d.settings){await setSchedule(d.settings.schedule,d.settings.lastRun);return {ok:true}}if(typeof d.purchaseId!=='string')throw new Error('Missing purchaseId.');const row=await db().prepare('SELECT * FROM purchases WHERE id=?').bind(d.purchaseId).first() as any;if(!row)throw new AutomationError('Purchase not found.',404);if(['paused','bought'].includes(row.status))throw new Error('This purchase is not being monitored.');if(d.expectedUpdatedAt!==row.updated_at)throw new AutomationError('Request changed during research. Reload the queue before writing.',409);const p={...JSON.parse(row.brief),id:row.id};delete p.researchError;delete p.retryAt;const r=validateReport(d.report,p.topN||3);const obs=d.observations||[];if(!Array.isArray(obs)||obs.length>100)throw new Error('Invalid observations.');const statements=[];if(d.parsed){p.parsed=d.parsed;if(p.budget===null&&Number.isFinite(d.parsed.budget)&&d.parsed.budget>0&&d.parsed.budget<=10000000)p.budget=d.parsed.budget;if(typeof d.parsed.category==='string')p.category=d.parsed.category.slice(0,80);}p.nextCheckAt=nextCheck(p.alerts||{},r.checkedAt);for(const o of obs){if(!o.id||!o.productId||!o.variant||!o.retailer||!validUrl(o.url)||!Number.isFinite(o.price)||o.price<0||!Number.isFinite(Date.parse(o.checkedAt)))throw new Error('Invalid observation.');statements.push(db().prepare("INSERT OR IGNORE INTO observations (id,purchase_id,payload) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM purchases WHERE id=? AND updated_at=? AND status NOT IN ('paused','bought'))").bind(String(o.id),d.purchaseId,JSON.stringify(o),d.purchaseId,d.expectedUpdatedAt))}statements.push(db().prepare("UPDATE purchases SET brief=?,report=?,status=?,updated_at=? WHERE id=? AND updated_at=? AND status NOT IN ('paused','bought')").bind(JSON.stringify(p),JSON.stringify(r),'ready',new Date().toISOString(),d.purchaseId,d.expectedUpdatedAt));const saved=await db().batch(statements);if(saved[saved.length-1].meta.changes!==1)throw new AutomationError('Request changed. No report or email was published.',409);const previous=await db().prepare('SELECT payload FROM observations WHERE purchase_id=?').bind(p.id).all();const w=await db().prepare('SELECT settings FROM workspace WHERE id=?').bind(row.user_id).first() as any;const email=w?JSON.parse(w.settings).email:null;const notification=await sendDeal(p,r,previous.results.map((o:any)=>JSON.parse(o.payload)),email);await db().prepare("UPDATE workspace SET settings=json_set(settings,'$.lastRun',?) WHERE id=?").bind(r.checkedAt,row.user_id).run();return {ok:true,notification}
}
