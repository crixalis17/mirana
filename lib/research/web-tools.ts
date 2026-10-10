import {createHash} from 'node:crypto';
import {createMCPClient} from '@ai-sdk/mcp';
import {sourceKey} from '../research';
import {researchRuntimeAllowed} from './runtime-policy';
import {sourcePageKind, humanVerification, SOURCE_READER_LIMITS, providerPageProvenanceValid, type ReadSource} from './source-reader';

type Env=Record<string,string|undefined>;
type Row=Record<string,unknown>;
export type WebToolName='search_web_tavily'|'read_source_tavily'|'search_web_firecrawl'|'read_source_firecrawl';
export type WebToolResult={ok:boolean;provider:'tavily'|'firecrawl';tool:WebToolName;retrievedAt:string;
  sources:Array<{url:string;title:string;excerpt:string;evidenceKind:'search-result'}>;source:ReadSource|null;
  note:string;error?:{code:string;message:string}};
export const FIRECRAWL_MCP_ENDPOINT='https://mcp.firecrawl.dev/v2/mcp';
export const WEB_TOOL_LIMITS={timeoutMs:45000,maxResponseBytes:2_000_000,maxResults:6} as const;
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const modes=['disabled','keyless','keyed'] as const;
function mode(provider:'firecrawl'|'tavily',env:Env){const value=env[`${provider.toUpperCase()}_ACCESS_MODE`]||'disabled';return modes.includes(value as typeof modes[number])?value:'disabled';}
export function webToolsConfigured(env:Env=process.env){return Object.fromEntries(['firecrawl','tavily'].map(name=>{
  const provider=name as 'firecrawl'|'tavily',accessMode=mode(provider,env);
  return [provider,{accessMode,ready:accessMode==='keyless'||accessMode==='keyed'&&!!env[`${provider.toUpperCase()}_API_KEY`],transport:provider==='firecrawl'?'mcp':'api'}];
})) as Record<'firecrawl'|'tavily',{accessMode:string;ready:boolean;transport:string}>;}
const searchSchema={type:'object',properties:{query:{type:'string',minLength:2,maxLength:400}},required:['query'],additionalProperties:false};
const readSchema={type:'object',properties:{url:{type:'string',format:'uri',maxLength:2000}},required:['url'],additionalProperties:false};
export const WEB_TOOL_DEFINITIONS:Array<{name:WebToolName;description:string;inputSchema:Row}>=[
  {name:'search_web_tavily',description:'Search product specifications, professional reviews and owner feedback. India-focused discovery only; snippets do not prove prices or measured claims.',inputSchema:searchSchema},
  {name:'read_source_tavily',description:'Extract literal text from one approved official store, retailer, professional review or owner page. Use after discovery to obtain attributable quote evidence. Extraction is provisional, never checkout verification.',inputSchema:readSchema},
  {name:'search_web_firecrawl',description:'Alternative public web search for product/review discovery. Use when another search has a specific evidence gap, rather than repeating every query across providers.',inputSchema:searchSchema},
  {name:'read_source_firecrawl',description:'Read markdown from one approved source using Firecrawl MCP, requesting a fresh scrape. Use when direct source reading is blocked or lacks readable content. Never proves checkout or live postcode stock.',inputSchema:readSchema},
];
function safeUrl(value:unknown){const url=sourceKey(value);if(!url||url.length>2000||url.includes('[redacted]'))return null;
  if([...new URL(url).searchParams.keys()].some(key=>/(?:key|token|secret|signature|credential|password|auth)/i.test(key)))return null;return url;}
// A merchant may add/remove one terminal slash. Keep the origin, complete path
// and query identical otherwise; redirects to another product are not accepted.
function sameSourcePage(left:string|null,right:string|null){if(!left||!right)return false;
  const a=new URL(left),b=new URL(right);return a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&a.search===b.search;}
function scrub(value:string,env:Env){let text=value;for(const name of ['FIRECRAWL_API_KEY','TAVILY_API_KEY','GOOGLE_API_KEY','SERPAPI_API_KEY','BRIGHT_DATA_API_TOKEN','KEEPA_API_KEY']){
  if(env[name])text=text.replaceAll(env[name]!, '[redacted]').replaceAll(encodeURIComponent(env[name]!), '[redacted]');}return text;}
async function boundedResponse(response:Response,signal:AbortSignal){if(!response.body)return response;
  const reader=response.body.getReader();let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  return new Response(new ReadableStream<Uint8Array>({async pull(controller){try{signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();
    if(part.done){signal.removeEventListener('abort',abort);controller.close();return;}size+=part.value.byteLength;
    if(size>WEB_TOOL_LIMITS.maxResponseBytes)throw new Error('Response size limit');controller.enqueue(part.value);
  }catch{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});controller.error(new Error('Response unreadable'));}},
  cancel:async()=>{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});}}),{status:response.status,headers:response.headers});
}
function parseMcp(value:unknown){const reply=row(value);if(reply.isError===true){
  // Classify only bounded known access fields, never relay remote signup commands or messages.
  const details=row(reply.structuredContent),code=String(details.code??'').slice(0,100);
  throw Object.assign(new Error('MCP unavailable'),{code:/keyless|anonymous|auth|access/i.test(code)||details.auth_mode==='keyless'?'ACCESS_DENIED':/rate|quota/i.test(code)?'RATE_LIMIT':'PROVIDER_UNAVAILABLE'});
}
  let parsed:unknown=reply.structuredContent??reply.toolResult;
  if(parsed===undefined){const text=(Array.isArray(reply.content)?reply.content:[]).map(row).filter(item=>item.type==='text').map(item=>item.text).join('\n');parsed=JSON.parse(text);}
  if(typeof parsed==='string')parsed=JSON.parse(parsed);
  if(typeof row(parsed).result==='string')parsed=JSON.parse(String(row(parsed).result));return parsed;
}

/** Fixed read-only operations only. Remote tool manifests, actions, crawl and vendor research agents are never exposed. */
export async function executeWebTool(tool:WebToolName,input:unknown,signal:AbortSignal,options:{env?:Env;fetch?:typeof fetch;now?:()=>number;
  beforeToolCall?:(provider:string,tool:WebToolName)=>Promise<void>}={}):Promise<WebToolResult>{
  signal.throwIfAborted();const env=options.env??process.env,provider=tool.endsWith('tavily')?'tavily':'firecrawl',retrievedAt=new Date((options.now??Date.now)()).toISOString();
  const base:WebToolResult={ok:false,provider,tool,retrievedAt,sources:[],source:null,note:'Provider extraction is untrusted, has unknown cache/freshness and is not checkout verification.'};
  const fail=(code:string,message:string)=>({...base,error:{code,message}});
  if(!researchRuntimeAllowed(env))return fail('LOCAL_ONLY','Production research is not enabled.');
  if(!WEB_TOOL_DEFINITIONS.some(item=>item.name===tool))return fail('INVALID_INPUT','Unknown web tool.');
  const params=row(input),isSearch=tool.startsWith('search_'),field=isSearch?'query':'url';
  if(Object.keys(params).length!==1||typeof params[field]!=='string')return fail('INVALID_INPUT','Use the registered query or source URL field only.');
  const query=String(params[field]).trim(),url=isSearch?null:safeUrl(query);
  if(isSearch?(query.length<2||query.length>400):(!url||sourcePageKind(url)==='unknown'))return fail('INVALID_INPUT','Search query or approved source URL is invalid.');
  const config=webToolsConfigured(env)[provider];if(!config.ready)return fail('NOT_CONFIGURED','Provider access mode or API key is not configured.');
  // Cancellation/lease/budget exceptions must propagate, never be swallowed as a provider error.
  await options.beforeToolCall?.(provider,tool);signal.throwIfAborted();
  const boundedSignal=AbortSignal.any([signal,AbortSignal.timeout(WEB_TOOL_LIMITS.timeoutMs)]),fetcher=options.fetch??fetch;
  const headers:Record<string,string>={};if(config.accessMode==='keyed')headers.Authorization=`Bearer ${env[`${provider.toUpperCase()}_API_KEY`]}`;
  let data:unknown,endpoint:string;
  try{
    if(provider==='tavily'){
      endpoint=`https://api.tavily.com/${isSearch?'search':'extract'}`;if(config.accessMode==='keyless')headers['X-Tavily-Access-Mode']='keyless';
      const body=isSearch?{query:`${query} India`,search_depth:'basic',max_results:WEB_TOOL_LIMITS.maxResults,include_answer:false,include_raw_content:false,topic:'general'}:
        {urls:[url],extract_depth:'basic',format:'text',include_images:false,timeout:30};
      const response=await boundedResponse(await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),redirect:'error',signal:boundedSignal}),boundedSignal);
      if(!response.ok){await response.body?.cancel();return fail(response.status===429?'RATE_LIMIT':response.status===401||response.status===403?'ACCESS_DENIED':'PROVIDER_UNAVAILABLE','Provider rejected this request; no automatic retries or paid fallback.');}
      data=await response.json();
    }else{
      endpoint=FIRECRAWL_MCP_ENDPOINT;
      const connection=await createMCPClient({transport:{type:'http',url:endpoint,headers,redirect:'error',fetch:async(target,init)=>{
        const targetUrl=typeof target==='string'?target:target instanceof URL?target.href:target.url;
        if(targetUrl!==FIRECRAWL_MCP_ENDPOINT)throw new Error('Unexpected MCP endpoint');
        return boundedResponse(await fetcher(target,{...init,redirect:'error',signal:AbortSignal.any([boundedSignal,...(init?.signal?[init.signal]:[])])}),boundedSignal);}},
        initializationOptions:{signal:boundedSignal,timeout:15000},maxRetries:0,clientName:'mirana-local-research',onUncaughtError:()=>{}});
      try{const args=isSearch?{query:`${query} India`,limit:WEB_TOOL_LIMITS.maxResults,country:'IN',sources:['web'],domainTools:false}:
        {url,formats:['markdown'],onlyMainContent:true,maxAge:0,storeInCache:false,domainTools:false,timeout:30000};
        data=parseMcp(await connection.callTool({name:isSearch?'firecrawl_search':'firecrawl_scrape',arguments:args,options:{signal:boundedSignal,timeout:40000}}));
      }finally{await connection.close().catch(()=>{});}
    }
    signal.throwIfAborted();const payload=JSON.stringify(data);if(payload.length>WEB_TOOL_LIMITS.maxResponseBytes)return fail('INVALID_OUTPUT','Provider response exceeds its size limit.');
    if(scrub(payload,env)!==payload)return fail('INVALID_OUTPUT','Provider response contained credential material.');
    const root=row(data);if(root.success===false)return fail('PROVIDER_UNAVAILABLE','Provider returned unavailable evidence.');
    if(isSearch){const matches=provider==='tavily'?root.results:row(root.data).web??root.data;
      const seen=new Set<string>();for(const item of (Array.isArray(matches)?matches:[]).slice(0,20)){
        const record=row(item),link=safeUrl(record.url);if(!link||seen.has(link))continue;seen.add(link);
        const title=typeof record.title==='string'?record.title.slice(0,500):'',excerpt=typeof (record.content??record.description)==='string'?String(record.content??record.description).slice(0,1800):'';
        if(title||excerpt)base.sources.push({url:link,title,excerpt,evidenceKind:'search-result'});if(base.sources.length>=WEB_TOOL_LIMITS.maxResults)break;
      }
      return {...base,ok:base.sources.length>0,note:'Search discovery leads only. Read the actual source before supporting product, price or review claims.'};
    }
    const page=provider==='tavily'?row((Array.isArray(root.results)?root.results:[])[0]):row(root.data??root),metadata=row(page.metadata);
    const returned=safeUrl(provider==='tavily'?page.url:metadata.url??metadata.sourceURL);
    if(!sameSourcePage(returned,url)||provider==='firecrawl'&&metadata.sourceURL!==undefined&&!sameSourcePage(safeUrl(metadata.sourceURL),url))return fail('INVALID_OUTPUT','Extracted source URL did not match the requested approved page.');
    if(provider==='firecrawl'&&(metadata.error||metadata.statusCode!==200||typeof metadata.contentType==='string'&&!/^(?:text\/html|text\/plain)/i.test(metadata.contentType)))return fail('BLOCKED','Source did not return a readable page.');
    // Only literal markdown/raw_content is accepted, never provider answers or summaries.
    const literal=provider==='tavily'?page.raw_content:page.markdown;if(typeof literal!=='string'||literal.length<80)return fail('INVALID_OUTPUT','No readable literal source content.');
    const title=typeof (metadata.title??page.title)==='string'?String(metadata.title??page.title).slice(0,500):new URL(url!).hostname;
    if(humanVerification(title,literal))return fail('BLOCKED','Source returned a verification page.');
    const bodyText=literal.slice(0,SOURCE_READER_LIMITS.maxTextChars),source:ReadSource={url:url!,title,sourceKind:sourcePageKind(url!),accessStatus:'read',retrievedAt,publishedAt:null,
      bodyText,contentHash:hash(bodyText),paragraphs:bodyText.split(/\n{2,}/).filter(Boolean),quotes:[],textTrust:'untrusted-provider-page',truncated:literal.length>bodyText.length,
      provenance:{kind:'provider-page-extraction',provider,tool:tool as 'read_source_tavily'|'read_source_firecrawl',endpoint,payloadHash:hash(payload),requestedUrl:url!,
        retrieval:'on-demand-extraction',representation:provider==='firecrawl'?'markdown':'text',cacheStatus:'unknown'},note:base.note};
    if(!providerPageProvenanceValid(source))return fail('INVALID_OUTPUT','Extracted evidence failed its provenance checks.');
    return {...base,ok:true,source};
  }catch(error){signal.throwIfAborted();const code=row(error).code;
    return fail(boundedSignal.aborted?'PROVIDER_TIMEOUT':code==='ACCESS_DENIED'||code==='RATE_LIMIT'?code:'PROVIDER_UNAVAILABLE',
      code==='ACCESS_DENIED'?'Provider denied anonymous access. Configure an API key with keyed access explicitly; no automatic paid fallback.':'Web tool could not retrieve usable evidence; no automatic retries or paid fallback.');}
}
