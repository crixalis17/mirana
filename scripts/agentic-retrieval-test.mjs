// Local experiment only: no worker, database, assessment, ranking or email imports.
import {existsSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {retrievalCases} from './retrieval-cases.mjs';
if(!process.argv.includes('--live'))throw new Error('Pass --live to run the credit-consuming retrieval experiment.');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(error){if(s.startsWith('.'))return next(`${s}.ts`,c);throw error;}}});
const {researchAdkStructuredRequest}=await import('../lib/research/adk-structured.ts');
const {researchToolAgentRequest}=await import('../lib/research/tool-agent.ts');
const {RETRIEVAL_HARNESS}=await import('../lib/research/retrieval-harness.ts');
const {safeResearchErrorCode}=await import('../lib/research/logs.ts');
const env={...process.env,RESEARCH_NATIVE_SEARCH_ENABLED:'false'};
const signal=new AbortController().signal;
const startedAt=new Date().toISOString();
const caseIndex=process.argv.indexOf('--case');
const caseName=caseIndex>=0?process.argv[caseIndex+1]:'washing';
if(!Object.hasOwn(retrievalCases,caseName))throw new Error('Choose --case washing or --case watch.');
const {brief,planningHints,retrievalHints,maxSteps=RETRIEVAL_HARNESS.modelTurns}=retrievalCases[caseName];
const allowedTools=['search_web_firecrawl','search_web_tavily','search_products_india','read_source_firecrawl','read_source_tavily','fetch_product_listing'];
const report={startedAt,brief,model:'gemini-3.8-flash',thinking:'HIGH',maxOutputTokens:65536,stoppedBefore:'assessment/ranking/recommendations',toolInputs:[],toolResults:[],modelCalls:0};
const output=caseName==='washing'?'/private/tmp/mirana-agentic-retrieval.json':'/private/tmp/mirana-agentic-watch-retrieval.json';
const save=()=>writeFileSync(output,JSON.stringify(report,null,2));
try{
  console.log(JSON.stringify({event:'planning-start',model:report.model}));
  const schema={type:'object',properties:Object.fromEntries(['hardRequirements','softPreferences','searchObjectives','evidenceGaps'].map(name=>[name,{type:'array',items:{type:'string'}}])),required:['hardRequirements','softPreferences','searchObjectives','evidenceGaps'],additionalProperties:false};
  const planning=await researchAdkStructuredRequest({instructions:`Draft a retrieval research plan from the supplied shopping brief. Separate explicit hard constraints from optional preferences and evidence gaps. Explicit colour, connectivity and condition requirements must remain hard constraints. Never relax them to alternatives without user authorization or invent a required band colour. If ambiguity exists, record a clarification gap rather than broaden eligibility. Do not introduce inferred features as hard requirements. Preserve the supplied category without adding specifications from memory. ${planningHints} Do not pick products, rank or recommend. State discovery objectives that a subsequent tool agent can use to construct its own queries.`,input:{brief,referenceDate:startedAt},schema,maxOutputTokens:65536},signal,{env});
  report.plan=JSON.parse(planning.text);report.planningUsage=planning.usage;save();
  console.log(JSON.stringify({event:'plan',plan:report.plan}));
  const answer=await researchToolAgentRequest({search:true,input:{brief,researchPlan:report.plan},instructions:`You are a retrieval agent, not a recommendation agent. You control query generation, tool choice, and adaptive follow-up using the supplied research plan. The original user brief takes precedence over a mistaken or overbroad plan; preserve all explicit constraints. Do not assess, rank, recommend, or select a winner. Use the registered external APIs; built-in Google Search is disabled in this experiment.
Construct short natural search queries from category, explicit specifications, country and useful retailer/model terms. Never search literal placeholders such as "Any reputable brand". Do not concatenate the whole narrative into a query. Unspecified attributes remain optional. Conditional discounts cannot replace unconditional price evidence. Budget is INR ${brief.budget}. ${retrievalHints}
Manage retrieval breadth before deep extraction: cover Amazon India, Flipkart and at least one official manufacturer source during discovery. Try different configured discovery providers before spending calls on repeated brand searches from a single provider. Then fetch/read exact candidates; reserve enough calls for listing verification.
Discover exact new product listings across Amazon India, Flipkart and official Indian manufacturer pages. Try configured discovery providers where useful, refine broad/wrong-variant results, then read or fetch exact observed URLs. Never invent a product URL or model number. For extraction, reuse the canonical exact listing URL returned by fetch_product_listing when available rather than a presentation slug. Use fetch_product_listing to cross-check discovered Amazon India or Flipkart product URLs when possible. Search snippets are leads, not verified specifications or checkout prices. Find multiple exact candidates without padding to topN. Read tool responses before selecting the next query. Do not repeat identical failed calls. End with an unranked factual retrieval inventory containing observed product/model, source URL, literal price, explicit variant evidence, and unresolved facts. No purchase recommendation or comparative suitability reasoning. Every inventory fact needs an exact tool-returned source and literal supporting text. Missing normalized price stays unknown; never calculate an assumed selling price from MRP and percentage discount. Do not invent specifications, local service/delivery coverage, contact details, bank offers or candidate models from memory. Do not invent a third candidate to fill topN. Stop when sufficient retrieval evidence is collected or report access failures honestly.`},signal,{env,maxSteps,maxToolCalls:RETRIEVAL_HARNESS.toolCalls,retrievalOnly:true,maxOutputTokens:65536,allowedTools,
    beforeModelCall:async()=>{report.modelCalls++;console.log(JSON.stringify({event:'retrieval-model',turn:report.modelCalls}));},
    onToolInput:(tool,input)=>{const entry={tool,input,at:new Date().toISOString()};report.toolInputs.push(entry);save();console.log(JSON.stringify({event:'tool-input',...entry}));},
    onToolOutput:(tool,result)=>{report.providerReceipts??=[];report.providerReceipts.push({tool,ok:result.ok,error:result.error,offers:result.offers,discoveryLeads:result.discoveryLeads,sources:result.sources?.map(source=>({url:source.url,title:source.title,excerpt:source.excerpt,bodyText:source.bodyText?.slice(0,12000)})),source:result.source?{url:result.source.url,title:result.source.title,bodyText:result.source.bodyText?.slice(0,12000)}:undefined});save();},
    onToolTrace:trace=>{report.toolResults.push(trace);save();console.log(JSON.stringify({event:'tool-result',...trace}));}});
  report.inventory=answer.text;report.usage=answer.usage;report.observations=answer.diagnostics.observations.map(({provider,title,url,exactId,kind,offer})=>({provider,title,url,exactId,kind,offer}));
  report.sources=answer.sources;report.limitations=answer.diagnostics.limitations;report.finishedAt=new Date().toISOString();report.status='completed';save();
  console.log(JSON.stringify({event:'completed',output,modelCalls:report.modelCalls,toolCalls:report.toolResults.length,observations:report.observations.length,sources:report.sources.length}));
}catch(error){report.status='failed';report.errorCode=safeResearchErrorCode(error);report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({event:'failed',errorCode:report.errorCode,output}));process.exitCode=1;}
