import {createHash} from 'node:crypto';
import {allowedProductUrl,type ProductObservation} from './product-tools';
import {SOURCE_READER_LIMITS,type ReadSource} from './source-reader';

const rawFields=new Set(['url','title','name','final_price','price','currency','variant_id','variant','seller_name','seller','condition','availability','timestamp','brand','model','description','features','included_components']);
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
// Only the registered exact-listing adapter can supply provisional API evidence.
// Search, historical prices and arbitrary MCP output never become merchant proof.
export function listingApiSnapshots(observations:ProductObservation[]):ReadSource[] {
  const selected:ReadSource[]=[];
  for(const observation of observations.slice(0,12)){
    const source=observation.source,url=allowedProductUrl(observation.url,true);
    if(observation.kind!=='listing-api'||observation.provider!=='brightdata'||!url||url!==allowedProductUrl(observation.requestedUrl,true)||
      url!==allowedProductUrl(source?.retailerUrl,true)||!observation.exactId||source?.evidenceKind!=='listing-extraction'||
      source.textTrust!=='untrusted-provider-api-json'||source.url!=='https://api.brightdata.com/datasets/v3/scrape'||source.truncated||
      source.contentHash!==hash(source.bodyText)||!/^[a-f0-9]{64}$/.test(source.responseHash)||!Number.isFinite(Date.parse(observation.retrievedAt)))continue;
    let row:Record<string,unknown>;
    try{const parsed=JSON.parse(source.bodyText);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))continue;row=parsed;}catch{continue;}
    if(allowedProductUrl(row.url,true)!==url)continue;
    const title=typeof row.title==='string'?row.title:typeof row.name==='string'?row.name:null;
    if(!title||title!==observation.title||title!==observation.offer?.title)continue;
    const identity=new URL(url),id=identity.hostname.endsWith('amazon.in')?identity.pathname.split('/').pop():identity.searchParams.get('pid')??identity.pathname.split('/').pop();
    if(id!==observation.exactId)continue;
    const projection:Record<string,unknown>={};
    // A small projection prevents carousel/recommended-product fields from being
    // quoted as this SKU. Values remain literal provider values, never prose.
    for(const [key,value]of Object.entries(row))if(rawFields.has(key)){
      if(typeof value==='string')projection[key]=value.slice(0,4000);
      else if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null)projection[key]=value;
      else if(Array.isArray(value)&&value.every(item=>typeof item==='string'))projection[key]=value.slice(0,20).map(item=>item.slice(0,400));
    }
    const text=JSON.stringify(projection,null,2),bodyText=text.slice(0,SOURCE_READER_LIMITS.maxTextChars);
    if(bodyText.length<40)continue;
    selected.push({url,title:title.slice(0,500),sourceKind:'retailer',accessStatus:'read',retrievedAt:observation.retrievedAt,publishedAt:null,
      contentHash:hash(bodyText),bodyText,paragraphs:[bodyText],quotes:[],textTrust:'untrusted-provider-api-json',truncated:text.length>bodyText.length,
      provenance:{kind:'provider-api-json',provider:'brightdata',tool:'fetch_product_listing',endpoint:source.url,payloadHash:source.responseHash,
        requestedUrl:url,exactId:observation.exactId,providerUpdatedAt:observation.providerUpdatedAt,retrieval:'on-demand-scraper',representation:'field-projection',fields:Object.keys(projection)},
      note:'Third-party on-demand listing API, projected literal fields. Price freshness, postcode delivery, bank eligibility, complete cost and checkout remain unverified.'});
  }
  // Bound the combined API quote input independently of provider response sizes.
  const perSource=Math.floor(SOURCE_READER_LIMITS.maxRoundTextChars/Math.max(1,selected.length));
  return selected.map(source=>{const bodyText=source.bodyText.slice(0,perSource);return {...source,bodyText,paragraphs:[bodyText],contentHash:hash(bodyText),truncated:source.truncated||bodyText.length<source.bodyText.length};});
}

// Prefer actual readable evidence across rounds. A failed later read must not
// erase an earlier snapshot. Original text takes precedence over API projection.
export function mergeSourceSnapshots(pages:ReadSource[],apiSources:ReadSource[],maxSources:number=SOURCE_READER_LIMITS.maxSources):ReadSource[]{
  const chosen=new Map<string,ReadSource>();
  const rank=(source:ReadSource)=>source.accessStatus==='read'&&source.bodyText?(source.textTrust==='untrusted-original-page'?2:1):0;
  for(const source of [...pages,...apiSources]){
    const key=allowedProductUrl(source.url,true)||source.url,existing=chosen.get(key);
    if(!existing||rank(source)>rank(existing)||rank(source)===rank(existing)&&Date.parse(source.retrievedAt)>=Date.parse(existing.retrievedAt))chosen.set(key,source);
  }
  const selected=[...chosen.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,maxSources);
  const readableCount=selected.filter(source=>source.bodyText).length;
  const share=Math.floor(SOURCE_READER_LIMITS.maxRoundTextChars/Math.max(1,readableCount));
  return selected.map(source=>{
    const bodyText=source.bodyText.slice(0,Math.min(share,SOURCE_READER_LIMITS.maxTextChars));
    if(bodyText===source.bodyText)return source;
    return {...source,bodyText,paragraphs:[bodyText],quotes:[],contentHash:hash(bodyText),truncated:true};
  });
}
