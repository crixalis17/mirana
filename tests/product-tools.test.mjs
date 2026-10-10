import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (error) { if (specifier.startsWith('.')) return next(`${specifier}.ts`, context); throw error; } } });
const { allowedProductUrl, executeProductTool, productToolsConfigured, PRODUCT_TOOL_LIMITS } = await import('../lib/research/product-tools.ts');

const env = { SERPAPI_API_KEY: 'serpapi-test-credential-canary', BRIGHT_DATA_API_TOKEN: 'brightdata-test-credential-canary',
  BRIGHT_DATA_AMAZON_DATASET_ID: 'gd_l7q7dkf244hwjntr0', BRIGHT_DATA_FLIPKART_DATASET_ID: 'gd_miclurf22isv1rslin', KEEPA_API_KEY: 'keepa-test-credential-canary' };
const signal = new AbortController().signal, now = () => Date.parse('2026-10-08T12:00:00Z');
const amazon = 'https://www.amazon.in/dp/B0F3GWXLTS';
const flipkart = 'https://www.flipkart.com/exact-tablet/p/itm7a45f835f4a1d?pid=TABGXN2FB6HQMGYQ';
const calls = []; let hooks = 0;
const run = (name, input, payload, extra = {}) => executeProductTool(name, input, signal, { env, now,
  beforeToolCall: async () => { hooks++; }, fetch: async (url, init) => { calls.push({ url: new URL(url), init }); return new Response(JSON.stringify(payload)); }, ...extra });

assert.deepEqual(productToolsConfigured({}), { serpapi: false, brightdataAmazon: false, brightdataFlipkart: false, keepa: false });
assert.equal(productToolsConfigured({ BRIGHT_DATA_API_TOKEN: 'x' }).brightdataAmazon, false);
assert.equal(productToolsConfigured(env).brightdataFlipkart, true);
assert.equal(allowedProductUrl('https://amazon.in/Tablet/dp/B0F3GWXLTS?tag=tracking#anchor'), amazon);
assert.equal(allowedProductUrl(`${flipkart}&otracker=x#anchor`), flipkart);
assert.equal(allowedProductUrl('https://www.apple.com/in/ipad?tracking=x'), 'https://www.apple.com/in/ipad');
assert.equal(allowedProductUrl('https://www.apple.com/in/ipad', true), null);
for (const bad of ['http://amazon.in/dp/B0F3GWXLTS', 'https://amazon.in.evil.test/dp/B0F3GWXLTS', 'https://user:pass@amazon.in/dp/B0F3GWXLTS',
  'https://amazon.in:8443/dp/B0F3GWXLTS', 'https://127.0.0.1/dp/B0F3GWXLTS', 'https://www.amazon.in/gp/cart', 'https://www.flipkart.com/search?q=x',
  'https://www.flipkart.com/exact/p/itm7a45?pid=TABGXN2FB6HQMGYQ&redirect=https://evil.test', 'https://www.amazon.in/%64p/B0F3GWXLTS']) {
  // Unrecognized query keys are removed rather than followed on valid product URLs.
  if (bad.includes('&redirect=')) assert.equal(allowedProductUrl(bad), 'https://www.flipkart.com/exact/p/itm7a45?pid=TABGXN2FB6HQMGYQ');
  else assert.equal(allowedProductUrl(bad), null, bad);
}
const noFetch = async () => { throw new Error('Unexpected external request'); };
assert.equal((await run('search_products_india', { query: 'tablet' }, {}, { env: {}, fetch: noFetch })).error.code, 'NOT_CONFIGURED');
const before = hooks;
for (const input of [{ url: 'https://evil.test/item' }, { url: amazon, endpoint: 'https://evil.test' }]) assert.equal((await run('fetch_product_listing', input, {}, { fetch: noFetch })).error.code, 'INVALID_INPUT');
assert.equal((await run('amazon_price_history', { asin: 'B0F3GWXLTS', days: 181 }, {}, { fetch: noFetch })).error.code, 'INVALID_INPUT');
assert.equal((await run('search_products_india', { query: 'x' }, {}, { fetch: noFetch })).error.code, 'INVALID_INPUT');
assert.equal(hooks, before);
await assert.rejects(run('fetch_product_listing', { url: amazon }, [], { beforeToolCall: async () => { throw new Error('Lease expired'); }, fetch: noFetch }), /Lease expired/);

const searched = await run('search_products_india', { query: 'tablet with pen', limit: 2, location: 'Chennai, Tamil Nadu, India' }, { search_metadata: { status: 'Success' }, shopping_results: [
  { title: 'Other region', link: amazon, price: '$499', extracted_price: 499 },
  { title: 'Duplicate', link: amazon, price: '₹20,000', extracted_price: 20000 },
  { title: 'Exact tablet', link: flipkart, price: 'INR 19000', extracted_price: 19000, seller: 'Unverified search seller', availability: 'in stock' },
  { title: 'Arbitrary URL', link: 'https://evil.test/product', price: '₹1', extracted_price: 1 },
] });
assert.equal(searched.ok, true); assert.equal(searched.offers.length, 2); assert.equal(searched.offers[0].price, null);
assert.equal(searched.offers[1].price, 19000); assert.equal(searched.offers[1].availability, null); assert.equal(searched.offers[1].seller, null);
assert.equal(searched.observations[0].kind, 'search-result'); assert.equal(searched.observations[0].offer, null);
assert.equal(calls.at(-1).url.hostname, 'serpapi.com'); assert.equal(calls.at(-1).url.searchParams.get('no_cache'), 'true');
assert.equal(calls.at(-1).url.searchParams.get('gl'), 'in'); assert.equal(calls.at(-1).init.redirect, 'error'); assert.equal(calls.at(-1).init.cache, 'no-store');
assert.ok(calls.at(-1).url.searchParams.get('json_restrictor').includes('product_link'));
assert.equal(calls.at(-1).url.searchParams.get('json_restrictor').includes('thumbnail'),false);
assert.equal(calls.at(-1).url.searchParams.get('location'), 'Chennai, Tamil Nadu, India');
assert.equal(JSON.stringify(searched).includes(env.SERPAPI_API_KEY), false);

// Current SerpApi Shopping exposes Google product pages separately from a
// merchant URL. Preserve discovery without manufacturing a checkout offer.
const googleLead='https://www.google.com/shopping/product/12345?gl=in';
const leads=await run('search_products_india',{query:'tablet India',limit:2},{search_metadata:{status:'Success'},shopping_results:[
  {title:'Acme tablet 128GB',product_link:googleLead,source:'Amazon.in',price:'₹19000',extracted_price:19000},
  {title:'Duplicate',product_link:googleLead},
  {title:'Untrusted target',product_link:'https://attacker.invalid/shopping/product/12345'},
  {title:'Credential link',product_link:'https://www.google.com/shopping/product/23456?api_key=private'},
]});
assert.equal(leads.ok,true);assert.equal(leads.offers.length,0);assert.equal(leads.discoveryLeads.length,1);
assert.deepEqual(leads.discoveryLeads[0],{url:googleLead,title:'Acme tablet 128GB',retailerLabel:'Amazon.in',evidenceKind:'search-result',merchantUrl:null});
assert.equal(leads.observations[0].offer,null);assert.equal(leads.discoveryLeads[0].price,undefined);
assert.equal((await run('search_products_india',{query:'tablet'},{search_metadata:{status:'Success'},shopping_results:[{title:'Exact',product_link:amazon,price:'₹19000',extracted_price:19000}]})).offers[0].url,amazon);

const row = { url: amazon, title: 'Exact tablet 256 GB', final_price: '21999.00', currency: 'INR', seller_name: 'Seller A',
  availability: 'In stock', condition: 'New', timestamp: '2026-10-08T11:00:00Z', variant_id: '256GB' };
const listed = await run('fetch_product_listing', { url: amazon }, [row]);
assert.equal(listed.ok, true); assert.equal(listed.offers[0].price, 21999); assert.equal(listed.offers[0].checkoutVerified, false);
assert.equal(listed.offers[0].total, null); assert.equal(listed.offers[0].postcodeAvailability, null);
assert.equal(listed.observations[0].kind, 'listing-api'); assert.equal(listed.observations[0].exactId, 'B0F3GWXLTS');
assert.equal(listed.observations[0].freshness.verifiedFresh, false); assert.equal(listed.observations[0].fieldPaths.price, 'final_price');
assert.deepEqual(JSON.parse(listed.sources[0].bodyText), row);
assert.equal(listed.sources[0].contentHash, createHash('sha256').update(listed.sources[0].bodyText).digest('hex'));
assert.equal(listed.sources[0].textTrust, 'untrusted-provider-api-json');
assert.equal(calls.at(-1).url.hostname, 'api.brightdata.com'); assert.equal(calls.at(-1).url.searchParams.get('dataset_id'), env.BRIGHT_DATA_AMAZON_DATASET_ID);
assert.deepEqual(JSON.parse(calls.at(-1).init.body), { input: [{ url: amazon }], limit_per_input: 1 });
const wrong = await run('fetch_product_listing', { url: amazon }, [{ ...row, url: 'https://www.amazon.in/dp/B0BDHWDR12' }]);
assert.equal(wrong.error.code, 'NO_DATA'); assert.equal(wrong.sources.length, 0);
assert.equal((await run('fetch_product_listing', { url: flipkart }, [{ ...row, url: flipkart, title: undefined, name: 'Flipkart variant' }])).ok, true);
assert.equal(calls.at(-1).url.searchParams.get('dataset_id'), env.BRIGHT_DATA_FLIPKART_DATASET_ID);
assert.equal((await run('fetch_product_listing', { url: amazon }, [{ ...row, currency: 'USD' }])).offers[0].price, null);
assert.equal((await run('fetch_product_listing', { url: amazon }, [{ ...row, final_price: '₹21,999' }])).offers[0].price, null);
assert.equal((await run('fetch_product_listing', { url: amazon }, [{ ...row, error: 'blocked' }])).error.code, 'NO_DATA');

const keepaMinute = Math.floor(now() / 60000) - 21564000;
const tracked = await run('amazon_price_history', { asin: 'B0F3GWXLTS', days: 30 }, { products: [{ asin: 'B0F3GWXLTS', domainId: 10, productType: 0,
  lastUpdate: keepaMinute - 60, csv: [[keepaMinute - 100, 1900000, keepaMinute - 50, -1], [keepaMinute - 5, 2000000]] }] });
assert.equal(tracked.ok, true); assert.equal(tracked.offers.length, 0); assert.equal(tracked.observations[0].kind, 'price-history');
assert.equal(tracked.history.points[0].price, 19000); assert.equal(tracked.history.points[1].price, null);
assert.equal(calls.at(-1).url.searchParams.get('domain'), '10'); assert.equal(calls.at(-1).url.searchParams.get('update'), '-1');
assert.equal(calls.at(-1).url.searchParams.get('days'), '30'); assert.equal(JSON.stringify(tracked).includes(env.KEEPA_API_KEY), false);
assert.equal((await run('amazon_price_history', { asin: 'B0F3GWXLTS' }, { products: [{ asin: 'B0F3GWXLTS', domainId: 1, productType: 0 }] })).error.code, 'NO_DATA');

for (const status of [202, 401, 429, 500]) {
  const failed = await run('fetch_product_listing', { url: amazon }, null, { fetch: async () => new Response('Private provider details', { status }) });
  assert.equal(failed.ok, false); assert.equal(JSON.stringify(failed).includes('Private provider details'), false);
  assert.equal(failed.sources.length, 0); if (status === 202) assert.equal(failed.error.code, 'PENDING');
}
const echoed = await run('fetch_product_listing', { url: amazon }, [{ ...row, debug: env.BRIGHT_DATA_API_TOKEN }]);
assert.equal(echoed.error.code, 'INVALID_OUTPUT'); assert.equal(JSON.stringify(echoed).includes(env.BRIGHT_DATA_API_TOKEN), false);
const broken = await run('fetch_product_listing', { url: amazon }, null, { fetch: async () => { throw new Error('SECRET UPSTREAM BODY'); } });
assert.equal(JSON.stringify(broken).includes('SECRET'), false);
const oversized = await run('fetch_product_listing', { url: amazon }, [{ ...row, description: 'x'.repeat(PRODUCT_TOOL_LIMITS.maxResponseBytes) }]);
assert.equal(oversized.error.code, 'INVALID_OUTPUT');
const bounded = await run('fetch_product_listing', { url: amazon }, [{ ...row, description: 'x'.repeat(20000) }]);
assert.equal(bounded.ok, true); assert.equal(bounded.sources[0].truncated, true); assert.equal(bounded.sources[0].bodyText.length, PRODUCT_TOOL_LIMITS.maxEvidenceChars);
assert.equal(bounded.sources[0].contentHash, createHash('sha256').update(bounded.sources[0].bodyText).digest('hex'));
const aborted = new AbortController(); aborted.abort();
assert.equal((await executeProductTool('fetch_product_listing', { url: amazon }, aborted.signal, { env, fetch: noFetch })).error.code, 'INTERRUPTED');
const stalledAbort = new AbortController(); let cancelled = false;
const stalled = executeProductTool('fetch_product_listing', { url: amazon }, stalledAbort.signal, { env, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
setTimeout(() => stalledAbort.abort(), 5);
assert.equal((await stalled).error.code, 'INTERRUPTED'); assert.equal(cancelled, true);
console.log('PASS: product tool configuration, allowlists, fixed endpoints, fresh-search flags, exact listing identity, API provenance/hash integrity, conservative costs, optional historical-only Keepa, quota/error redaction, bounded bodies, cancellation and durable budget hook');
