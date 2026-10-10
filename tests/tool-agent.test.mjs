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
 beforeModelCall:async(bytes,max)=>{assert.ok(bytes>0);assert.equal(max,6000);reservations.push('model');},
 beforeToolCall:async(provider,name)=>reservations.push(`${provider}:${name}`),
 fetch:async(target,init)=>{const parsed=new URL(target);requests.push(parsed.hostname);
  if(parsed.hostname==='aiplatform.googleapis.com'){
   assert.equal(target,`${toolAgentVertexEndpoint(env)}/models/gemini-3.8-flash:generateContent`);
   assert.equal(new Headers(init.headers).get('x-goog-api-key'),env.GOOGLE_API_KEY);
   const body=JSON.parse(init.body);assert.ok(body.tools.some(t=>t.googleSearch));
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
console.log('PASS: real ADK multi-step Gemini 3.8-only tool loop, Google Search coexistence, deduplicated API calls, provisional listing provenance, real MCP handshake/envelope parsing/redaction, per-call budget fences, quota redaction and local-only gates');
