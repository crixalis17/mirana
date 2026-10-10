// Explicit local-only dispatcher. Starting this command can invoke the configured research provider.
import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Use an authenticated deployed dispatcher for production.');
if (process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABASE_URL.startsWith('file:')) throw new Error('The local worker requires a local SQLite database.');
delete process.env.TURSO_AUTH_TOKEN;
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}}});
const {runWorker}=await import('../lib/worker.ts');
let stopped=false,last='';
process.on('SIGINT',()=>{stopped=true;});
process.on('SIGTERM',()=>{stopped=true;});
console.log('Mirana local research dispatcher started. Saved jobs resume; configured AI calls can incur usage charges.');
while(!stopped){
  try{
    const result=await runWorker(),summary=JSON.stringify(result);
    if(summary!==last){console.log(summary);last=summary;}
  }catch{if(last!=='error'){console.log('Local worker could not run. Check the local migration and provider configuration.');last='error';}}
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,5000));
}
