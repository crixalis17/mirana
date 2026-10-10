import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

registerHooks({resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('.')) return next(`${specifier}.ts`, context); throw error; }
}});

const directory = await mkdtemp(join(tmpdir(), 'mirana-purchases-'));
const keys = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'NODE_ENV', 'APP_ORIGIN',
  'MIRANA_DEMO_MODE', 'AUTH_PREVIEW_MODE', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'WORKER_MIN_INTERVAL_HOURS'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let client;
try {
  process.env.TURSO_DATABASE_URL = `file:${join(directory, 'test.db')}`;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.NODE_ENV = 'test';
  process.env.APP_ORIGIN = 'http://127.0.0.1:5176';
  process.env.AUTH_PREVIEW_MODE = 'false';
  delete process.env.MIRANA_DEMO_MODE;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  process.env.WORKER_MIN_INTERVAL_HOURS = '24';
  globalThis.fetch = async () => { throw new Error('This local route test must not make network calls.'); };

  const {databaseClient} = await import('../lib/database.ts');
  client = databaseClient();
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await client.batch(schema.split(';').map(sql => sql.trim()).filter(Boolean), 'write');
  const {db, initialize} = await import('../lib/store.ts');
  const {hash} = await import('../lib/auth.ts');
  const {POST, PATCH} = await import('../app/api/purchases/route.ts');
  const {POST: preferences} = await import('../app/api/preferences/route.ts');
  const {GET: workspace} = await import('../app/api/workspace/route.ts');
  const identities = [
    {id: 'purchase-owner-a', name: 'A', email: 'a@example.invalid', token: 'local-session-a'},
    {id: 'purchase-owner-b', name: 'B', email: 'b@example.invalid', token: 'local-session-b'},
  ];
  for (const {token, ...identity} of identities) {
    await initialize(identity.id);
    await db().prepare('INSERT INTO sessions (id,user,expires) VALUES (?,?,?)')
      .bind(await hash(token), JSON.stringify({...identity, preview: false}), Date.now() + 600000).run();
  }
  const [ownerA, ownerB] = identities;
  const request = (path, method, data, token = ownerA.token, extraHeaders = {}) => new Request(`http://localhost:5176/api/${path}`, {
    method,
    headers: {origin: process.env.APP_ORIGIN, ...(token ? {cookie: `mirana_session=${token}`} : {}),
      ...(method === 'GET' ? {} : {'content-type': 'application/json'}), ...extraHeaders},
    ...(method === 'GET' ? {} : {body: JSON.stringify(data)}),
  });
  const read = async (token = ownerA.token) => {
    const response = await workspace(request('workspace', 'GET', null, token));
    assert.equal(response.status, 200);
    return response.json();
  };
  const readItem = async id => (await read()).purchases.find(p => p.id === id);
  const patch = (data, token = ownerA.token, headers = {}) => PATCH(request('purchases', 'PATCH', data, token, headers));

  assert.equal((await preferences(request('preferences', 'POST', {
    postcode: '600019', banks: 'SBI', priorities: ['Performance'], customTags: ['Palm rejection', 'Low weight'],
  }))).status, 200);
  const input = {brand:'Acme',modelName:'Slate',requestText: 'A tablet for handwritten notes and detailed sketching under INR 60000.',
    budget: 60000, topN: 3, alerts: {enabled: true, mode: 'interval', intervalHours: 24, rule: 'history'}};
  const created = await POST(request('purchases', 'POST', input));
  assert.equal(created.status, 201);
  const item = await created.json();
  assert.equal(item.status, 'queued');
  assert.equal(item.report, null);
  assert.equal(item.postcode, '600019');
  assert.equal(item.banks, 'SBI');
  assert.deepEqual(item.priorities, ['Performance']);
  assert.deepEqual(item.customTags, ['Palm rejection', 'Low weight']);
  assert.equal((await readItem(item.id)).alerts.enabled, true);
  // Global preference changes never rewrite a captured buying brief.
  assert.equal((await preferences(request('preferences', 'POST', {
    postcode: '110001', banks: 'HDFC', priorities: ['Durability'], customTags: ['Long updates'],
  }))).status, 200);
  assert.deepEqual((await readItem(item.id)).customTags, ['Palm rejection', 'Low weight']);
  await db().prepare('UPDATE purchases SET report=?,status=? WHERE id=?')
    .bind(JSON.stringify({summary: 'Old research', checkedAt: '2026-10-07T04:30:00Z', products: []}), 'ready', item.id).run();
  const edit = {brand:'Acme',modelName:'Slate',budget: 60000, topN: 3, requestText: 'A tablet for notes, PDFs and detailed sketching under INR 60000.'};
  assert.equal((await patch({id: item.id, action: 'edit', brief: edit})).status, 200);
  let persisted = await readItem(item.id);
  assert.deepEqual(persisted.priorities, ['Performance']);
  assert.deepEqual(persisted.customTags, ['Palm rejection', 'Low weight']);
  assert.equal(persisted.postcode, '600019');
  assert.equal(persisted.banks, 'SBI');
  assert.equal(persisted.alerts.enabled, true);
  assert.equal(persisted.alerts.intervalHours, 24);
  assert.equal(persisted.status, 'queued');
  assert.equal(persisted.report, null);
  assert.equal((await patch({id: item.id, action: 'edit', brief: {
    ...edit, priorities: ['Ease of use'], customTags: ['Quiet stylus'],
  }})).status, 200);
  persisted = await readItem(item.id);
  assert.deepEqual(persisted.priorities, ['Ease of use']);
  assert.deepEqual(persisted.customTags, ['Quiet stylus']);
  assert.equal((await patch({id: item.id, action: 'edit', brief: {...edit, banks: ''}})).status, 200);
  persisted = await readItem(item.id);
  assert.equal(persisted.banks, '');
  assert.equal(persisted.postcode, '600019');
  assert.deepEqual(persisted.customTags, ['Quiet stylus']);
  assert.equal(persisted.alerts.enabled, true);
  assert.equal((await POST(request('purchases', 'POST', {...input, postcode: '6000199'}))).status, 400);
  assert.equal((await patch({id: item.id, action: 'edit', brief: {...edit, postcode: '6000199'}})).status, 400);
  assert.equal((await readItem(item.id)).postcode, '600019');

  assert.equal((await patch({id: item.id, action: 'alerts', alerts: {
    enabled: true, mode: 'interval', intervalHours: 12, rule: 'history',
  }})).status, 400);
  assert.equal((await patch({id: item.id, action: 'alerts', alerts: {
    enabled: true, mode: 'interval', intervalHours: 24, rule: 'history',
  }})).status, 200);
  persisted = await readItem(item.id);
  assert.equal(persisted.alerts.intervalHours, 24);
  assert.ok(Number.isFinite(Date.parse(persisted.nextCheckAt)));
  assert.equal((await patch({id: item.id, action: 'alerts', alerts: {
    enabled: true, mode: 'daily', dailyHour: 10, intervalHours: 12, rule: 'target', targetPrice: 45000,
  }})).status, 200);
  persisted = await readItem(item.id);
  assert.equal(persisted.alerts.dailyHour, 10);
  assert.equal(persisted.alerts.targetPrice, 45000);
  assert.equal(new Date(persisted.nextCheckAt).getUTCHours(), 4);
  assert.equal(new Date(persisted.nextCheckAt).getUTCMinutes(), 30);
  for (const invalid of [{mode: 'daily', dailyHour: 24}, {mode: 'interval', intervalHours: 169},
    {mode: 'interval', intervalHours: 24, rule: 'target', targetPrice: 0}]) {
    assert.equal((await patch({id: item.id, action: 'alerts', alerts: {enabled: true, ...invalid}})).status, 400);
  }
  assert.equal((await patch({id: item.id, action: 'pause'})).status, 200);
  assert.equal((await readItem(item.id)).status, 'paused');
  assert.equal((await patch({id: item.id, action: 'resume'})).status, 200);
  assert.equal((await readItem(item.id)).status, 'queued');
  assert.equal((await patch({id: item.id, action: 'bought'})).status, 200);
  persisted = await readItem(item.id);
  assert.equal(persisted.status, 'bought');
  assert.equal(persisted.alerts.enabled, false);
  const impossible = await patch({id: item.id, action: 'alerts', alerts: {enabled: true, intervalHours: 24}});
  assert.equal(impossible.status, 400);
  assert.match((await impossible.json()).error, /Reopen/);
  assert.equal((await readItem(item.id)).alerts.enabled, false);
  assert.equal((await patch({id: item.id, action: 'resume'})).status, 200);
  assert.equal((await readItem(item.id)).alerts.enabled, false);
  assert.equal((await patch({id: item.id, action: 'alerts', alerts: {enabled: true, intervalHours: 24}})).status, 200);

  const optionalResponse=await POST(request('purchases','POST',{brand:'Apple',modelName:'Watch',postcode:'',banks:''}));assert.equal(optionalResponse.status,201);const optionalItem=await optionalResponse.json();assert.equal(optionalItem.postcode,'');assert.equal(optionalItem.budget,null);assert.equal(optionalItem.banks,'');
  assert.equal((await POST(request('purchases','POST',{modelName:'Watch'}))).status,400);
  assert.equal((await POST(request('purchases','POST',{brand:'Apple'}))).status,400);
  assert.equal((await patch({id:item.id,action:'alerts',alerts:{enabled:true,intervalHours:48}})).status,400);
  const second = await POST(request('purchases', 'POST', {...input, postcode: '110001'}, ownerB.token));
  assert.equal(second.status, 201);
  const itemB = await second.json();
  assert.deepEqual((await read(ownerB.token)).purchases.map(p => p.id), [itemB.id]);
  assert.deepEqual(new Set((await read()).purchases.map(p => p.id)), new Set([item.id,optionalItem.id]));
  for (const action of ['pause', 'resume', 'bought', 'edit', 'alerts']) {
    assert.equal((await patch({id: item.id, action, brief: edit, alerts: {enabled: false}}, ownerB.token)).status, 404);
  }
  assert.equal((await patch({id: itemB.id, action: 'pause'})).status, 404);
  assert.equal((await patch({id: 'missing-item', action: 'pause'})).status, 404);
  const countBefore = (await db().prepare('SELECT count(*) AS count FROM purchases').first()).count;
  assert.equal((await POST(request('purchases', 'POST', input, null))).status, 400);
  assert.equal((await patch({id: item.id, action: 'pause'}, null)).status, 400);
  assert.equal((await workspace(request('workspace', 'GET', null, null))).status, 401);
  assert.equal((await POST(request('purchases', 'POST', input, ownerA.token, {origin: 'https://evil.example'}))).status, 400);
  assert.equal((await patch({id: item.id, action: 'bought'}, ownerA.token, {'sec-fetch-site': 'cross-site'})).status, 400);
  assert.equal((await db().prepare('SELECT count(*) AS count FROM purchases').first()).count, countBefore);
  assert.equal((await readItem(item.id)).status, 'queued');
  assert.equal((await readItem(item.id)).alerts.enabled, true);
  console.log('PASS: shopping item API persistence, captured preferences/tags, edit reset, lifecycle, alert cadence/consent, account isolation and anonymous/cross-site rejection');
} finally {
  globalThis.fetch = originalFetch;
  client?.close();
  await rm(directory, {recursive: true, force: true});
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
