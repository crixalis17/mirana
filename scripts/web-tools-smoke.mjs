// Explicit operator smoke check: two provider operations, no model/DB/email/job calls.
import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const provider=process.argv[2]||'tavily';
if(!['firecrawl','tavily'].includes(provider))throw new Error('Select tavily or firecrawl.');
const {executeWebTool,webToolsConfigured}=await import('../lib/research/web-tools.ts');
if(!webToolsConfigured()[provider].ready){console.log(JSON.stringify({provider,ok:false,errorCode:'NOT_CONFIGURED'}));process.exitCode=1;}
else{
 const url='https://www.samsung.com/in/tablets/galaxy-tab-s/galaxy-tab-s9-fe-wifi-light-green-256gb-sm-x510nlgeinu';
 for(const [tool,input]of [[`search_web_${provider}`,{query:'Samsung Galaxy Tab S9 FE drawing review'}],[`read_source_${provider}`,{url}]]){
  const start=Date.now(),result=await executeWebTool(tool,input,new AbortController().signal);
  console.log(JSON.stringify({provider,tool,ok:result.ok,elapsedMs:Date.now()-start,sourceCount:result.sources.length+(result.source?1:0),
    sourceChars:result.source?.bodyText.length||0,textTrust:result.source?.textTrust||null,errorCode:result.error?.code||null}));
  if(!result.ok){process.exitCode=1;break;}
 }
}
