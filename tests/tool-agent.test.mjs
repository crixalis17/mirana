import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {researchToolAgentRequest,toolAgentVertexEndpoint}=await import('../lib/research/tool-agent.ts');
const env={NODE_ENV:'test',GOOGLE_API_KEY:'google-credential-canary',GOOGLE_CLOUD_PROJECT:'mirana-tool-fixture',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash',SERPAPI_API_KEY:'serp-credential-canary',BRIGHT_DATA_API_TOKEN:'bright-credential-canary',BRIGHT_DATA_AMAZON_DATASET_ID:'gd_test12345'};
const url='https://www.amazon.in/dp/B0F3GWXLTS',signal=new AbortController().signal;
const result=(parts,groundingMetadata)=>new Response(JSON.stringify({candidates:[{content:{role:'model',parts},finishReason:'STOP',groundingMetadata}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:30}}),{headers:{'content-type':'application/json'}});
const call=(name,args,id)=>({functionCall:{name,args,id},thoughtSignature:'fixture-signature'});
let model=0,products=0,listing=0;const reservations=[],requests=[];
const answer=await researchToolAgentRequest({instructions:'Research the user brief.',input:{product:'tablet',budget:60000},search:true},signal,{env,
 beforeModelCall:async(bytes,max)=>{assert.ok(bytes>0);assert.equal(max,65536);reservations.push('model');},
 beforeToolCall:async(provider,name)=>reservations.push(`${provider}:${name}`),
 fetch:async(target,init)=>{const parsed=new URL(target);requests.push(parsed.hostname);
  if(parsed.hostname==='aiplatform.googleapis.com'){
   assert.equal(target,`${toolAgentVertexEndpoint(env)}/models/gemini-3.8-flash:generateContent`);
   assert.equal(new Headers(init.headers).get('x-goog-api-key'),env.GOOGLE_API_KEY);
   const body=JSON.parse(init.body);assert.equal(body.tools.some(t=>t.googleSearch),false,'Native Google Search requires explicit opt-in; provider tools remain available');
   assert.ok(body.tools.some(t=>t.functionDeclarations?.some(f=>f.name==='fetch_product_listing')));
   if(model++===0)return result([call('search_products_india',{query:'tablet pen India'},'s1'),call('search_products_india',{query:'tablet pen India'},'s2')]);
   if(model===2){assert.ok(JSON.stringify(body).includes('search-result'));return result([call('fetch_product_listing',{url},'l1')]);}
   assert.ok(JSON.stringify(body).includes('checkoutVerified'));return result([{text:'Exact tablet listing found. Stock, seller and complete kit checkout need verification.'}]);
  }
  if(parsed.hostname==='serpapi.com'){products++;assert.equal(parsed.searchParams.get('no_cache'),'true');return new Response(JSON.stringify({search_metadata:{status:'Success'},shopping_results:[{link:url,title:'Acme Slate 256GB',price:'₹25000',extracted_price:25000}]}));}
  if(parsed.hostname==='api.brightdata.com'){listing++;return new Response(JSON.stringify([{url,title:'Acme Slate 256GB',final_price:25000,currency:'INR',condition:'New',availability:'In stock',timestamp:new Date().toISOString()}]));}
  throw new Error(`Unexpected fixture host ${parsed.hostname}`);
 }});
assert.equal(model,3);assert.equal(products,1,'Identical concurrent searches must not double-bill');assert.equal(listing,1);
assert.equal(reservations.filter(r=>r==='model').length,3);assert.equal(reservations.filter(r=>r==='serpapi:search_products_india').length,1);
assert.equal(answer.diagnostics.observations.length,2);assert.equal(answer.diagnostics.observations[1].offer.checkoutVerified,false);
assert.equal(answer.diagnostics.observations[1].offer.total,null);assert.equal(answer.searched,true);
assert.equal(answer.usage.inputTokens,300);assert.equal(answer.usage.outputTokens,60);assert.equal(answer.usage.thinkingTokens,90);
assert.equal(answer.sources[0].url,url);for(const key of ['GOOGLE_API_KEY','SERPAPI_API_KEY','BRIGHT_DATA_API_TOKEN'])assert.equal(JSON.stringify(answer).includes(env[key]),false);
assert.equal(answer.diagnostics.runtime,'google-adk');

let leadTurns=0;
const leadAnswer=await researchToolAgentRequest({instructions:'Discover a tablet.',input:{},search:true},signal,{env,fetch:async(target)=>{
  if(new URL(target).hostname==='aiplatform.googleapis.com')return leadTurns++===0?result([call('search_products_india',{query:'tablet India'},'lead')]):result([{text:'A Google Shopping product lead was found; exact merchant checkout remains unknown.'}]);
  return Response.json({search_metadata:{status:'Success'},shopping_results:[{title:'Acme Slate 128GB',product_link:'https://www.google.com/shopping/product/12345?gl=in',source:'Amazon.in',price:'₹25000',extracted_price:25000}]});
}});
assert.equal(leadAnswer.sources[0].url,'https://www.google.com/shopping/product/12345?gl=in');
assert.equal(leadAnswer.diagnostics.observations[0].offer,null);assert.equal(leadAnswer.diagnostics.toolCalls[0].offerCount,0);

// Exercise the real MCP SDK handshake/call/close, not a mock tool implementation.
let mcpModel=0;const rpcMethods=[];let mcpReservations=0;
const mcp=await researchToolAgentRequest({instructions:'Search reviews.',input:{product:'tablet'},search:true},signal,{env,
 beforeToolCall:async(provider,name)=>{assert.equal(provider,'serpapi-mcp');assert.equal(name,'search');mcpReservations++;},
 fetch:async(target,init)=>{
  const parsed=new URL(target);
  if(parsed.hostname==='aiplatform.googleapis.com')return mcpModel++===0?result([call('search_web_mcp',{query:'Acme Slate review'},'m1')]):result([{text:'Review link discovered; measurements remain unknown.'}]);
  assert.equal(parsed.href,'https://mcp.serpapi.com/mcp');assert.equal(new Headers(init.headers).get('authorization'),`Bearer ${env.SERPAPI_API_KEY}`);
  if(init.method==='GET')return new Response('',{status:405});
  if(init.method==='DELETE')return new Response(null,{status:204});
  const rpc=JSON.parse(init.body);rpcMethods.push(rpc.method);
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  const response=rpc.method==='server/discover'?{jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Not supported'}}:
   {jsonrpc:'2.0',id:rpc.id,result:rpc.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:
    {content:[{type:'text',text:'fixture'}],structuredContent:{result:JSON.stringify({organic_results:[{link:'https://www.rtings.com/tablet/reviews/acme-slate',title:'Acme Slate Review',snippet:`Fixture ${env.SERPAPI_API_KEY}`}]})}}};
  if(rpc.method==='tools/call'){assert.equal(rpc.params.name,'search');assert.equal(rpc.params.arguments.params.gl,'in');assert.equal(rpc.params.arguments.params.no_cache,true);}
  return new Response(JSON.stringify(response),{headers:{'content-type':'application/json','mcp-session-id':'fixture-session'}});
 }});
assert.ok(rpcMethods.includes('initialize'));assert.ok(rpcMethods.includes('tools/call'));assert.equal(mcpReservations,1);
assert.equal(mcp.sources.length,1);assert.equal(mcp.diagnostics.mcpSources[0].textTrust,'untrusted-provider-mcp');
assert.equal(JSON.stringify(mcp).includes(env.SERPAPI_API_KEY),false);
assert.equal(mcp.diagnostics.observations.length,0,'MCP snippets must not become exact listing observations');

// Native grounding is a last resort, gated by actual configured discovery
// outcomes. An extraction failure must never stand in for a search failure.
const fallbackEnv={NODE_ENV:'test',GOOGLE_API_KEY:env.GOOGLE_API_KEY,GOOGLE_CLOUD_PROJECT:env.GOOGLE_CLOUD_PROJECT,
 GEMINI_RESEARCH_MODEL:env.GEMINI_RESEARCH_MODEL,RESEARCH_NATIVE_SEARCH_ENABLED:'true',TAVILY_ACCESS_MODE:'keyed',TAVILY_API_KEY:'tavily-credential-canary'};
const nativeGrounding={webSearchQueries:['Acme Watch review India'],groundingChunks:[{web:{uri:url,title:'Acme Watch listing'}}]};
for(const empty of [false,true]){
 let turns=0,searchCalls=0;
 const fallback=await researchToolAgentRequest({instructions:'Find supported product leads.',input:{product:'watch'},search:true},signal,{env:fallbackEnv,fetch:async(target,init)=>{
  if(new URL(target).hostname==='api.tavily.com'){searchCalls++;assert.equal(new URL(target).pathname,'/search');return empty?Response.json({results:[]}):new Response('private provider detail',{status:503});}
  assert.equal(new URL(target).hostname,'aiplatform.googleapis.com');const body=JSON.parse(init.body),native=(body.tools||[]).some(tool=>tool.googleSearch);
  assert.ok(JSON.stringify(body.systemInstruction).includes('FINAL RESORT'),'Prompt must explicitly reserve native Search for last resort');
  if(turns++===0){assert.equal(native,false,'A configured external discovery tool must run first');return result([call('search_web_tavily',{query:'Acme Watch India'},'tav-failure')]);}
  assert.equal(native,true,'Failed or empty Tavily-only discovery unlocks the final-resort tool');return result([{text:'A native search lead was found; checkout remains unknown.'}],nativeGrounding);
 }});
 assert.equal(searchCalls,1);assert.equal(turns,2);assert.equal(fallback.searched,true);assert.equal(fallback.sources[0].url,url);
 assert.ok(fallback.diagnostics.toolCalls.some(trace=>trace.tool==='google_search'&&trace.provider==='google'));
 assert.ok(fallback.diagnostics.limitations.some(value=>value.includes('final resort')));
 for(const secret of [fallbackEnv.GOOGLE_API_KEY,fallbackEnv.TAVILY_API_KEY])assert.equal(JSON.stringify(fallback).includes(secret),false);
 assert.equal(JSON.stringify(fallback.diagnostics).includes('private provider detail'),false);
}

let successfulTurns=0;
const successfulExternal=await researchToolAgentRequest({instructions:'Discover then read product.',input:{},search:true},signal,{env:fallbackEnv,fetch:async(target,init)=>{
 if(new URL(target).hostname==='api.tavily.com')return Response.json({results:[{url,title:'Acme Watch review',content:'Exact watch discovery lead.'}]});
 const body=JSON.parse(init.body);assert.equal((body.tools||[]).some(tool=>tool.googleSearch),false,'Usable external discovery suppresses fallback on every subsequent turn');
 if(successfulTurns++===0)return result([call('search_web_tavily',{query:'Acme Watch India'},'tav-success')]);
 if(successfulTurns===2)return result([call('fetch_product_listing',{url},'unavailable-extraction')]);
 return result([{text:'External discovery is usable; listing extraction is unavailable and checkout remains unknown.'}]);
}});
assert.equal(successfulTurns,3);assert.equal(successfulExternal.searched,true);
assert.equal(successfulExternal.diagnostics.toolCalls.some(trace=>trace.tool==='google_search'),false);
assert.ok(successfulExternal.diagnostics.toolCalls.some(trace=>trace.tool==='fetch_product_listing'&&trace.status==='unavailable'));

let allFailedTurns=0;
const allFailedEnv={...fallbackEnv,SERPAPI_API_KEY:env.SERPAPI_API_KEY};
const allFailed=await researchToolAgentRequest({instructions:'Discover product leads.',input:{},search:true},signal,{env:allFailedEnv,fetch:async(target,init)=>{
 const host=new URL(target).hostname;
 if(host==='api.tavily.com')return new Response('',{status:503});
 if(host==='serpapi.com')return Response.json({search_metadata:{status:'Success'},shopping_results:[]});
 if(host==='mcp.serpapi.com')return new Response('',{status:401});
 const body=JSON.parse(init.body),native=(body.tools||[]).some(tool=>tool.googleSearch);
 if(allFailedTurns++===0){assert.equal(native,false);return result([call('search_web_tavily',{query:'Acme Watch India'},'first-failed')]);}
 if(allFailedTurns===2){assert.equal(native,false,'One failure does not unlock fallback while other configured discovery tools remain unattempted');return result([call('search_products_india',{query:'Acme Watch India'},'shopping-empty'),call('search_web_mcp',{query:'Acme Watch review'},'mcp-failed')]);}
 assert.equal(native,true,'All configured discovery operations failed or returned no leads');return result([{text:'Native discovery is the final resort after unavailable external searches.'}],nativeGrounding);
}});
assert.equal(allFailedTurns,3);assert.ok(allFailed.diagnostics.toolCalls.some(trace=>trace.tool==='google_search'));

let attempts=0;
const budget=await researchToolAgentRequest({instructions:'Search.',input:{product:'tablet'},search:true},signal,{env,
 beforeModelCall:async()=>{if(++attempts>1)throw Object.assign(new Error('budget'),{code:'budget_exhausted'});},
 fetch:async()=>result([call('search_products_india',{query:'tablet India'},'b1')]),
 beforeToolCall:async()=>{throw Object.assign(new Error('budget'),{code:'budget_exhausted'});}});
assert.equal(budget.diagnostics.budgetExhausted,true);assert.equal(budget.diagnostics.modelCalls,1);assert.equal(budget.diagnostics.observations.length,0);
await assert.rejects(researchToolAgentRequest({instructions:'Search.',input:{},search:true},signal,{env,beforeModelCall:async()=>{throw Object.assign(new Error('lease'),{code:'lease_lost'});},fetch:async()=>{throw new Error('Must not dispatch');}}),e=>e.code==='lease_lost');
for(const override of [{NODE_ENV:'production'},{VERCEL:'1'},{GEMINI_RESEARCH_MODEL:'other-model'}])assert.throws(()=>toolAgentVertexEndpoint({...env,...override}));
await assert.rejects(researchToolAgentRequest({instructions:'Search.',input:{},search:true},signal,{env,fetch:async()=>new Response('provider private details',{status:401})}),e=>e.code==='PROVIDER_REJECTED'&&!e.message.includes('private'));
const abort=new AbortController();abort.abort();await assert.rejects(researchToolAgentRequest({instructions:'Search.',input:{},search:true},abort.signal,{env}));
console.log('PASS: real ADK multi-step Gemini 3.8-only tool loop, gated final-resort Google Search after all configured discovery failures, suppression after successful discovery, deduplicated API calls, provisional listing provenance, real MCP handshake/envelope parsing/redaction, per-call budget fences, quota redaction and production gates');
