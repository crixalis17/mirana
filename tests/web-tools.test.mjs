import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {executeWebTool,webToolsConfigured,FIRECRAWL_MCP_ENDPOINT}=await import('../lib/research/web-tools.ts');
const {providerPageProvenanceValid}=await import('../lib/research/source-reader.ts');
const env={NODE_ENV:'test',TAVILY_ACCESS_MODE:'keyless',FIRECRAWL_ACCESS_MODE:'keyless',TAVILY_API_KEY:'fixture-tavily-credential',FIRECRAWL_API_KEY:'fixture-fire-credential'};
const signal=new AbortController().signal,url='https://www.samsung.com/in/tablets/galaxy-tab-s/acme-slate';
const text='Acme Slate 128GB WiFi supports Acme Pencil, palm rejection and handwritten note taking. '.repeat(4);
let calls=0,reservations=0;
const search=await executeWebTool('search_web_tavily',{query:'Acme Slate review'},signal,{env,beforeToolCall:async()=>reservations++,fetch:async(target,init)=>{
 calls++;assert.equal(target,'https://api.tavily.com/search');const headers=new Headers(init.headers);assert.equal(headers.get('X-Tavily-Access-Mode'),'keyless');assert.equal(headers.has('Authorization'),false);
 const body=JSON.parse(init.body);assert.equal(body.include_answer,false);assert.equal(body.search_depth,'basic');assert.equal(body.max_results,6);assert.equal(init.redirect,'error');
 return Response.json({answer:'Invented product summary',results:[{url,title:'Acme Slate',content:'Discovery snippet'},{url,title:'Duplicate'},{url:'http://127.0.0.1/secret',title:'Bad'},{url:url+'?api_key=secret',title:'Bad'}]});
}});
assert.equal(search.ok,true);assert.equal(search.sources.length,1);assert.equal(search.source,null);assert.equal(search.sources[0].evidenceKind,'search-result');assert.equal(reservations,1);
for(const invalid of [{url:'http://127.0.0.1/secret'},{url:'https://evil.example/product'},{url:url+'?token=secret'},{url,actions:[{type:'click'}]}]){
 const r=await executeWebTool('read_source_tavily',invalid,signal,{env,beforeToolCall:async()=>{throw Error('Must not reserve');},fetch:async()=>{throw Error('Must not fetch');}});assert.equal(r.error.code,'INVALID_INPUT');}
const disabled=await executeWebTool('search_web_tavily',{query:'Acme'},signal,{env:{},fetch:async()=>{throw Error('Must not fetch');}});assert.equal(disabled.error.code,'NOT_CONFIGURED');
assert.equal(webToolsConfigured({TAVILY_ACCESS_MODE:'keyed'}).tavily.ready,false);assert.equal(webToolsConfigured({...env,TAVILY_ACCESS_MODE:'typo'}).tavily.ready,false);
const extract=async(data,overrides={})=>executeWebTool('read_source_tavily',{url},signal,{env,...overrides,fetch:async(target,init)=>{
 assert.equal(target,'https://api.tavily.com/extract');const body=JSON.parse(init.body);assert.equal(body.query,undefined);assert.equal(body.format,'text');assert.deepEqual(body.urls,[url]);return Response.json(data);
}});
const read=await extract({results:[{url,raw_content:text}]});assert.equal(read.ok,true);assert.equal(read.source.textTrust,'untrusted-provider-page');assert.equal(providerPageProvenanceValid(read.source),true);
assert.equal(read.source.bodyText,text);assert.equal(read.source.provenance.cacheStatus,'unknown');
for(const data of [{results:[{url:'https://www.samsung.com/in/other',raw_content:text}]},{results:[{url,content:text}]},{results:[{url,raw_content:text+env.TAVILY_API_KEY}]},{results:[],failed_results:[{url,error:'private-provider-detail'}]}]){
 const r=await extract(data);assert.equal(r.ok,false);assert.equal(r.source,null);assert.equal(JSON.stringify(r).includes('private-provider-detail'),false);assert.equal(JSON.stringify(r).includes(env.TAVILY_API_KEY),false);}
const keyed=await executeWebTool('search_web_tavily',{query:'Acme'},signal,{env:{...env,TAVILY_ACCESS_MODE:'keyed'},fetch:async(_,init)=>{
 const headers=new Headers(init.headers);assert.equal(headers.get('Authorization'),`Bearer ${env.TAVILY_API_KEY}`);assert.equal(headers.has('X-Tavily-Access-Mode'),false);return Response.json({results:[]});}});assert.equal(keyed.ok,false);
const limited=await executeWebTool('search_web_tavily',{query:'Acme'},signal,{env,fetch:async()=>{calls++;return new Response('private-rate-limit',{status:429});}});assert.equal(limited.error.code,'RATE_LIMIT');
assert.equal(calls,2,'No automatic retries or paid fallback');
const large=await executeWebTool('search_web_tavily',{query:'Acme'},signal,{env,fetch:async()=>new Response('x'.repeat(2_000_001))});assert.equal(large.ok,false);
await assert.rejects(executeWebTool('search_web_tavily',{query:'Acme'},signal,{env,beforeToolCall:async()=>{throw Object.assign(Error('lease'),{code:'lease_lost'});}}),e=>e.code==='lease_lost');
const abort=new AbortController();abort.abort();await assert.rejects(executeWebTool('search_web_tavily',{query:'Acme'},abort.signal,{env}));
for(const gate of [{NODE_ENV:'production'},{VERCEL:'1'}])assert.equal((await executeWebTool('search_web_tavily',{query:'Acme'},signal,{env:{...env,...gate}})).error.code,'LOCAL_ONLY');

const released=await executeWebTool('search_web_tavily',{query:'Acme'},signal,{env:{...env,NODE_ENV:'production',RESEARCH_PRODUCTION_ENABLED:'true'},fetch:async()=>Response.json({results:[{url,title:'Acme',content:'Product'}]})});
assert.equal(released.ok,true);

// Real SDK MCP handshake, fixed tool arguments and session close, with fixture HTTP.
const rpcMethods=[];let mcpReplyError=false,returnedFireUrl=url+'/';const fireFetch=async(target,init)=>{
 assert.equal(String(target),FIRECRAWL_MCP_ENDPOINT);assert.equal(new Headers(init.headers).has('Authorization'),false);
 if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE'){rpcMethods.push('close');return new Response(null,{status:204});}
 const rpc=JSON.parse(init.body);rpcMethods.push(rpc.method);if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
 if(rpc.method==='tools/call'){assert.equal(rpc.params.name,'firecrawl_scrape');assert.equal(rpc.params.arguments.maxAge,0);assert.equal(rpc.params.arguments.storeInCache,false);assert.deepEqual(rpc.params.arguments.formats,['markdown']);assert.equal(rpc.params.arguments.actions,undefined);}
 if(rpc.method==='tools/call'&&mcpReplyError)return Response.json({jsonrpc:'2.0',id:rpc.id,result:{isError:true,structuredContent:{code:'KEYLESS_ACCESS_UNAVAILABLE',auth_mode:'keyless',message:'Private provider signup instructions'},content:[]}});
 return Response.json({jsonrpc:'2.0',id:rpc.id,...(rpc.method==='server/discover'?{error:{code:-32601,message:'Unsupported'}}:
  {result:rpc.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:
  {content:[{type:'text',text:JSON.stringify({success:true,data:{markdown:text,metadata:{title:'Acme Slate 128GB WiFi',sourceURL:url,url:returnedFireUrl,statusCode:200,contentType:'text/html'}}})}]}})},
  {headers:{'mcp-session-id':'fixture-session'}});
};
const fire=await executeWebTool('read_source_firecrawl',{url},signal,{env,fetch:fireFetch});
assert.equal(fire.ok,true);assert.equal(fire.source.provenance.endpoint,FIRECRAWL_MCP_ENDPOINT);assert.equal(providerPageProvenanceValid(fire.source),true);
assert.ok(rpcMethods.includes('tools/call'));assert.ok(rpcMethods.includes('close'));
for(const changed of [url+'-different-product',url+'?variant=different','https://www.apple.com/in/other']){returnedFireUrl=changed;const mismatch=await executeWebTool('read_source_firecrawl',{url},signal,{env,fetch:fireFetch});assert.equal(mismatch.error.code,'INVALID_OUTPUT');}
// Live Amazon metadata adds th=1 to the same exact ASIN. Accept the rendering
// flag while rejecting different ASINs and unexplained variant flags.
const amazonUrl='https://www.amazon.in/dp/B0F3GWXLTS';let amazonReturned=amazonUrl+'?th=1';
const amazonFireFetch=async(target,init)=>{
 const reply=await fireFetch(target,init);
 if(init.method!=='POST'||JSON.parse(init.body).method!=='tools/call')return reply;
 const rpc=JSON.parse(init.body);
 return Response.json({jsonrpc:'2.0',id:rpc.id,result:{content:[],structuredContent:{markdown:text,metadata:{title:'Acme selected product',url:amazonReturned,sourceURL:amazonUrl,statusCode:200,contentType:'text/html;charset=UTF-8'}}}},{headers:{'mcp-session-id':'fixture-session'}});
};
const amazonFire=await executeWebTool('read_source_firecrawl',{url:amazonUrl},signal,{env,fetch:amazonFireFetch});
assert.equal(amazonFire.ok,true);assert.equal(amazonFire.source.url,amazonUrl);assert.equal(providerPageProvenanceValid(amazonFire.source),true);
for(const changed of ['https://www.amazon.in/dp/B0BDHWDR12?th=1',amazonUrl+'?variant=different',amazonUrl+'?th=2']){
 amazonReturned=changed;assert.equal((await executeWebTool('read_source_firecrawl',{url:amazonUrl},signal,{env,fetch:amazonFireFetch})).error.code,'INVALID_OUTPUT');
}
mcpReplyError=true;const denied=await executeWebTool('read_source_firecrawl',{url},signal,{env,fetch:fireFetch});assert.equal(denied.error.code,'ACCESS_DENIED');assert.equal(JSON.stringify(denied).includes('Private provider'),false);
console.log('PASS: Tavily keyless/keyed API and Firecrawl MCP, literal extraction, fixed endpoints/read-only schemas, no summary promotion, invalid URL/credential/size rejection, no retries, cancellation and local-only gates');
