import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createResearchAllowanceTools} from '../lib/admin/research-allowance-webmcp.ts';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@/'))return next(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
  try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}
}});
const directory=await mkdtemp(join(tmpdir(),'mirana-test-allowance-'));
const keys=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','NODE_ENV','VERCEL','APP_ORIGIN','AUTH_PREVIEW_MODE','ADMIN_OWNER_EMAIL','RESEARCH_USER_DAILY_JOB_LIMIT','RESEARCH_DAILY_JOB_LIMIT'];
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
const originalFetch=globalThis.fetch;let client,network=0;
try{
  keys.forEach(key=>delete process.env[key]);
  Object.assign(process.env,{TURSO_DATABASE_URL:`file:${join(directory,'test.db')}`,NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:5176',AUTH_PREVIEW_MODE:'false',ADMIN_OWNER_EMAIL:'owner@example.invalid',RESEARCH_USER_DAILY_JOB_LIMIT:'1',RESEARCH_DAILY_JOB_LIMIT:'1'});
  globalThis.fetch=async()=>{network++;throw new Error('No network allowed.');};
  const {databaseClient}=await import('../lib/database.ts');client=databaseClient();
  const schema=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');await client.batch(schema.split(';').map(sql=>sql.trim()).filter(Boolean),'write');
  const {hash}=await import('../lib/auth.ts'),jobs=await import('../lib/research-jobs.ts'),api=await import('../app/api/admin/research-allowance/route.ts');
  const owner={id:'owner',email:'owner@example.invalid',provider:'google',emailVerified:true,preview:false};
  for(const [token,identity] of [['owner',owner],['other',{...owner,id:'other',email:'other@example.invalid'}],['unverified',{...owner,emailVerified:false}],['preview',{...owner,preview:true}]])
    await client.execute({sql:'INSERT INTO sessions (id,user,expires) VALUES (?,?,?)',args:[await hash(token),JSON.stringify(identity),Date.now()+600000]});
  const request=(token='owner',method='POST',data={},headers={})=>new Request(`${process.env.APP_ORIGIN}/api/admin/research-allowance`,{method,headers:{...(token?{cookie:`mirana_session=${token}`} :{}),origin:process.env.APP_ORIGIN,'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(data)}:{})});
  for(const method of ['GET','POST'])for(const [token,status] of [[null,401],['other',403],['unverified',403],['preview',403]])assert.equal((await api[method](request(token,method))).status,status);
  assert.equal((await api.POST(request('owner','POST',{}, {origin:'https://evil.invalid'}))).status,403);
  assert.equal((await api.POST(request('owner','POST',{}, {'sec-fetch-site':'cross-site'}))).status,403);
  assert.equal((await api.POST(request('owner','POST',{userId:'other'}))).status,400);
  assert.equal((await api.POST(request('owner','POST',[]))).status,400);
  await assert.rejects(jobs.researchTestAllowance({...owner,emailVerified:false},true),/Owner access/);
  assert.equal((await (await api.POST(request())).json()).testPending,false,'No extra permit while normal allowance exists.');
  const insert=async(id,user='owner')=>client.execute({sql:'INSERT INTO purchases (id,user_id,brief,status,updated_at) VALUES (?,?,?,?,?)',args:[id,user,JSON.stringify({brand:'Apple',modelName:'Laptop',requestText:'Laptop',briefRevision:1}),'queued',new Date().toISOString()]});
  await insert('seed');await jobs.ensureResearchJob('seed','owner');process.env.VERCEL='1';
  for(const id of ['a','b','c','d'])await insert(id);await insert('other','other');
  await assert.rejects(jobs.ensureResearchJob('a','owner'),error=>error.code==='daily_limit');
  const grants=await Promise.all([api.POST(request()),api.POST(request())]);
  for(const response of grants){assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal((await response.json()).testPending,true);}
  assert.equal(Number((await client.execute("SELECT COUNT(*) AS n FROM research_test_permits WHERE status='pending'")).rows[0].n),1);
  await assert.rejects(jobs.ensureResearchJob('other','other'),error=>error.code==='daily_limit');
  const starts=await Promise.allSettled([jobs.ensureResearchJob('a','owner'),jobs.ensureResearchJob('b','owner')]);
  assert.equal(starts.filter(result=>result.status==='fulfilled').length,1,'Only one concurrent new job may consume the permit.');
  const winner=starts.find(result=>result.status==='fulfilled').value;
  const pending=await jobs.researchTestAllowance(owner);assert.equal(pending.testPending,false);assert.equal(pending.userJobs,2);assert.equal(pending.userLimit,1);assert.equal(pending.globalLimit,1);
  const permit=(await client.execute("SELECT * FROM research_test_permits WHERE status='used'")).rows[0];assert.equal(permit.consumed_job_id,winner.id);
  await jobs.researchTestAllowance(owner,true);
  assert.equal((await jobs.ensureResearchJob(winner.purchaseId,'owner')).id,winner.id);
  assert.equal((await jobs.researchTestAllowance(owner)).testPending,true,'Reading/resuming an existing job does not consume a permit.');
  process.env.ADMIN_OWNER_EMAIL='different@example.invalid';await assert.rejects(jobs.ensureResearchJob('c','owner'),error=>error.code==='daily_limit');process.env.ADMIN_OWNER_EMAIL=owner.email;
  await client.execute("UPDATE research_test_permits SET expires_at='2000-01-01T00:00:00.000Z' WHERE status='pending'");
  await assert.rejects(jobs.ensureResearchJob('c','owner'),error=>error.code==='daily_limit');assert.equal((await jobs.researchTestAllowance(owner)).testPending,false);
  await jobs.researchTestAllowance(owner,true);
  await client.execute("CREATE TRIGGER reject_test_job BEFORE INSERT ON research_jobs WHEN NEW.purchase_id='d' BEGIN SELECT RAISE(ABORT,'isolated failure'); END");
  await assert.rejects(jobs.ensureResearchJob('d','owner'));assert.equal((await jobs.researchTestAllowance(owner)).testPending,true,'Failed job insertion rolls back permit consumption.');
  const calls=[];const tools=createResearchAllowanceTools(async grant=>{calls.push(grant);return {testPending:grant};});
  for(const tool of tools){assert.equal(tool.inputSchema.additionalProperties,false);assert.equal((await tool.execute({userId:'other'})).kind,'validation');}
  await tools[0].execute({});await tools[1].execute({});assert.deepEqual(calls,[false,true]);assert.equal(tools[1].annotations.consequentialHint,true);
  assert.equal(network,0);console.log('PASS: owner-only test permits, CSRF/body validation, idempotent grants, atomic one-job consumption, expiry, owner changes, rollback, preserved quotas and usage, WebMCP.');
}finally{globalThis.fetch=originalFetch;client?.close();await rm(directory,{recursive:true,force:true});for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
