import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(error){if(s.startsWith('.'))return next(`${s}.ts`,c);throw error;}}});
const {researchToolAgentRequest}=await import('../lib/research/tool-agent.ts');
const env={NODE_ENV:'test',GOOGLE_API_KEY:'fixture-key',GOOGLE_CLOUD_PROJECT:'mirana-fixture',SERPAPI_API_KEY:'fixture-serp',BRIGHT_DATA_API_TOKEN:'fixture-bright',BRIGHT_DATA_AMAZON_DATASET_ID:'gd_fixture1234'};
const query='8kg top load washing machine India under 22000';
const url='https://www.amazon.in/dp/B012345678';
const inputs=[];let turns=0,searches=0,listings=0;
const response=parts=>Response.json({candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:10}});
const call=(name,args)=>({functionCall:{name,args},thoughtSignature:'fixture-signature'});
const answer=await researchToolAgentRequest({search:true,instructions:'Retrieval only. No ranking.',input:{brief:'washing machine',researchPlan:{hardRequirements:['8kg','top load','INR 22000']}}},new AbortController().signal,{env,maxSteps:3,allowedTools:['search_products_india','fetch_product_listing'],onToolInput:(tool,input)=>inputs.push({tool,input}),fetch:async(target,init)=>{
 const host=new URL(target).hostname;
 if(host==='aiplatform.googleapis.com'){
  const body=JSON.parse(init.body);const names=body.tools.flatMap(t=>t.functionDeclarations?.map(d=>d.name)||[]);
  assert.deepEqual(names.sort(),['fetch_product_listing','search_products_india']);
  assert.ok(JSON.stringify(body).includes('researchPlan'));
  if(turns++===0)return response([call('search_products_india',{query,limit:2})]);
  const replies=body.contents.flatMap(c=>c.parts).filter(p=>p.functionResponse);
  assert.ok(replies.length,'ADK must feed API results back into Gemini');
  if(turns===2){assert.ok(JSON.stringify(replies).includes('Fixture 8kg top load'));return response([call('fetch_product_listing',{url})]);}
  assert.equal(body.toolConfig.functionCallingConfig.mode,'NONE','Final response explicitly disables further function calls');
  return response([{text:'Unranked retrieval inventory: Fixture 8kg top load, INR 21000; service and pressure unknown.'}]);
 }
 if(host==='serpapi.com'){searches++;assert.equal(new URL(target).searchParams.get('q'),query);return Response.json({search_metadata:{status:'Success'},shopping_results:[{title:'Fixture 8kg top load',link:url,extracted_price:21000,price:'₹21000'}]});}
 if(host==='api.brightdata.com'){listings++;assert.ok(init.body.includes(url));return Response.json([{url,title:'Fixture 8kg top load',final_price:21000,currency:'INR'}]);}
 throw new Error('Unexpected host');
}});
assert.equal(searches,1);assert.equal(listings,1);assert.equal(turns,3);
assert.deepEqual(inputs.map(x=>x.tool),['search_products_india','fetch_product_listing']);
assert.equal(inputs[0].input.query,query);assert.equal(answer.diagnostics.observations.length,2);
const script=readFileSync(new URL('../scripts/agentic-retrieval-test.mjs',import.meta.url),'utf8');
for(const forbidden of ['runResearchStage','research-worker','db.ts','sendEmail'])assert.ok(!script.includes(forbidden));
console.log('PASS: model-generated query reaches API unchanged, ADK returns API responses to Gemini, adaptive listing fetch, tool allowlist, retrieval experiment excludes downstream stages.');
let retrievalTurns=0;const receipts=[];
const stopped=await researchToolAgentRequest({search:true,instructions:'Retrieve only.',input:{researchPlan:{hardRequirements:['8kg top load']}}},new AbortController().signal,{env,allowedTools:['search_products_india'],retrievalOnly:true,maxSteps:2,maxToolCalls:1,onToolOutput:(tool,output)=>receipts.push({tool,output}),fetch:async(target)=>{
 if(new URL(target).hostname==='aiplatform.googleapis.com'){retrievalTurns++;return response([call('search_products_india',{query,limit:2})]);}
 return Response.json({search_metadata:{status:'Success'},shopping_results:[{title:'Fixture 8kg top load',link:url,extracted_price:21000,price:'₹21000'}]});
}});
assert.equal(retrievalTurns,1,'Retrieval-only boundary must not request a final reasoning/summary turn');
assert.equal(receipts.length,1);assert.equal(receipts[0].output.offers[0].price,21000);
assert.equal(stopped.diagnostics.observations.length,1);assert.ok(stopped.text.includes('before assessment'));
console.log('PASS: retrieval-only stops on actual function results, preserves API receipts, and skips a model summary.');
const {retrievalCases}=await import('../scripts/retrieval-cases.mjs');
const watch=retrievalCases.watch.brief;
assert.equal(watch.brand,'Apple');assert.equal(watch.modelName,'Watch');assert.equal(watch.budget,40000);
assert.equal(watch.banks,'None');assert.ok(watch.requestText.includes('GPS only, no cellular'));
assert.ok(!/Series\s*\d|B0FQG8R2XW|https?:\/\//i.test(JSON.stringify(watch)),'Fresh watch brief must not contain a generation or known-good URL/ASIN');
console.log('PASS: Apple Watch case preserves original constraints without reference-listing leakage.');
