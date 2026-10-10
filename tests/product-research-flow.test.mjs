import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {runResearchStage}=await import('../lib/research/iterative.ts');
const env={NODE_ENV:'test',RESEARCH_PROVIDER:'vertex',RESEARCH_TOOLS_ENABLED:'true',GOOGLE_API_KEY:'fixture-google-key',GOOGLE_CLOUD_PROJECT:'mirana-tool-fixture',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash',SERPAPI_API_KEY:'fixture-serp-key',BRIGHT_DATA_API_TOKEN:'fixture-bright-key',BRIGHT_DATA_AMAZON_DATASET_ID:'gd_test12345',VERCEL:''};
const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
const url='https://www.amazon.in/dp/B0F3GWXLTS',title='Acme Book14 16GB RAM 512GB SSD',date=new Date().toISOString();
const row={url,title,final_price:45000,currency:'INR',condition:'New',availability:'In stock',timestamp:date};
const plan={category:'Laptop',criteria:['Cost','Noise'],hardRequirements:[],softPreferences:['Quiet fan'],questions:['Exact variant'],requiredAccessories:[],conditionalAccessories:[],clarifications:[]};
const modelResponse=parts=>Response.json({candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:50,candidatesTokenCount:25,thoughtsTokenCount:10}});
const outputs={};let calls=0,tools=0,discoveryModel=0;let inputSnapshot;
try{
 Object.assign(process.env,env);
 globalThis.fetch=async(target,init)=>{
  const host=new URL(target).hostname;
  if(host==='aiplatform.googleapis.com'){
   const body=JSON.parse(init.body),properties=body.generationConfig?.responseSchema?.properties;
   if(properties?.criteria)return modelResponse([{text:JSON.stringify(plan)}]);
   if(properties?.sufficient){inputSnapshot=JSON.parse(body.contents[0].parts[0].text);const snapshot=inputSnapshot.originalSources.find(s=>s.url===url);assert.equal(snapshot.textTrust,'untrusted-provider-api-json');
    const proof={sourceUrl:url,quote:snapshot.bodyText};return modelResponse([{text:JSON.stringify({gaps:['Independent review missing'],followupQuestions:['Find independent test'],sufficient:false,candidates:[{name:'Acme Book14',variant:'16GB RAM 512GB SSD',hardRequirements:[],comparisonClaims:[],mandatoryAccessories:[],productPrice:{value:45000,...proof},condition:{value:'new',...proof},currentAvailability:{value:'in_stock',...proof}}]})}]);}
   if(discoveryModel++===0)return modelResponse([{functionCall:{id:'s1',name:'search_products_india',args:{query:'quiet laptop India'}},thoughtSignature:'fixture-signature'},{functionCall:{id:'l1',name:'fetch_product_listing',args:{url}},thoughtSignature:'fixture-signature'}]);
   return modelResponse([{text:'Acme Book14 16GB RAM 512GB SSD: provisional price INR 45000. Independent review missing.'}]);
  }
  if(host==='serpapi.com')return Response.json({search_metadata:{status:'Success'},shopping_results:[{link:url,title,price:'INR 45000',extracted_price:45000}]});
  if(host==='api.brightdata.com')return Response.json([row]);
  if(target===url)return new Response('Access restricted',{status:403});
  throw new Error('Unexpected request');
 };
 const context={purchase:{id:'local-fixture',budget:55000,topN:3,postcode:'600019',requestText:'A new quiet laptop',priorities:['Value for money'],customTags:['Quiet fan']},outputs,referenceDate:date,
  beforeModelCall:async()=>{calls++;},beforeToolCall:async()=>{tools++;}};
 for(const stage of ['plan','gather','read','assess']){const result=await runResearchStage(stage,context,new AbortController().signal);if(stage==='read')outputs.read=[result.output];else outputs[stage]=result.output;}
 assert.equal(calls,4,'ADK tool loop and structured stages must each reserve their actual calls');assert.equal(tools,2);
 assert.equal(outputs.gather.toolObservations.length,2);assert.ok(Buffer.byteLength(JSON.stringify(outputs.gather))<230000);
 assert.equal(outputs.read[0].apiSnapshotCount,1);assert.equal(outputs.read[0].blockedCount,1);
 assert.equal(outputs.assess.claimLedger.candidates[0].productPrice,45000);assert.equal(outputs.assess.claimLedger.candidates[0].eligibility.provisional,true);
 assert.equal(outputs.assess.claimLedger.candidates[0].productPriceEvidence.provenance.provider,'brightdata');
 assert.deepEqual(inputSnapshot.context.brief.customTags,['Quiet fan']);
}finally{globalThis.fetch=originalFetch;for(const[k,v]of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
console.log('PASS: provider opt-in → ADK tools → persisted discovery → blocked merchant fallback → attributed API quote → provisional claim ledger, with preferences and actual call accounting preserved');
