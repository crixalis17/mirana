import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePreferences, priorityPresets, MAX_CUSTOM_TAGS, MAX_TAG_LENGTH } from '../lib/preferences.ts';

assert.equal(priorityPresets.length,8);
assert.equal(MAX_CUSTOM_TAGS,16);assert.equal(MAX_TAG_LENGTH,80);
const legacy={priorities:['Smooth & fast','Long life','Simple software','Pen quality','Portability','Value for money'],customTags:[' portability ','LIGHT WEIGHT','light weight','Performance']};
const expected={priorities:['Performance','Durability','Ease of use','Value for money'],customTags:['Pen quality','Portability','LIGHT WEIGHT']};
assert.deepEqual(normalizePreferences(legacy),expected);
assert.deepEqual(legacy.priorities,['Smooth & fast','Long life','Simple software','Pen quality','Portability','Value for money']);
assert.deepEqual(normalizePreferences(),{priorities:[],customTags:[]});
assert.deepEqual(normalizePreferences({priorities:[' performance ','PERFORMANCE'],customTags:[' quiet ','QUIET',' ','Durability']}),{priorities:['Performance'],customTags:['quiet','Durability']});
assert.equal(normalizePreferences({customTags:['x'.repeat(80)]}).customTags[0].length,80);
assert.equal(normalizePreferences({customTags:Array.from({length:16},(_,i)=>`tag ${i}`)}).customTags.length,16);
for(const invalid of [null,[],{priorities:'Performance'},{priorities:[1]},{customTags:[] ,priorities:null},{customTags:[{}]},{customTags:['x'.repeat(81)]},{customTags:Array.from({length:17},(_,i)=>`tag ${i}`)}])assert.throws(()=>normalizePreferences(invalid));

registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@/'))return next(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
  try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}
}});
const directory=await mkdtemp(join(tmpdir(),'mirana-preferences-'));
const envKeys=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','NODE_ENV','MIRANA_DEMO_MODE','WORKER_MIN_INTERVAL_HOURS'];
const savedEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
let client;
try{
  process.env.TURSO_DATABASE_URL=`file:${join(directory,'test.db')}`;
  delete process.env.TURSO_AUTH_TOKEN;process.env.NODE_ENV='test';delete process.env.MIRANA_DEMO_MODE;process.env.WORKER_MIN_INTERVAL_HOURS='24';
  const {databaseClient}=await import('../lib/database.ts');client=databaseClient();
  const schema=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');
  await client.batch(schema.split(';').map(sql=>sql.trim()).filter(Boolean),'write');
  const {db,initialize,readWorkspace,brief}=await import('../lib/store.ts');
  const {hash}=await import('../lib/auth.ts');
  const {POST}=await import('../app/api/preferences/route.ts');
  const {getResearchQueue}=await import('../lib/automation.ts');
  const userId='preferences-test-user',token='local-unit-session';
  await initialize(userId);
  await db().prepare('INSERT INTO sessions (id,user,expires) VALUES (?,?,?)').bind(await hash(token),JSON.stringify({id:userId,name:'Test user',email:'test@example.invalid'}),Date.now()+60000).run();
  const request=data=>new Request('http://localhost/api/preferences',{method:'POST',headers:{cookie:`mirana_session=${token}`,'content-type':'application/json',origin:'http://localhost'},body:JSON.stringify(data)});
  const response=await POST(request({...legacy,postcode:'',banks:''}));assert.equal(response.status,200);
  let workspace=await readWorkspace(userId);assert.deepEqual(normalizePreferences(workspace.settings.profile),expected);
  const persisted=JSON.parse((await db().prepare('SELECT settings FROM workspace WHERE id=?').bind(userId).first()).settings).profile;
  assert.deepEqual(persisted.customTags,expected.customTags);
  const itemInput={brand:'Acme',modelName:'Blender',requestText:'A blender for quick breakfasts',postcode:'110001'};
  const captured=brief(itemInput,workspace.settings.profile);assert.deepEqual(normalizePreferences(captured),expected);
  captured.customTags.push('Travel-friendly');assert.equal(workspace.settings.profile.customTags.includes('Travel-friendly'),false);captured.customTags.pop();
  await db().prepare('INSERT INTO purchases (id,user_id,brief,status,updated_at) VALUES (?,?,?,?,?)').bind('captured-item',userId,JSON.stringify(captured),'queued',new Date().toISOString()).run();
  assert.equal((await POST(request({priorities:['Ease of use'],customTags:['Easy to clean'],postcode:''}))).status,200);
  workspace=await readWorkspace(userId);
  assert.deepEqual(workspace.settings.profile.customTags,['Easy to clean']);
  assert.deepEqual(normalizePreferences(workspace.purchases[0]),expected);
  const edited=brief({...itemInput,requestText:'A blender for quick breakfasts and smoothies'},workspace.settings.profile,captured);
  assert.deepEqual(normalizePreferences(edited),expected);
  const changed=brief({...itemInput,customTags:['Quiet motor']},workspace.settings.profile,captured);
  assert.deepEqual(changed.priorities,expected.priorities);assert.deepEqual(changed.customTags,['Quiet motor']);
  assert.equal((await POST(request({priorities:['Durability'],customTags:[12],postcode:''}))).status,400);
  assert.equal((await POST(request({priorities:['Durability'],customTags:[],postcode:'123'}))).status,400);
  assert.equal((await POST(request({priorities:['Durability'],customTags:[],postcode:'110001'}))).status,200);
  assert.equal((await POST(request({banks:'SBI',customTags:['Quiet home']}))).status,200);
  assert.equal((await POST(request({priorities:['Ease of use']}))).status,200);
  const partial=(await readWorkspace(userId)).settings.profile;
  assert.equal(partial.postcode,'110001');assert.equal(partial.banks,'SBI');assert.deepEqual(partial.customTags,['Quiet home']);
  assert.equal((await POST(request({banks:'',postcode:''}))).status,200);
  const cleared=(await readWorkspace(userId)).settings.profile;
  assert.equal(cleared.postcode,'');assert.equal(cleared.banks,'');
  await db().prepare("UPDATE workspace SET settings=json_set(settings,'$.profile',json(?)) WHERE id=?").bind(JSON.stringify({...legacy,postcode:'110001'}),userId).run();
  const before=(await db().prepare('SELECT settings FROM workspace WHERE id=?').bind(userId).first()).settings;
  assert.deepEqual(normalizePreferences((await readWorkspace(userId)).settings.profile),expected);
  assert.equal((await db().prepare('SELECT settings FROM workspace WHERE id=?').bind(userId).first()).settings,before);
  const oldBrief={...captured,priorities:['Smooth & fast','Pen quality','Portability']};delete oldBrief.customTags;
  await db().prepare('UPDATE purchases SET brief=? WHERE id=?').bind(JSON.stringify(oldBrief),'captured-item').run();
  const queued=(await getResearchQueue({userId})).queue[0];
  assert.deepEqual(queued.priorities,oldBrief.priorities);
  assert.deepEqual(normalizePreferences(queued),{priorities:['Performance'],customTags:['Pen quality','Portability']});
  assert.deepEqual((await readWorkspace(userId)).purchases[0].customTags,['Pen quality','Portability']);
  // Exercise the actual persisted queue -> provider boundary, with all network mocked.
  const {researchPurchase}=await import('../lib/research.ts');
  const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;let providerCalls=0;
  try{
    process.env.OPENAI_API_KEY='mock-preference-test-key';
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');providerCalls++;
      const input=JSON.parse(options.body),submitted=JSON.parse(input.input);
      assert.deepEqual(submitted.brief.priorities,['Performance']);
      assert.deepEqual(submitted.brief.customTags,['Pen quality','Portability']);
      assert.match(input.instructions,/secondary ranking preferences/);
      const message={type:'message',content:[{type:'output_text',text:providerCalls===1?'Research with preference evidence':JSON.stringify({summary:'No supported candidate.',category:'Home',uses:[],mustHave:[],budget:null,needsClarification:[],products:[],excluded:[]}),annotations:[]}]};
      return Response.json({status:'completed',output:providerCalls===1?[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://example.org/review'}]}},message]:[message]});
    };
    const researched=await researchPurchase(queued,[],AbortSignal.timeout(1000));
    assert.equal(providerCalls,2);assert.deepEqual(researched.report.preferencesUsed,{priorities:['Performance'],customTags:['Pen quality','Portability']});
  }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;}
}finally{
  client?.close();await rm(directory,{recursive:true,force:true});
  for(const key of envKeys){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key];}
}
console.log('PASS: generic presets, legacy migration, tag validation/dedup, profile API persistence, immutable item snapshots, edit preservation and old queue preferences');
