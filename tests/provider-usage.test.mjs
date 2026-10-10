import assert from 'node:assert/strict';
import {loadProviderUsage, PROVIDER_USAGE_LIMITS} from '../lib/admin/provider-usage.ts';

const env = {GOOGLE_API_KEY: 'fixture-google-secret', GOOGLE_CLOUD_PROJECT: 'fixture-project',
  SERPAPI_API_KEY: 'fixture-serp-secret', BRIGHT_DATA_API_TOKEN: 'fixture-bright-secret',
  FIRECRAWL_API_KEY: 'fixture-fire-secret', TAVILY_API_KEY: 'fixture-tavily-secret',
  TAVILY_ACCESS_MODE: 'keyless', KEEPA_API_KEY: 'fixture-keepa-secret', RESEND_API_KEY: 'fixture-email-secret',
  TURSO_DATABASE_URL: 'libsql://fixture.turso.io', TURSO_AUTH_TOKEN: 'fixture-database-secret'};
const now = () => Date.parse('2026-10-10T05:00:00Z');
const fixtures = {
  'serpapi.com': {api_key: env.SERPAPI_API_KEY, account_email: 'private-account@example.com', plan_name: 'Sensitive account label',
    total_searches_left: 260, this_month_usage: 0, searches_per_month: 250, plan_searches_left: 250, extra_credits: 10, plan_renewal_date: '2026-11-09'},
  'api.brightdata.com': {balance: '12.34', credit: 0, prepayment: 0, pending_costs: 1.5},
  'api.firecrawl.dev': {success: true, data: {remainingCredits: 750, planCredits: 500, billingPeriodEnd: '2026-11-10T00:00:00Z'}},
  'api.tavily.com': {key: {usage: 20, limit: null}, account: {plan_usage: 40, plan_limit: 1000, paygo_usage: 0, paygo_limit: 100}},
  'api.keepa.com': {tokensLeft: -3, refillRate: 20, refillIn: 12000, tokensConsumed: 0},
};
const calls = [];
const fetchFixture = async (target, init) => {
  const url = new URL(target), headers = new Headers(init.headers); calls.push(url);
  assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  assert.equal(headers.get('Accept'), 'application/json'); assert.equal(init.body, undefined);
  const paths = {'serpapi.com': '/account.json', 'api.brightdata.com': '/customer/balance',
    'api.firecrawl.dev': '/v2/team/credit-usage', 'api.tavily.com': '/usage', 'api.keepa.com': '/token'};
  assert.equal(url.pathname, paths[url.hostname], 'Only fixed read-only account endpoints may be requested');
  if (url.hostname === 'serpapi.com') {assert.equal(url.searchParams.get('api_key'), env.SERPAPI_API_KEY); assert.equal(headers.has('Authorization'), false);}
  else if (url.hostname === 'api.keepa.com') {assert.equal(url.searchParams.get('key'), env.KEEPA_API_KEY); assert.equal(headers.has('Authorization'), false);}
  else {assert.equal(url.search, ''); const expected = url.hostname === 'api.brightdata.com' ? env.BRIGHT_DATA_API_TOKEN : url.hostname === 'api.firecrawl.dev' ? env.FIRECRAWL_API_KEY : env.TAVILY_API_KEY;
    assert.equal(headers.get('Authorization'), `Bearer ${expected}`);}
  return Response.json(fixtures[url.hostname]);
};
const snapshot = await loadProviderUsage({env, fetch: fetchFixture, now});
assert.equal(snapshot.checkedAt, '2026-10-10T05:00:00.000Z'); assert.equal(calls.length, 5);
assert.deepEqual(snapshot.providers.map(p => p.id), ['vertex', 'serpapi', 'brightdata', 'firecrawl', 'tavily', 'keepa', 'resend', 'turso']);
const card = id => snapshot.providers.find(p => p.id === id);
const values = id => card(id).metrics.map(m => m.value);
assert.deepEqual(values('serpapi'), [260, 0, 250, 250, 10]); assert.equal(card('serpapi').resetAt, '2026-11-09T00:00:00.000Z');
assert.deepEqual(values('brightdata'), [12.34, 0, 0, 1.5]); assert.ok(card('brightdata').metrics.every(m => m.unit === 'USD'));
assert.match(card('brightdata').message, /does not expose remaining free scraper credits/);
assert.deepEqual(values('firecrawl'), [750, 500], 'Extra Firecrawl credits must not produce invented negative used credits');
assert.equal(card('firecrawl').metrics.some(m => /used/i.test(m.label)), false);
assert.deepEqual(values('tavily'), [960, 40, 1000, 0, 100, 20, null]); assert.match(card('tavily').message, /keyless/);
assert.deepEqual(values('keepa'), [-3, 20]); assert.equal(card('keepa').resetAt, null);
assert.equal(card('vertex').status, 'unsupported'); assert.equal(card('vertex').metrics.length, 0);
for (const sensitive of [...Object.values(env).filter(v => v.includes('secret')), 'private-account@example.com', 'Sensitive account label', 'fixture-project']) {
  assert.equal(JSON.stringify(snapshot).includes(sensitive), false, 'Raw credentials and account identity must never leave the adapter');
}
assert.ok(snapshot.providers.every(p => p.checkedAt === snapshot.checkedAt && p.consoleUrl.startsWith('https://')));

const unconfigured = await loadProviderUsage({env: {}, now, fetch: async () => {throw Error('Unconfigured adapters must not make HTTP requests');}});
assert.ok(unconfigured.providers.every(p => p.status === 'not_configured' && p.metrics.length === 0));
const invalidKey = await loadProviderUsage({env: {SERPAPI_API_KEY: 'invalid\nheader'}, now, fetch: async () => {throw Error('Invalid credentials must not make HTTP requests');}});
assert.equal(invalidKey.providers.find(p => p.id === 'serpapi').status, 'not_configured');
const localDatabase = await loadProviderUsage({env: {TURSO_DATABASE_URL: 'file:./local.db'}, now});
assert.equal(localDatabase.providers.find(p => p.id === 'turso').status, 'not_configured');

let independentCalls = 0;
const failed = await loadProviderUsage({env, now, fetch: async target => {
  independentCalls++; const host = new URL(target).hostname;
  if (host === 'serpapi.com') return new Response('private error echoed fixture-serp-secret', {status: 401});
  if (host === 'api.brightdata.com') throw Error('private transport credentials fixture-bright-secret');
  if (host === 'api.tavily.com') return new Response('private rate limit', {status: 429});
  return Response.json(fixtures[host]);
}});
assert.equal(independentCalls, 5, 'Failed checks do not retry and do not prevent independent providers');
assert.equal(failed.providers.find(p => p.id === 'serpapi').status, 'access_denied');
assert.equal(failed.providers.find(p => p.id === 'brightdata').status, 'unavailable');
assert.equal(failed.providers.find(p => p.id === 'tavily').status, 'rate_limited');
assert.equal(failed.providers.find(p => p.id === 'firecrawl').status, 'available');
assert.equal(JSON.stringify(failed).includes('private'), false);
assert.equal(JSON.stringify(failed).includes('fixture-'), false);

for (const payload of [{success: false, error: 'private provider instructions'}, {}, [], {data: {remainingCredits: 'secret', planCredits: Number.MAX_VALUE}}, {data: {remainingCredits: -1}}]) {
  const result = await loadProviderUsage({env: {FIRECRAWL_API_KEY: env.FIRECRAWL_API_KEY}, now, fetch: async () => Response.json(payload)});
  const provider = result.providers.find(p => p.id === 'firecrawl'); assert.equal(provider.status, 'unavailable'); assert.deepEqual(provider.metrics, []);
}
for (const response of [new Response('{bad json'), new Response('x'.repeat(PROVIDER_USAGE_LIMITS.maxResponseBytes + 1)),
  new Response('{}', {headers: {'content-length': String(PROVIDER_USAGE_LIMITS.maxResponseBytes + 1)}})]) {
  const result = await loadProviderUsage({env: {SERPAPI_API_KEY: env.SERPAPI_API_KEY}, now, fetch: async () => response});
  assert.equal(result.providers.find(p => p.id === 'serpapi').status, 'unavailable');
}
const zero = await loadProviderUsage({env: {TAVILY_API_KEY: env.TAVILY_API_KEY}, now,
  fetch: async () => Response.json({account: {plan_usage: 0, plan_limit: 0}, key: {usage: 0, limit: -1}})});
assert.equal(zero.providers.find(p => p.id === 'tavily').metrics[0].value, 0);
assert.equal(zero.providers.find(p => p.id === 'tavily').metrics.at(-1).value, null, 'Unknown or sentinel limits must not become fake negative quotas');
const controller = new AbortController(); controller.abort(); let abortCalls = 0;
const cancelled = await loadProviderUsage({env: {SERPAPI_API_KEY: env.SERPAPI_API_KEY}, now, signal: controller.signal,
  fetch: async () => {abortCalls++; throw Error('Cancelled requests must not fetch');}});
assert.equal(cancelled.providers.find(p => p.id === 'serpapi').status, 'unavailable'); assert.equal(abortCalls, 0);
const midFlight = new AbortController();
const pending = loadProviderUsage({env: {SERPAPI_API_KEY: env.SERPAPI_API_KEY}, now, signal: midFlight.signal, fetch: async () => new Promise(() => {})});
midFlight.abort(); assert.equal((await pending).providers.find(p => p.id === 'serpapi').status, 'unavailable', 'Cancellation bounds even a transport that ignores its signal');

console.log('PASS: private account usage projections, zero/unknown balances, Firecrawl extra credits, Bright USD/free-credit distinction, Tavily account/keyless scope, fixed read-only endpoints, independent errors, bounded bodies and cancellation');
