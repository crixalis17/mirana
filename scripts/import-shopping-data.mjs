import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {argumentsMap,cliDatabase,migrate} from './db-cli.mjs';
const args=argumentsMap();
if(!args.input||!/^\d{10,255}$/.test(args['owner-sub']||''))throw new Error('Usage: node scripts/import-shopping-data.mjs --input PRIVATE_ARCHIVE_JSON --owner-sub VERIFIED_GOOGLE_SUBJECT');
const archive=JSON.parse(readFileSync(args.input,'utf8'));
if(archive.version!==1||!Array.isArray(archive.purchases)||!Array.isArray(archive.observations)||archive.purchases.length>1000||archive.observations.length>100000)throw new Error('Invalid shopping archive.');
const client=cliDatabase(),owner=args['owner-sub'];
try{
  await migrate(client);
  const row=(await client.execute({sql:'SELECT settings FROM workspace WHERE id=?',args:[owner]})).rows[0];
  if(!row||!JSON.parse(row.settings).email)throw new Error('Owner must first sign in to Mirana with a verified Google account. No automatic owner adoption is performed.');
  const now=new Date().toISOString(),ids=new Set(),statements=[];
  for(const p of archive.purchases){
    if(typeof p.id!=='string'||!p.id||ids.has(p.id)||!p.brief||typeof p.brief!=='object')throw new Error('Invalid or duplicate shopping item.');ids.add(p.id);
    const brief={...p.brief,alerts:{...p.brief.alerts,enabled:false}};delete brief.retryAt;delete brief.researchError;delete brief.nextCheckAt;
    statements.push({sql:'INSERT INTO purchases (id,user_id,brief,report,status,updated_at) VALUES (?,?,?,?,?,?)',args:[p.id,owner,JSON.stringify(brief),p.report?JSON.stringify(p.report):null,'paused',now]});
  }
  for(const o of archive.observations){if(!ids.has(o.purchaseId))throw new Error('Observation references an unknown item.');const payload={...o,id:randomUUID()};statements.push({sql:'INSERT INTO observations (id,purchase_id,payload) VALUES (?,?,?)',args:[payload.id,o.purchaseId,JSON.stringify(payload)]});}
  if(archive.profile)statements.push({sql:"UPDATE workspace SET settings=json_set(settings,'$.profile',json(?)) WHERE id=?",args:[JSON.stringify(archive.profile),owner]});
  // Plain INSERT intentionally rejects collisions; the entire batch rolls back.
  if(statements.length)await client.batch(statements,'write');
  console.log(`Imported ${archive.purchases.length} items into the explicitly selected owner. Items are paused; alerts are disabled. Reopen individually after review.`);
}finally{client.close();}
