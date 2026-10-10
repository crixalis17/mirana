import {verifierConfigured} from './research/offer-verifier';
import {starter,defaultProfile} from './seed';
import {database} from './database';
import {normalizePreferences} from './preferences';
import {guard} from './origin';
import {researchProviderConfigured} from './research/provider';
export {guard} from './origin';
export const db=()=>database;
const emptyProfile=defaultProfile;
export function schedulerMinIntervalHours(){return 24;}
export function researchReady(){return researchProviderConfigured();}
export async function initialize(userId:string){
  await db().prepare('INSERT OR IGNORE INTO workspace (id,settings) VALUES (?,?)').bind(userId,JSON.stringify({profile:emptyProfile,schedule:'pending'})).run();
  if(process.env.NODE_ENV!=='production'&&process.env.MIRANA_DEMO_MODE==='true'&&userId==='local-demo'){
    await db().prepare('INSERT OR IGNORE INTO purchases (id,user_id,brief,report,status,updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM purchases WHERE user_id=?)').bind('local-demo-tablet',userId,JSON.stringify({...starter,requestText:starter.usage,topN:3,productUrl:'',alerts:{enabled:false,mode:'interval',intervalHours:24,rule:'history',targetPrice:null},parsed:null}),null,'queued',new Date().toISOString(),userId).run();
  }
}
export async function readWorkspace(userId:string){
  await initialize(userId);
  const [p,s,o,global]=await Promise.all([
    db().prepare('SELECT * FROM purchases WHERE user_id=? ORDER BY updated_at DESC').bind(userId).all(),
    db().prepare('SELECT settings FROM workspace WHERE id=?').bind(userId).first(),
    db().prepare('SELECT o.purchase_id,o.payload FROM observations o JOIN purchases p ON p.id=o.purchase_id WHERE p.user_id=?').bind(userId).all(),
    db().prepare('SELECT settings FROM workspace WHERE id=?').bind('system').first(),
  ]);
  const settings={...JSON.parse((s as any).settings),...(global?JSON.parse((global as any).settings):{})};
  // Adapt legacy labels for display without rewriting saved profiles or captured briefs.
  const profile=settings.profile||emptyProfile;
  return {purchases:p.results.map((r:any)=>{const captured=JSON.parse(r.brief);return {...captured,...normalizePreferences(captured),id:r.id,report:r.report?JSON.parse(r.report):null,status:r.status,updatedAt:r.updated_at}}),
    settings:{...settings,profile:{...profile,...normalizePreferences(profile)},researchReady:researchReady(),offerVerificationReady:verifierConfigured(),schedulerMinIntervalHours:schedulerMinIntervalHours()},
    observations:o.results.map((r:any)=>({...JSON.parse(r.payload),purchaseId:r.purchase_id}))};
}
export async function body(request:Request){guard(request);if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('Send JSON.');const raw=await request.text();if(raw.length>300000)throw new Error('Request is too large.');return JSON.parse(raw);}
export const fail=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Request failed.'},{status:400});
const clean=(v:any,n:number)=>typeof v==='string'?v.trim().slice(0,n):'';
export function alerts(a:any={}){
  const interval=Number(a.intervalHours??24),hour=Number(a.dailyHour??10);
  if(!Number.isInteger(interval)||interval<1||interval>168||!Number.isInteger(hour)||hour<0||hour>23)throw new Error('Invalid daily alert schedule.');
  if(a.enabled===true&&((a.mode!=='daily'&&interval!==24)||(a.mode==='daily'&&hour!==10)))throw new Error('Deal checks run once every 24 hours at approximately 10 AM IST.');
  const rule=a.rule==='target'?'target':'history',targetPrice=a.targetPrice?Number(a.targetPrice):null;
  if(rule==='target'&&(!targetPrice||!Number.isFinite(targetPrice)||targetPrice<1||targetPrice>10000000))throw new Error('Enter a valid target price.');
  return {enabled:a.enabled===true,mode:'daily',intervalHours:24,dailyHour:10,rule,targetPrice};
}
export function validUrl(v:any){if(typeof v!=='string')return false;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)&&!u.hostname.endsWith('.local')}catch{return false}}
export function brief(d:any,profile:any,previous?:any){const captured=normalizePreferences(previous||profile);const preferences=normalizePreferences({priorities:Object.prototype.hasOwnProperty.call(d,'priorities')?d.priorities:captured.priorities,customTags:Object.prototype.hasOwnProperty.call(d,'customTags')?d.customTags:captured.customTags});const brand=clean(d.brand,100),modelName=clean(d.modelName,160);if(!brand||!modelName)throw new Error('Enter the brand and model name. Other details are optional.');const requestText=clean(d.requestText,6000)||`${brand} ${modelName}`;const productUrl=clean(d.productUrl,2000);if(requestText.length<5&&!productUrl)throw new Error('Describe what you want or add a product link.');if(productUrl&&!validUrl(productUrl))throw new Error('Use a public HTTPS product link.');const topMatch=requestText.match(/top\s*(\d+)/i);const topN=Number(d.topN||topMatch?.[1]||3);if(!Number.isInteger(topN)||topN<1||topN>20)throw new Error('Choose 1–20 recommendations.');const budgetMatch=requestText.match(/(?:₹|rs\.?\s*|inr\s*)(\d[\d,]*(?:\.\d+)?)\s*(k|lakh)?/i);const inferred=budgetMatch?Number(budgetMatch[1].replace(/,/g,''))*(budgetMatch[2]?.toLowerCase()==='k'?1000:budgetMatch[2]?.toLowerCase()==='lakh'?100000:1):null;const budget=d.budget?Number(d.budget):inferred;if(budget!==null&&(!Number.isFinite(budget)||budget<1||budget>10000000))throw new Error('Enter a valid budget.');const postcode=clean(d.postcode===undefined?(previous?.postcode??profile.postcode):d.postcode,20);if(postcode&&!/^\d{6}$/.test(postcode))throw new Error('Enter a six-digit Indian postcode or leave it blank.');const categories=[['Tablet',/tablet|ipad|galaxy tab/i],['Laptop',/laptop|macbook|notebook computer/i],['Phone',/phone|iphone|smartphone/i],['Audio',/headphone|earbud|speaker|audio/i],['Camera',/camera|lens/i],['Home',/fridge|refrigerator|washing machine|vacuum|furniture|mattress|kitchen|coffee/i],['Fitness',/fitness|treadmill|cycle|sports/i]] as const;const category=categories.find(([,re])=>re.test(requestText))?.[0]||'Product';return {brand,modelName,title:clean(d.title,100)||`${brand} ${modelName}`,requestText,usage:requestText,productUrl,topN,budget,category,size:'',priorities:preferences.priorities,customTags:preferences.customTags,condition:'New only',banks:clean(d.banks===undefined?(previous?.banks??profile.banks):d.banks,200),postcode,country:'India',currency:'INR',alerts:alerts(d.alerts===undefined?previous?.alerts:d.alerts),parsed:null};}
export function validateReport(r:any,topN=3){if(!r||typeof r.summary!=='string'||!Array.isArray(r.products)||r.products.length>topN)throw new Error('A report needs a summary and no more than the requested top N products.');if(!r.checkedAt||!Number.isFinite(Date.parse(r.checkedAt)))throw new Error('Report needs a valid checkedAt timestamp.');if(r.products.length&&r.recommendedId!==r.products[0].id)throw new Error('The #1 recommendation must be the first ranked product.');for(const p of r.products){if(!p.id||!p.name||!Array.isArray(p.pros)||!Array.isArray(p.cons)||!Array.isArray(p.sources)||!Array.isArray(p.offers))throw new Error('Incomplete product evidence.');for(const s of [...p.sources,...p.offers])if(!validUrl(s.url))throw new Error('Evidence links must be public HTTPS.');for(const o of p.offers){if(!Number.isFinite(Date.parse(o.checkedAt)))throw new Error('Offers need a checkedAt timestamp.');if(o.price!==null&&(!Number.isFinite(o.price)||o.price<0))throw new Error('Invalid price.');if(o.total!==null&&o.total!==undefined&&(!Number.isFinite(o.total)||o.total<0))throw new Error('Invalid total.');}}return r;}
