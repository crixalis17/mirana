// Readiness only: never sends HTTP requests, starts jobs or prints credential values.
import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {productToolsConfigured}=await import('../lib/research/product-tools.ts');
const {webToolsConfigured}=await import('../lib/research/web-tools.ts');
const {toolAgentVertexEndpoint}=await import('../lib/research/tool-agent.ts');
let vertex=false;try{toolAgentVertexEndpoint();vertex=true;}catch{}
console.log(JSON.stringify({productionEnabled:process.env.RESEARCH_PRODUCTION_ENABLED==='true',providerSelected:process.env.RESEARCH_PROVIDER==='vertex',toolsEnabled:process.env.RESEARCH_TOOLS_ENABLED==='true',model:'gemini-3.8-flash',vertexReady:vertex,...productToolsConfigured(),...webToolsConfigured()},null,2));
