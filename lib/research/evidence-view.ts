import {createHash} from 'node:crypto';
import {databaseClient} from '../database';
import {getResearchJob} from '../research-jobs';
import {sourcePageKind} from './source-reader';

type Row=Record<string,unknown>;
type Env=Record<string,string|undefined>;
type ViewOptions={env?:Env;includeOriginalText?:boolean};
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const rows=(value:unknown,max=40)=>Array.isArray(value)?value.slice(0,max).map(row):[];
const toolNames=new Set(['search_products_india','fetch_product_listing','amazon_price_history','search_web_tavily','read_source_tavily','search_web_firecrawl','read_source_firecrawl','read_source_page','search_web_mcp','read_source_mcp','google_search']);
const providers=new Set(['product-api','web-api','original-page','serpapi-mcp','brightdata-mcp','serpapi','brightdata','keepa','tavily','firecrawl','google']);
function secrets(env:Env) {
  return Object.entries(env).filter(([name,value])=>/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)&&typeof value==='string'&&value.length>=4)
    .map(([,value])=>value!).sort((a,b)=>b.length-a.length);
}
function scrub(value:string,values:string[]) {
  let text=value;for(const secret of values)text=text.replaceAll(secret,'[redacted]').replaceAll(encodeURIComponent(secret),'[redacted]');
  return text.replace(/([?&](?:api_key|token|key|secret|signature|access_token|session)=)[^\s&#"']+/gi,'$1[redacted]');
}
function text(value:unknown,values:string[],max=500):string|null {
  return typeof value==='string'&&value.trim()?scrub(value,values).slice(0,max):null;
}
function safeUrl(value:unknown,values:string[]) {
  if(typeof value!=='string'||value.length>3000)return null;
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||url.hostname.includes(':')||
      /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)||url.hostname.endsWith('.local'))return null;
    if(scrub(`${url.origin}${url.pathname}`,values)!==`${url.origin}${url.pathname}`)return null;
    for(const [name,param]of [...url.searchParams])if(/(?:key|token|secret|signature|credential|password|auth|session|email)/i.test(name)||scrub(param,values)!==param)url.searchParams.delete(name);
    url.hash='';return url.href;
  }catch{return null;}
}
function iso(value:unknown) {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}
function hash(value:unknown,values:string[]) {return typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)&&scrub(value,values)===value?value:null;}
function count(value:unknown,max=1000000) {return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?Math.min(value,max):0;}

/** Whitelisted research evidence only; never serialize the durable payload itself. */
export function researchEvidenceView(payload:unknown,options:ViewOptions={}) {
  if(typeof window!=='undefined')throw new Error('Research evidence is server-only.');
  const values=secrets(options.env??process.env),outputs=row(row(payload).outputs);
  const batches=[row(outputs.gather),...rows(outputs.followup,3)].filter(batch=>Object.keys(batch).length);
  const sources:Row[]=[],listingObservations:Row[]=[],toolCalls:Row[]=[],originalSnapshots:Row[]=[];
  const sourceKeys=new Set<string>(),observationKeys=new Set<string>(),snapshotKeys=new Set<string>();let remainingText=24000;
  for(const batch of batches){
    for(const entry of rows(batch.sources,40)){
      const url=safeUrl(entry.url,values);if(!url||sourceKeys.has(url)||sources.length>=40)continue;sourceKeys.add(url);
      sources.push({url,title:text(entry.title,values),sourceKind:sourcePageKind(url),round:count(batch.round,3)});
    }
    for(const entry of rows(batch.toolObservations,24)){
      if(!['search-result','listing-api','price-history'].includes(String(entry.kind))||!['serpapi','brightdata','keepa'].includes(String(entry.provider)))continue;
      const offer=row(entry.offer),url=safeUrl(entry.url,values),requestedUrl=safeUrl(entry.requestedUrl,values);
      const key=JSON.stringify([entry.kind,entry.provider,url,entry.exactId,entry.retrievedAt]);if(observationKeys.has(key)||listingObservations.length>=24)continue;observationKeys.add(key);
      const source=row(entry.source),freshness=row(entry.freshness);
      listingObservations.push({kind:entry.kind,provider:entry.provider,url,requestedUrl,exactId:text(entry.exactId,values,120),title:text(entry.title,values),
        retrievedAt:iso(entry.retrievedAt),providerUpdatedAt:iso(entry.providerUpdatedAt),
        freshness:{retrieval:['search-cache-bypassed','on-demand-scraper','history-only'].includes(String(freshness.retrieval))?freshness.retrieval:null,cacheStatus:'unknown',verifiedFresh:false},
        offer:Object.keys(offer).length?{url:safeUrl(offer.url,values),title:text(offer.title,values),retailer:text(offer.retailer,values,100),variant:text(offer.variant,values,200),
          seller:text(offer.seller,values,200),price:typeof offer.price==='number'&&Number.isFinite(offer.price)&&offer.price>0?offer.price:null,
          currency:offer.currency==='INR'?'INR':null,condition:text(offer.condition,values,100),availability:text(offer.availability,values,100),
          providerCollectedAt:iso(offer.providerCollectedAt),checkoutVerified:false,
          evidenceKind:['search-result','listing-extraction','historical-tracker'].includes(String(offer.evidenceKind))?offer.evidenceKind:null}:null,
        source:{url:safeUrl(source.url,values),retailerUrl:safeUrl(source.retailerUrl,values),retrievedAt:iso(source.retrievedAt),contentHash:hash(source.contentHash,values),
          responseHash:hash(source.responseHash,values),evidenceKind:['search-result','listing-extraction','historical-tracker'].includes(String(source.evidenceKind))?source.evidenceKind:null,
          textTrust:source.textTrust==='untrusted-provider-api-json'?'untrusted-provider-api-json':null,truncated:source.truncated===true}});
    }
    for(const entry of rows(batch.toolCalls,36)){
      if(!toolNames.has(String(entry.tool))||!providers.has(String(entry.provider))||toolCalls.length>=48)continue;
      toolCalls.push({tool:entry.tool,provider:entry.provider,status:['ok','unavailable','error','limited'].includes(String(entry.status))?entry.status:'error',
        sourceCount:count(entry.sourceCount),offerCount:count(entry.offerCount),elapsedMs:count(entry.elapsedMs,600000),
        ...(/^[A-Z_]{1,40}$/.test(String(entry.errorCode||''))?{errorCode:entry.errorCode}:{})});
    }
  }
  const originals=[...batches.flatMap(batch=>rows(batch.originalSources,12)),...rows(outputs.read,4).flatMap(batch=>rows(batch.sources,24))];
  for(const entry of originals){
    const url=safeUrl(entry.url,values);if(!url||sourcePageKind(url)==='unknown'||originalSnapshots.length>=24)continue;
    const contentHash=hash(entry.contentHash,values),key=`${url}|${contentHash}`;if(snapshotKeys.has(key))continue;snapshotKeys.add(key);
    const independentlyRead=entry.textTrust==='untrusted-original-page'&&entry.accessStatus==='read';
    const body=typeof entry.bodyText==='string'?entry.bodyText:'';
    const hashValid=!!contentHash&&body.length<=12000&&createHash('sha256').update(body).digest('hex')===contentHash;
    const include=options.includeOriginalText===true&&independentlyRead&&hashValid&&remainingText>0;
    const bounded=include?scrub(body,values).slice(0,Math.min(6000,remainingText)):'';remainingText-=bounded.length;
    originalSnapshots.push({url,title:text(entry.title,values),sourceKind:sourcePageKind(url),
      accessStatus:['read','blocked','timeout','unsupported','disallowed','error'].includes(String(entry.accessStatus))?entry.accessStatus:'error',
      retrievedAt:iso(entry.retrievedAt),publishedAt:iso(entry.publishedAt),contentHash,
      textTrust:['untrusted-original-page','untrusted-provider-api-json','untrusted-provider-page'].includes(String(entry.textTrust))?entry.textTrust:null,
      independentlyRead,hashValid,truncated:entry.truncated===true,
      ...(include?{bodyText:bounded,bodyTruncated:bounded.length<body.length,bodyRedacted:scrub(body,values)!==body}:{})});
  }
  return {sources,listingObservations,originalSnapshots,toolCalls,
    note:'Saved discovery and provider fields are provisional. Original snapshots are independently read only when labeled; snapshot dates do not establish current checkout, seller or postcode availability.'};
}

/** Resolve ownership and the current brief before reading its private checkpoint. */
export async function getOwnedResearchEvidence(purchaseId:string,userId:string,options:ViewOptions={}) {
  if(typeof window!=='undefined')throw new Error('Research evidence is server-only.');
  const current=await getResearchJob(purchaseId,userId);if(!current)return null;
  const result=await databaseClient().execute({sql:'SELECT j.payload FROM research_jobs j JOIN purchases p ON p.id=j.purchase_id AND p.user_id=j.user_id WHERE j.id=? AND j.user_id=? AND j.purchase_id=? AND j.brief_revision=?',
    args:[current.id,userId,purchaseId,current.briefRevision]});
  if(!result.rows[0]||typeof result.rows[0].payload!=='string')return null;
  const latest=await getResearchJob(purchaseId,userId);if(!latest||latest.id!==current.id)return null;
  return researchEvidenceView(JSON.parse(result.rows[0].payload),options);
}
