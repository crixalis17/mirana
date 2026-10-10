import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {runResearchStage}=await import('../lib/research/iterative.ts');
const env={NODE_ENV:'test',RESEARCH_PROVIDER:'vertex',RESEARCH_TOOLS_ENABLED:'true',GOOGLE_API_KEY:'fixture-google-key',GOOGLE_CLOUD_PROJECT:'mirana-tool-fixture',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash',TAVILY_ACCESS_MODE:'keyless',FIRECRAWL_ACCESS_MODE:'keyless',VERCEL:''};
const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
const url='https://www.samsung.com/in/tablets/galaxy-tab-s/acme-fixture',title='Acme Slate 128GB WiFi',date=new Date().toISOString();
const literal=`${title}. New condition. In stock. Item price INR 45000. Supports palm rejection and handwritten note taking.`;
const plan={category:'Tablet',criteria:['Palm rejection'],hardRequirements:['Palm rejection'],softPreferences:['Drawing'],questions:['Pen support'],requiredAccessories:[],conditionalAccessories:[],clarifications:[]};
const response=parts=>Response.json({candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:50,candidatesTokenCount:25,thoughtsTokenCount:10}});
const outputs={},toolCalls=[];let modelCalls=0,discovery=0,fireCalls=0;let assessedSource;
try{
 Object.assign(process.env,env);
 globalThis.fetch=async(target,init)=>{
  const host=new URL(target).hostname;
  if(host==='aiplatform.googleapis.com'){
   const body=JSON.parse(init.body),properties=body.generationConfig?.responseSchema?.properties;
   if(properties?.criteria)return response([{text:JSON.stringify(plan)}]);
   if(properties?.sufficient){assessedSource=JSON.parse(body.contents[0].parts[0].text).originalSources[0];
    const proof={sourceUrl:url,quote:literal};return response([{text:JSON.stringify({gaps:['Postcode checkout unknown'],followupQuestions:[],sufficient:true,candidates:[{name:'Acme Slate',variant:'128GB WiFi',hardRequirements:[{requirement:'Palm rejection',status:'supported',...proof}],comparisonClaims:[{text:'Palm rejection support',kind:'specification',...proof}],mandatoryAccessories:[],productPrice:{value:45000,...proof},condition:{value:'new',...proof},currentAvailability:{value:'in_stock',...proof}}]})}]);}
   const declarations=body.tools.flatMap(tool=>tool.functionDeclarations||[]).map(tool=>tool.name);for(const name of ['search_web_tavily','read_source_tavily','search_web_firecrawl','read_source_firecrawl'])assert.ok(declarations.includes(name));
   if(discovery++===0)return response([{functionCall:{id:'s1',name:'search_web_tavily',args:{query:'Acme Slate review'}},thoughtSignature:'fixture'}]);
   if(discovery===2)return response(['f1','f2'].map(id=>({functionCall:{id,name:'read_source_firecrawl',args:{url}},thoughtSignature:'fixture'})));
   return response([{text:'Acme Slate 128GB WiFi has palm rejection. Provisional source extraction; checkout unknown.'}]);
  }
  if(host==='api.tavily.com')return Response.json({results:[{url,title,content:'Search snippet is only a lead.'}]});
  if(host==='mcp.firecrawl.dev'){
   if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:204});
   const rpc=JSON.parse(init.body);if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
   if(rpc.method==='tools/call'){fireCalls++;assert.equal(rpc.params.name,'firecrawl_scrape');}
   return Response.json({jsonrpc:'2.0',id:rpc.id,...(rpc.method==='server/discover'?{error:{code:-32601,message:'Unsupported'}}:{result:rpc.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{content:[{type:'text',text:JSON.stringify({success:true,data:{markdown:literal,metadata:{title,url,sourceURL:url,statusCode:200}}})}]}})}, {headers:{'mcp-session-id':'fixture'}});
  }
  if(target===url)throw Error('Already-extracted page must not be re-fetched');throw Error('Unexpected fixture host');
 };
 const context={purchase:{id:'web-tool-fixture',budget:60000,topN:3,postcode:'600019',requestText:'New tablet with palm rejection',priorities:['Value for money'],customTags:['Drawing']},outputs,referenceDate:date,beforeModelCall:async()=>modelCalls++,beforeToolCall:async(provider,tool)=>toolCalls.push({provider,tool})};
 for(const stage of ['plan','gather','read','assess']){const r=await runResearchStage(stage,context,new AbortController().signal);if(stage==='read')outputs.read=[r.output];else outputs[stage]=r.output;}
 assert.equal(modelCalls,5);assert.equal(toolCalls.length,2);assert.equal(fireCalls,1,'Identical concurrent page reads must share one request');
 assert.equal(outputs.gather.originalSources.length,1);assert.equal(outputs.gather.originalSources[0].textTrust,'untrusted-provider-page');
 assert.equal(outputs.gather.toolReadiness.firecrawl.transport,'mcp');assert.equal(outputs.gather.toolReadiness.tavily.transport,'api');
 assert.equal(outputs.read[0].readCount,1);assert.equal(outputs.read[0].blockedCount,0);assert.equal(assessedSource.bodyText,literal);
 const candidate=outputs.assess.claimLedger.candidates[0];assert.equal(candidate.productPrice,45000);assert.equal(candidate.productPriceEvidence.provenance.provider,'firecrawl');assert.equal(candidate.eligibility.provisional,true);assert.equal(candidate.eligibility.checkoutVerified,false);
}finally{globalThis.fetch=originalFetch;for(const[k,v]of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
console.log('PASS: Gemini tools → Tavily discovery → deduplicated Firecrawl MCP extraction → durable source snapshot → read reuse → provisional attributed claim ledger');
