// Explicit, small live runtime check. Consumes model/search credits; never opens
// a database, resumes shopping jobs, sends email or runs the stopped benchmark.
import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
if(!process.argv.includes('--live'))throw new Error('Use --live to explicitly authorize model and product-search usage.');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(error){if(s.startsWith('.'))return next(`${s}.ts`,c);throw error;}}});
const {researchToolAgentRequest}=await import('../lib/research/tool-agent.ts');
const {safeResearchErrorCode}=await import('../lib/research/logs.ts');
const start=Date.now();let dispatchedModels=0,dispatchedTools=0;
try {
  const answer=await researchToolAgentRequest({search:true,
    instructions:'This is a runtime integration smoke check, not a buying recommendation. First call search_products_india exactly once with query "Samsung Galaxy Tab S10 FE 128GB WiFi India" and limit 2. Do not call other functions. After the result, write two concise sentences reporting what evidence was returned and its limitations. Do not claim verified checkout or recommend a purchase.',
    input:{category:'Tablet',country:'India',purpose:'Verify the registered shopping search function and subsequent ADK model turn.'}},new AbortController().signal,
    {maxSteps:2,maxOutputTokens:65536,
      beforeModelCall:async()=>{dispatchedModels++;},beforeToolCall:async()=>{dispatchedTools++;},
      onToolTrace:trace=>console.log(JSON.stringify({event:'adk-tool',...trace}))});
  const ok=answer.diagnostics.runtime==='google-adk'&&dispatchedModels===2&&dispatchedTools===1&&
    answer.diagnostics.toolCalls.some(call=>call.tool==='search_products_india'&&call.status==='ok')&&answer.sources.length>0;
  console.log(JSON.stringify({ok,runtime:answer.diagnostics.runtime,model:answer.usage.model,thinking:'HIGH',elapsedMs:Date.now()-start,
    modelCalls:dispatchedModels,toolCalls:dispatchedTools,sources:answer.sources.length,usage:answer.usage,
    tools:answer.diagnostics.toolCalls.map(({tool,provider,status,sourceCount,elapsedMs})=>({tool,provider,status,sourceCount,elapsedMs}))}));
  if(!ok)process.exitCode=1;
} catch(error) {
  console.log(JSON.stringify({ok:false,runtime:'google-adk',elapsedMs:Date.now()-start,modelCalls:dispatchedModels,toolCalls:dispatchedTools,errorCode:safeResearchErrorCode(error)}));
  process.exitCode=1;
}
