import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canViewUsage} from '../lib/admin/access.ts';
import {createUsageCache, USAGE_CACHE_MS, USAGE_REFRESH_MS} from '../lib/admin/usage-cache.ts';

registerHooks({resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  try {return next(specifier, context);} catch (error) {
    if (specifier.startsWith('.')) return next(`${specifier}.ts`, context);
    throw error;
  }
}});

const owner = {id: 'google-owner-fixture', name: 'Owner', email: 'owner@example.invalid',
  provider: 'google', emailVerified: true, preview: false};
assert.equal(canViewUsage(owner, owner.email), true);
assert.equal(canViewUsage(owner, ''), false);
assert.equal(canViewUsage(owner, 'owner@example.invalid,other@gmail.com'), false);
assert.equal(canViewUsage({...owner, email: 'OWNER@EXAMPLE.INVALID'}, owner.email), true);
for (const value of [null, {}, [], {...owner, preview: true}, {...owner, preview: undefined},
  {...owner, provider: 'email'}, {...owner, provider: undefined}, {...owner, emailVerified: false},
  {...owner, emailVerified: undefined}, {...owner, id: 'local-demo'}, {...owner, id: ''},
  {...owner, email: 'someone@gmail.com'}, {...owner, email: 'owner+test@example.invalid'},
  {...owner, email: 'owner@example.invalid.evil'}, {...owner, email: ['owner@example.invalid']}]) {
  assert.equal(canViewUsage(value, owner.email), false);
}

let now = 1_800_000_000_000;
const cached = createUsageCache(() => now);
let loads = 0;
const load = async () => {loads++; return {credit: loads};};
assert.equal((await cached('a', load)).cache.cached, false);
assert.equal((await cached('a', load)).cache.cached, true);
assert.equal((await cached('a', load, true)).cache.cached, true);
now += USAGE_REFRESH_MS;
assert.equal((await cached('a', load, true)).snapshot.credit, 2);
now += USAGE_CACHE_MS;
assert.equal((await cached('a', load)).snapshot.credit, 3);
assert.equal((await cached('b', load)).snapshot.credit, 4);
let release;
const pending = cached('c', () => new Promise(resolve => {release = resolve;}));
const duplicate = cached('c', () => {throw new Error('Duplicate must not load.');});
release({credit: 5});
assert.deepEqual((await pending).snapshot, (await duplicate).snapshot);
await assert.rejects(cached('d', async () => {throw new Error('provider failed');}));
assert.equal((await cached('d', load)).cache.cached, false);
// A load begun before credential rotation must not replace the new credentials' snapshot.
let oldRelease;
const oldPending = cached('old', () => new Promise(resolve => {oldRelease = resolve;}));
await cached('new', load);
oldRelease({credit: -1});
await oldPending;
assert.notEqual((await cached('new', load)).snapshot.credit, -1);

const directory = await mkdtemp(join(tmpdir(), 'mirana-admin-'));
const envKeys = ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','NODE_ENV','APP_ORIGIN','AUTH_PREVIEW_MODE',
  'ADMIN_OWNER_EMAIL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SERPAPI_API_KEY','BRIGHT_DATA_API_TOKEN',
  'FIRECRAWL_API_KEY','TAVILY_API_KEY','KEEPA_API_KEY','GOOGLE_API_KEY','GOOGLE_CLOUD_PROJECT'];
const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let client;
try {
  for (const key of envKeys) delete process.env[key];
  process.env.TURSO_DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_OWNER_EMAIL = owner.email;
  process.env.APP_ORIGIN = 'http://127.0.0.1:5176';
  process.env.AUTH_PREVIEW_MODE = 'false';
  process.env.SERPAPI_API_KEY = 'private-fixture-secret';
  let providerRequests = 0;
  globalThis.fetch = async input => {
    providerRequests++;
    assert.equal(new URL(input).hostname, 'serpapi.com');
    return Response.json({total_searches_left: 91, this_month_usage: 9, account_email: 'do-not-expose@example.invalid',
      api_key: 'private-fixture-secret', plan_name: 'unnecessary-account-metadata'});
  };
  const {databaseClient} = await import('../lib/database.ts');
  client = databaseClient();
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await client.batch(schema.split(';').map(sql => sql.trim()).filter(Boolean), 'write');
  const {db} = await import('../lib/store.ts');
  const {hash} = await import('../lib/auth.ts');
  const {GET, POST} = await import('../app/api/admin/usage/route.ts');
  const identities = {owner, other: {...owner, id: 'other', email: 'other@gmail.com'},
    legacy: {id: 'legacy', email: owner.email, preview: false},
    unverified: {...owner, emailVerified: false}, preview: {...owner, preview: true}};
  for (const [token, identity] of Object.entries(identities)) {
    await db().prepare('INSERT INTO sessions (id,user,expires) VALUES (?,?,?)')
      .bind(await hash(token), JSON.stringify(identity), Date.now()+600_000).run();
  }
  await db().prepare('INSERT INTO sessions (id,user,expires) VALUES (?,?,?)')
    .bind(await hash('expired'), JSON.stringify(owner), Date.now()-1).run();
  const request = (token, method = 'GET', headers = {}) => new Request(`${process.env.APP_ORIGIN}/api/admin/usage`, {
    method, headers: {...(token ? {cookie: `mirana_session=${token}`} : {}), ...headers},
  });
  for (const method of ['GET','POST']) {
    const handler = method === 'GET' ? GET : POST;
    for (const [token, status] of [[null,401],['other',403],['legacy',403],['unverified',403],['preview',403],['expired',401]]) {
      const response = await handler(request(token, method, {'x-user-email': owner.email, 'x-admin': 'true'}));
      assert.equal(response.status, status);
      assert.match(response.headers.get('cache-control'), /private, no-store/);
      assert.equal(response.headers.get('vary'), 'Cookie');
      assert.equal(providerRequests, 0, 'Unauthorized request cannot query provider accounts.');
    }
  }
  for (const headers of [{origin: 'https://evil.example'}, {'sec-fetch-site': 'cross-site'}]) {
    assert.equal((await POST(request('owner','POST',headers))).status, 403);
  }
  assert.equal(providerRequests, 0);
  const response = await GET(request('owner'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.providers.find(p => p.id==='serpapi').status, 'available');
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /private-fixture-secret|do-not-expose|api_key|unnecessary-account-metadata/);
  assert.equal(providerRequests, 1);
  assert.equal((await POST(request('owner','POST',{origin: process.env.APP_ORIGIN}))).status, 200);
  assert.equal(providerRequests, 1, 'Refresh is throttled within 30 seconds.');
  delete process.env.ADMIN_OWNER_EMAIL;
  assert.equal((await GET(request('owner'))).status, 403, 'Missing owner configuration denies access even to a cached snapshot.');
  assert.equal(providerRequests, 1);
  process.env.ADMIN_OWNER_EMAIL = owner.email;
  process.env.AUTH_PREVIEW_MODE = 'true';
  assert.equal((await GET(request(null))).status, 403, 'Development preview is never an admin.');
  console.log('PASS: owner-only verified Google authorization, real session/API isolation, spoof/preview/cross-site denial, secret redaction, cache dedup/rotation/throttle.');
} finally {
  globalThis.fetch = originalFetch;
  client?.close();
  await rm(directory, {recursive: true, force: true});
  for (const [key,value] of Object.entries(saved)) {
    if (value===undefined) delete process.env[key]; else process.env[key]=value;
  }
}
