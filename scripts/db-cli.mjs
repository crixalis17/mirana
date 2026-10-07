import {existsSync,readFileSync} from 'node:fs';
import {createClient} from '@libsql/client';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
export function cliDatabase(){
  const url=process.env.TURSO_DATABASE_URL||(process.env.NODE_ENV!=='production'?'file:./mirana.local.db':'');
  if(!url)throw new Error('Set TURSO_DATABASE_URL.');
  if(process.env.NODE_ENV==='production'&&(!/^(libsql|https):\/\//.test(url)||!process.env.TURSO_AUTH_TOKEN))throw new Error('Production requires a hosted Turso database and token.');
  return createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
}
export async function migrate(client){
  const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
  await client.batch(sql.split(';').map(s=>s.trim()).filter(Boolean),'write');
}
export function argumentsMap(){
  const args=process.argv.slice(2),out={};
  for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1])throw new Error('Supply named arguments with values.');out[args[i].slice(2)]=args[i+1];}
  return out;
}
