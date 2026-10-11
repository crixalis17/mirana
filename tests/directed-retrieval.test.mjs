import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(error){if(s.startsWith('.'))return next(`${s}.ts`,c);throw error;}}});
const {researchProviderRequest}=await import('../lib/research/provider.ts');
const {researchRetrievalMode}=await import('../lib/research/retrieval-mode.ts');
assert.equal(researchRetrievalMode({}),'controlled');
assert.equal(researchRetrievalMode({RESEARCH_RETRIEVAL_MODE:'gemini-directed'}),'gemini-directed');
assert.throws(()=>researchRetrievalMode({RESEARCH_RETRIEVAL_MODE:'typo'}));
const saved={...process.env},oldFetch=globalThis.fetch;
Object.assign(process.env,{NODE_ENV:'test',RESEARCH_PROVIDER:'vertex',RESEARCH_TOOLS_ENABLED:'true',RESEARCH_RETRIEVAL_MODE:'gemini-directed',GOOGLE_API_KEY:'fixture',GOOGLE_CLOUD_PROJECT:'mirana-fixture',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash',SERPAPI_API_KEY:'fixture',BRIGHT_DATA_API_TOKEN:'fixture',BRIGHT_DATA_AMAZON_DATASET_ID:'gd_fixture1234',RESEARCH_NATIVE_SEARCH_ENABLED:'false'});
let turns=0,reservedModels=0,reservedTools=0,usage=0;const queries=[];
const url='https://www.amazon.in/dp/B012345678';
const response=parts=>Response.json({candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:10}});
const call=(name,args)=>({functionCall:{name,args},thoughtSignature:'fixture'});
globalThis.fetch=async(target,init)=>{
 const host=new URL(target).hostname;
 if(host==='aiplatform.googleapis.com'){
  const body=JSON.parse(init.body),text=JSON.stringify(body);
  assert.ok(text.includes('search each requested family separately'));
  assert.ok(text.includes('13-inch'));assert.ok(text.includes('research plan'));
  assert.ok(!text.includes('googleSearch'));
  assert.equal(body.generationConfig.maxOutputTokens,65536);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'HIGH');
  if(turns++===0)return response([call('search_products_india',{query:'Apple MacBook Air 13 inch India 256GB 8GB',limit:2})]);
  assert.ok(text.includes('functionResponse'),'Actual API responses must return to the agent');
  if(turns===2)return response([call('fetch_product_listing',{url})]);
  return response([call('search_products_india',{query:'Apple MacBook Neo 13 inch India 256GB 8GB',limit:2})]);
 }
 if(host==='serpapi.com'){queries.push(new URL(target).searchParams.get('q'));return Response.json({search_metadata:{status:'Success'},shopping_results:[{title:'Apple MacBook Air 13 inch 8GB 256GB',link:url,extracted_price:85000,price:'₹85000'}]});}
 if(host==='api.brightdata.com')return Response.json([{url,title:'Apple MacBook Air 13 inch 8GB 256GB',final_price:85000,currency:'INR'}]);
 throw Error(`Unexpected network target ${host}`);
};
try{
 const answer=await researchProviderRequest({search:true,instructions:'Retrieve the research plan only.',input:{context:{brief:{brand:'Apple',modelName:'MacBook Air or MacBook Neo',requestText:'13-inch laptop, minimum 8GB RAM and 256GB SSD, max INR 120000'}},plan:{hardRequirements:['13-inch']},retrievalAllowance:24},beforeModelCall:async()=>reservedModels++,beforeToolCall:async()=>reservedTools++,onModelUsage:async()=>usage++},new AbortController().signal);
 assert.equal(turns,3,'Retrieval-only must stop before a fourth summarization generation');
 assert.equal(reservedModels,3);assert.equal(reservedTools,3);assert.equal(usage,3);
 assert.deepEqual(queries,['Apple MacBook Air 13 inch India 256GB 8GB','Apple MacBook Neo 13 inch India 256GB 8GB']);
 assert.equal(JSON.parse(answer.text).retrievalMode,'gemini-directed');
 assert.ok(answer.diagnostics.observations.some(o=>o.kind==='listing-api'));
 assert.ok(answer.sources.some(s=>s.url===url));
 assert.ok(!answer.text.includes('recommendedId'));
 console.log('PASS: production provider selects retrieval-only ADK agent; model queries reach APIs unchanged, results feed back, durable counters preserved, HIGH thinking, no ranking or extra summary.');
}finally{globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(!Object.hasOwn(saved,key))delete process.env[key];Object.assign(process.env,saved);}
