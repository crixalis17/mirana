import {createHash} from 'node:crypto';
import {canFetchListing, sourceKey} from '../research';

export type SourceKind='official'|'retailer'|'review'|'owner'|'unknown';
export type SourceAccessStatus='read'|'blocked'|'timeout'|'unsupported'|'disallowed'|'error';
export type SourceQuote={text:string;start:number;end:number};
export type ListingApiProvenance={kind:'provider-api-json';provider:'brightdata';tool:'fetch_product_listing';endpoint:string;payloadHash:string;requestedUrl:string;exactId:string;providerUpdatedAt:string|null;retrieval:'on-demand-scraper';representation:'field-projection';fields:string[]};
export type ProviderPageProvenance={kind:'provider-page-extraction';provider:'firecrawl'|'tavily';tool:'read_source_firecrawl'|'read_source_tavily';endpoint:string;payloadHash:string;requestedUrl:string;retrieval:'on-demand-extraction';representation:'markdown'|'text';cacheStatus:'unknown'};
export type SourceProvenance=ListingApiProvenance|ProviderPageProvenance;
export type ReadSource={url:string;title:string;sourceKind:SourceKind;accessStatus:SourceAccessStatus;retrievedAt:string;publishedAt:string|null;contentHash:string|null;bodyText:string;paragraphs:string[];quotes:SourceQuote[];textTrust:'untrusted-original-page'|'untrusted-provider-api-json'|'untrusted-provider-page';provenance?:SourceProvenance;truncated:boolean;note:string};
export const SOURCE_READER_LIMITS={maxSources:12,concurrency:3,timeoutMs:8000,maxBodyBytes:1048576,maxTextChars:12000,maxRoundTextChars:36000,maxQuoteChars:1200,maxRoundQuoteChars:6000} as const;
const reviews=new Set(['notebookcheck.net','www.notebookcheck.net','rtings.com','www.rtings.com','gsmarena.com','www.gsmarena.com','trustedreviews.com','www.trustedreviews.com','androidauthority.com','www.androidauthority.com']);
const owners=new Set(['reddit.com','www.reddit.com']);
const retailers=new Set(['amazon.in','www.amazon.in','flipkart.com','www.flipkart.com','croma.com','www.croma.com','reliancedigital.in','www.reliancedigital.in']);
const skipTags=new Set(['nav','header','footer','aside','svg','canvas','template','iframe','object','button','select','textarea']);
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const paragraphTags=new Set(['p','div','section','article','main','h1','h2','h3','h4','h5','h6','li','tr','br','hr','blockquote','pre']);
const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',copy:'©',reg:'®',trade:'™',bull:'•',euro:'€',pound:'£',yen:'¥'};
export function decodeSourceEntities(text:string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,(entity,key:string)=>{
    if(key.startsWith('#')){const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):' ';}
    return entities[key.toLowerCase()]??entity;
  });
}
function normalize(text:string) {return decodeSourceEntities(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/[\t\r ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function attributes(tag:string) {
  const out:Record<string,string>={};
  for(const match of tag.matchAll(/\b([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))out[match[1].toLowerCase()]=decodeSourceEntities(match[2]??match[3]??match[4]??'');
  return out;
}
function publishedDate(value:unknown):string|null {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return null;const date=new Date(value);return Number.isFinite(date.getTime())&&date.toISOString().startsWith(value.slice(0,10))&&date.getTime()<=Date.now()+86400000?date.toISOString():null;}
function metadata(html:string) {
  let publishedAt:string|null=null;
  for(const meta of html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)){const attrs=attributes(meta[0]);if(['article:published_time','datepublished','pubdate','publishdate','date'].includes((attrs.property||attrs.name||'').toLowerCase()))publishedAt=publishedAt||publishedDate(attrs.content);}
  const title=normalize(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||'').slice(0,500);
  return {title,publishedAt};
}
// This is bounded plain-text extraction, not a DOM renderer or an accuracy assertion.
export function readableSourceHtml(html:string) {
  const meta=metadata(html);
  let page=html.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
  // Static product details can live inside noscript or checkout forms. Retain their
  // text, while dropping explicit sign-in forms and all interactive field values.
  page=page.replace(/<form\b[^>]*>[\s\S]*?(?:<\/form\s*>|$)/gi,form=>
    /<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(form)||/<form\b[^>]*(?:login|sign[-_ ]?in|auth)/i.test(form)?'':form);
  page=page.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1]||page.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1]||page.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1]||page;
  const stack:Array<{name:string;suppressed:boolean}>=[],parts:string[]=[];
  for(const match of page.matchAll(/<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)){
    const token=match[0];
    if(!token.startsWith('<')){if(!stack.at(-1)?.suppressed)parts.push(token);continue;}
    const name=token.match(/^<\/?\s*([a-z][a-z0-9:-]*)/i)?.[1]?.toLowerCase();if(!name)continue;
    if(token.startsWith('</')){const position=stack.map(item=>item.name).lastIndexOf(name);if(position>=0)stack.splice(position);if(paragraphTags.has(name)&&!stack.at(-1)?.suppressed)parts.push('\n\n');continue;}
    const hidden=/\shidden(?:\s|=|\/?>)/i.test(token)||attributes(token)['aria-hidden']==='true'||/\bstyle\s*=\s*['"][^'"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(token);
    const suppressed=!!stack.at(-1)?.suppressed||skipTags.has(name)||hidden;
    if(paragraphTags.has(name)&&!suppressed)parts.push('\n\n');
    if(!voidTags.has(name)&&!token.endsWith('/>')){if(stack.length>=128)break;stack.push({name,suppressed});}
  }
  return {...meta,text:normalize(parts.join(''))};
}
function readableJson(value:unknown) {
  const strings:string[]=[];let visited=0,publishedAt:string|null=null,title='';
  function walk(node:unknown,depth=0){if(visited++>=200||depth>10)return;if(typeof node==='string'){strings.push(node);return;}if(Array.isArray(node)){for(const child of node.slice(0,40))walk(child,depth+1);return;}if(node&&typeof node==='object')for(const [key,child]of Object.entries(node).slice(0,40)){if(['title','headline','name'].includes(key)&&!title&&typeof child==='string')title=normalize(child).slice(0,500);if(key==='datePublished')publishedAt=publishedAt||publishedDate(child);if(!['script','style','html','url','@context','@type'].includes(key))walk(child,depth+1);}}
  walk(value);return {title,publishedAt,text:normalize(strings.join('\n\n'))};
}
export function sourcePageKind(url:string):SourceKind {const key=sourceKey(url);if(!key)return 'unknown';const host=new URL(key).hostname;if(reviews.has(host))return 'review';if(owners.has(host))return 'owner';if(canFetchListing(key))return retailers.has(host)?'retailer':'official';return 'unknown';}
// Only registered literal page-reading adapters may enter the quote ledger.
// The adapter validates the full provider response before recording its hash;
// this guard independently checks the persisted bounded snapshot and attribution.
export function providerPageProvenanceValid(source:{url:string;title:string;sourceKind:string;accessStatus:string;retrievedAt:string;bodyText:string;contentHash:string|null;textTrust:string;provenance?:SourceProvenance}):boolean {
  const origin=source.provenance,url=sourceKey(source.url);
  if(source.textTrust!=='untrusted-provider-page'||origin?.kind!=='provider-page-extraction'||!url||url!==source.url||origin.requestedUrl!==url||
    source.accessStatus!=='read'||sourcePageKind(url)==='unknown'||source.sourceKind!==sourcePageKind(url)||
    origin.retrieval!=='on-demand-extraction'||origin.cacheStatus!=='unknown'||!/^[a-f0-9]{64}$/.test(origin.payloadHash)||!Number.isFinite(Date.parse(source.retrievedAt))||
    source.bodyText.length<80||source.bodyText.length>SOURCE_READER_LIMITS.maxTextChars||source.title.length>500||
    source.contentHash!==createHash('sha256').update(source.bodyText).digest('hex')||humanVerification(source.title,source.bodyText))return false;
  if([...new URL(url).searchParams.keys()].some(name=>/(?:token|api.?key|secret|auth|password|credential)/i.test(name)))return false;
  return origin.provider==='firecrawl'&&origin.tool==='read_source_firecrawl'&&['https://api.firecrawl.dev/v2/scrape','https://mcp.firecrawl.dev/v2/mcp'].includes(origin.endpoint)&&origin.representation==='markdown'||
    origin.provider==='tavily'&&origin.tool==='read_source_tavily'&&origin.endpoint==='https://api.tavily.com/extract'&&origin.representation==='text';
}
function empty(url:string,status:SourceAccessStatus,note:string):ReadSource {return {url:sourceKey(url)||url.slice(0,2000),title:'',sourceKind:sourcePageKind(url),accessStatus:status,retrievedAt:new Date().toISOString(),publishedAt:null,contentHash:null,bodyText:'',paragraphs:[],quotes:[],textTrust:'untrusted-original-page',truncated:false,note};}
function textSnapshot(source:ReadSource,text:string,textLimit:number,quoteLimit:number):ReadSource {
  const bodyText=text.slice(0,Math.max(0,textLimit));const paragraphs=bodyText.split(/\n\n+/).filter(Boolean).slice(0,80);const quotes:SourceQuote[]=[];let remaining=Math.max(0,quoteLimit),cursor=0;
  for(const paragraph of paragraphs){if(!remaining||quotes.length>=4)break;const start=bodyText.indexOf(paragraph,cursor);if(start<0)continue;const quote=paragraph.slice(0,Math.min(400,remaining));quotes.push({text:quote,start,end:start+quote.length});remaining-=quote.length;cursor=start+paragraph.length;}
  const truncated=source.truncated||text.length>bodyText.length;
  return {...source,bodyText,paragraphs,quotes,contentHash:createHash('sha256').update(bodyText).digest('hex'),truncated,note:truncated?'Original page read; stored text is truncated and incomplete.':'Original page read; source statements remain untrusted.'};
}
async function readChunk(reader:ReadableStreamDefaultReader<Uint8Array>,signal:AbortSignal) {
  signal.throwIfAborted();
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    reader.read().then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted)abort();
  });
}
async function cancelBody(response:Response) {try{await response.body?.cancel();}catch{/* Body may already be locked or cancelled. */}}
export function humanVerification(title:string,text:string) {
  const titleChallenge=/^(?:just a moment\.*|robot check|access denied|captcha(?: challenge| verification)?|verify (?:that )?you are human)(?:\s*(?:[|–—-].*)|[.!?]*)?$/i.test(title.trim());
  if(titleChallenge)return true;
  // Strong gate wording near the beginning plus a generic gate/store title; ordinary review discussion is retained.
  const genericTitle=/^(?:amazon(?:\.in|\.com)?|reddit|access check|security check|verification|untitled)?$/i.test(title.trim());
  if(!genericTitle)return false;
  const beginning=text.slice(0,600).replace(/^(?:amazon(?:\.in|\.com)?|reddit)\s*/i,'').trim();
  return /^(?:robot check|verify (?:that )?you are human|enter the characters you see (?:below|in (?:the|this) image)|type the characters you see in (?:the|this) image|sorry,? we just need to make sure you(?:'|’)re not a robot|checking your browser before accessing)/i.test(beginning);
}
export async function readSourcePage(url:string,signal?:AbortSignal,options:{fetch?:typeof fetch}={}):Promise<ReadSource> {
  const key=sourceKey(url);if(!key||sourcePageKind(key)==='unknown')return empty(url,'disallowed','Source host is outside the approved reader allowlist.');
  const result=empty(key,'error','Original source could not be read.');
  if(/\.pdf$/i.test(new URL(key).pathname))return {...result,accessStatus:'unsupported',note:'PDF reading is not supported.'};
  const boundedSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(SOURCE_READER_LIMITS.timeoutMs)]);
  let response:Response|undefined;
  try {
    boundedSignal.throwIfAborted();
    response=await (options.fetch??fetch)(key,{redirect:'manual',credentials:'omit',headers:{'User-Agent':'Mirana/1.0 original-source-reader','Accept':'text/html, application/json'},signal:boundedSignal});
    if(response.status>=300&&response.status<400||[401,403,407,429,451].includes(response.status)){await cancelBody(response);return {...result,accessStatus:'blocked',note:'Source access is restricted or redirects are refused.'};}
    if(!response.ok){await cancelBody(response);return result;}
    const type=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if(type!=='text/html'&&type!=='application/json'){await cancelBody(response);return {...result,accessStatus:'unsupported',note:'Source format is not supported.'};}
    const declared=Number(response.headers.get('content-length')||0);
    if(type==='application/json'&&declared>SOURCE_READER_LIMITS.maxBodyBytes){await cancelBody(response);return {...result,note:'Source body exceeds the reader size limit.'};}
    const reader=response.body?.getReader();if(!reader)return result;
    const chunks:Uint8Array[]=[];let size=0,bodyTruncated=false;
    try {while(true){boundedSignal.throwIfAborted();const chunk=await readChunk(reader,boundedSignal);if(chunk.done)break;
      const remaining=SOURCE_READER_LIMITS.maxBodyBytes-size;
      chunks.push(chunk.value.subarray(0,remaining));size+=Math.min(chunk.value.byteLength,remaining);
      if(chunk.value.byteLength>remaining||size===SOURCE_READER_LIMITS.maxBodyBytes){bodyTruncated=true;await reader.cancel();break;}}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    boundedSignal.throwIfAborted();
    if(bodyTruncated&&type==='application/json')return {...result,note:'Source body exceeds the reader size limit.'};
    const raw=Buffer.concat(chunks).toString('utf8');const content=type==='text/html'?readableSourceHtml(raw):readableJson(JSON.parse(raw));
    if(humanVerification(content.title,content.text))return {...result,title:content.title,accessStatus:'blocked',note:'Source requests an access or human-verification check.'};
    if(content.text.length<80)return {...result,title:content.title,accessStatus:'unsupported',note:'Source contains insufficient readable original text; dynamic content may require an approved adapter.'};
    return textSnapshot({...result,title:content.title,publishedAt:content.publishedAt,accessStatus:'read',truncated:bodyTruncated},content.text,SOURCE_READER_LIMITS.maxTextChars,SOURCE_READER_LIMITS.maxQuoteChars);
  } catch {if(response)await cancelBody(response);return {...result,accessStatus:boundedSignal.aborted?'timeout':'error',note:boundedSignal.aborted?'Source read was interrupted or exceeded its time limit.':'Original source could not be read.'};}
}
export async function readSourcePages(sources:Array<{url:string;title?:string}>,signal?:AbortSignal,options:{maxSources?:number}={}):Promise<ReadSource[]> {
  const maximum=Math.max(0,Math.min(SOURCE_READER_LIMITS.maxSources,Number.isInteger(options.maxSources)?options.maxSources!:SOURCE_READER_LIMITS.maxSources));
  const unique=new Map<string,{url:string;title?:string}>();for(const source of sources){const key=sourceKey(source.url)||source.url;if(!unique.has(key))unique.set(key,{...source,url:key});}
  const selected=[...unique.values()].slice(0,maximum),results:ReadSource[]=new Array(selected.length);let next=0;
  await Promise.all(Array.from({length:Math.min(SOURCE_READER_LIMITS.concurrency,selected.length)},async()=>{while(next<selected.length){const index=next++;results[index]=await readSourcePage(selected[index].url,signal);}}));
  // Give every readable document a share before large early pages can use the round budget.
  const readable=results.filter(source=>source.accessStatus==='read').sort((a,b)=>a.bodyText.length-b.bodyText.length);
  const allocations=new Map<ReadSource,{text:number;quotes:number}>();
  let textRemaining=SOURCE_READER_LIMITS.maxRoundTextChars,quoteRemaining=SOURCE_READER_LIMITS.maxRoundQuoteChars,count=readable.length;
  for(const source of readable){const text=Math.min(source.bodyText.length,SOURCE_READER_LIMITS.maxTextChars,Math.floor(textRemaining/count));
    const quotes=Math.min(text,SOURCE_READER_LIMITS.maxQuoteChars,Math.floor(quoteRemaining/count));
    allocations.set(source,{text,quotes});textRemaining-=text;quoteRemaining-=quotes;count--;}
  return results.map(source=>{const allocation=allocations.get(source);return allocation?textSnapshot(source,source.bodyText,allocation.text,allocation.quotes):source;});
}
