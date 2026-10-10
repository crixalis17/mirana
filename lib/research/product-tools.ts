import { createHash } from 'node:crypto';
import { canFetchListing } from '../research';

// Server transports use fixed provider endpoints. Retailer URLs are data inputs,
// never fetch destinations. API evidence is not original-page or checkout evidence.
type Json = Record<string, unknown>;
export type ProductToolName = 'search_products_india' | 'fetch_product_listing' | 'amazon_price_history';
export type ProductToolProvider = 'serpapi' | 'brightdata' | 'keepa';
export type ProductToolEnv = Partial<Record<'SERPAPI_API_KEY' | 'BRIGHT_DATA_API_TOKEN' | 'KEEPA_API_KEY' | 'BRIGHT_DATA_AMAZON_DATASET_ID' | 'BRIGHT_DATA_FLIPKART_DATASET_ID', string>>;
export type ProductApiSource = {
  url: string; retailerUrl: string | null; bodyText: string; contentHash: string; responseHash: string;
  retrievedAt: string; textTrust: 'untrusted-provider-api-json'; truncated: boolean;
  evidenceKind: 'search-result' | 'listing-extraction' | 'historical-tracker';
};
export type ProductOffer = {
  url: string; title: string | null; retailer: string; variant: string | null; seller: string | null;
  price: number | null; currency: 'INR' | null; condition: string | null; availability: string | null;
  providerCollectedAt: string | null; shipping: null; total: null; postcodeAvailability: null;
  checkoutVerified: false; evidenceKind: ProductApiSource['evidenceKind'];
};
export type ProductHistory = { asin: string; domain: 10; currency: 'INR'; lastProviderUpdate: string | null;
  points: { at: string; price: number | null; series: 'amazon' | 'marketplace-new' }[];
  truncated: boolean; note: string };
export type ProductObservation = {
  kind: 'search-result' | 'listing-api' | 'price-history'; provider: ProductToolProvider;
  requestedUrl: string | null; url: string | null; exactId: string | null; title: string | null;
  retrievedAt: string; providerUpdatedAt: string | null;
  freshness: { retrieval: 'search-cache-bypassed' | 'on-demand-scraper' | 'history-only'; cacheStatus: 'unknown'; verifiedFresh: false };
  offer: ProductOffer | null; source: ProductApiSource; fieldPaths: Partial<Record<keyof ProductOffer, string>>;
};
export type ProductToolResult = {
  ok: boolean; tool: ProductToolName; provider: ProductToolProvider; retrievedAt: string;
  offers: ProductOffer[]; sources: ProductApiSource[]; observations: ProductObservation[]; history?: ProductHistory; note: string;
  error?: { code: string; message: string; retryable: boolean };
  discoveryLeads?:Array<{url:string;title:string;retailerLabel:string|null;evidenceKind:'search-result';merchantUrl:null}>;
};
export type ProductToolOptions = { env?: ProductToolEnv; fetch?: typeof fetch; now?: () => number;
  beforeToolCall?: (tool: ProductToolName, provider: ProductToolProvider) => Promise<void> };
export const PRODUCT_TOOL_LIMITS = { timeoutMs: 65000, maxResponseBytes: 300000, maxOffers: 8,
  maxEvidenceChars: 12000, maxHistoryPoints: 120 } as const;
type ToolDefinition = { name: ProductToolName; description: string; inputSchema: {
  type: 'object'; properties: Record<string, { type: 'string' | 'integer'; minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number }>;
  required: string[]; additionalProperties: false } };
export const PRODUCT_TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: 'search_products_india' as const, description: 'Find India shopping leads via Google Shopping. Search prices are provisional; verify the exact retailer listing separately.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 250 }, limit: { type: 'integer', minimum: 1, maximum: 8 }, location: { type: 'string', minLength: 2, maxLength: 80 } }, required: ['query'], additionalProperties: false } },
  { name: 'fetch_product_listing' as const, description: 'Collect structured listing data for one Amazon.in or Flipkart product URL. This does not establish postcode delivery, complete cost or checkout.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', minLength: 10, maxLength: 1500 } }, required: ['url'], additionalProperties: false } },
  { name: 'amazon_price_history' as const, description: 'Read Keepa historical Amazon India prices for one exact ASIN. Historical tracker observations are not live stock or checkout evidence.',
    inputSchema: { type: 'object', properties: { asin: { type: 'string', pattern: '^[A-Z0-9]{10}$' }, days: { type: 'integer', minimum: 1, maximum: 180 } }, required: ['asin'], additionalProperties: false } },
];
// Dataset IDs from the provider's product scraper documentation, not model input.
// Operator must verify/choose the dataset; no hidden paid provider defaults.
function dataset(value: unknown): value is string { return typeof value === 'string' && /^gd_[a-z0-9]{8,40}$/.test(value); }
const ENDPOINTS = { serpapi: 'https://serpapi.com/search.json', brightdata: 'https://api.brightdata.com/datasets/v3/scrape', keepa: 'https://api.keepa.com/product' };
// Shopping responses include large image/filter payloads. Request only the
// discovery fields we consume while retaining the independent byte bound.
const SHOPPING_FIELDS='title,link,product_link,source,price,extracted_price';
const SHOPPING_PROJECTION=`error,search_metadata.status,shopping_results[0:40].{${SHOPPING_FIELDS}},inline_shopping_results[0:40].{${SHOPPING_FIELDS}},categorized_shopping_results[0:10].shopping_results[0:40].{${SHOPPING_FIELDS}}`;
const NOTE = 'Provider data is untrusted research evidence. Exact variant, seller, condition, postcode delivery, required accessories and complete unconditional checkout cost still require verification.';
function shoppingDiscoveryUrl(value:unknown):string|null {
  if(typeof value!=='string'||value.length>2000)return null;
  try {const url=new URL(value);
    if(url.protocol!=='https:'||url.port||url.username||url.password||
      !['www.google.com','www.google.co.in','google.com','google.co.in'].includes(url.hostname)||
      !(url.pathname.startsWith('/shopping/product/')||url.pathname==='/search'))return null;
    if([...url.searchParams.keys()].some(key=>/key|token|secret|signature|credential|password|auth/i.test(key)))return null;
    url.hash='';return url.href;
  }catch{return null;}
}
function credential(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && !/[\r\n]/.test(value); }
export function productToolsConfigured(env: ProductToolEnv = process.env as ProductToolEnv) {
  return { serpapi: credential(env.SERPAPI_API_KEY), brightdataAmazon: credential(env.BRIGHT_DATA_API_TOKEN) && dataset(env.BRIGHT_DATA_AMAZON_DATASET_ID),
    brightdataFlipkart: credential(env.BRIGHT_DATA_API_TOKEN) && dataset(env.BRIGHT_DATA_FLIPKART_DATASET_ID), keepa: credential(env.KEEPA_API_KEY) };
}
function record(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
function string(value: unknown, max = 250): string | null { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null; }
function amount(value: unknown): number | null {
  if (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value)) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e9 ? value : null;
}
function iso(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function allowedProductUrl(value: unknown, listingOnly = false): string | null {
  if (typeof value !== 'string' || value.length > 1500) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || /%|\\/.test(u.pathname)) return null;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'amazon.in') {
      const asin = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/)?.[1];
      return asin ? `https://www.amazon.in/dp/${asin}` : null;
    }
    if (host === 'flipkart.com' && /\/[a-z0-9-]+\/p\/itm[a-z0-9]+\/?$/i.test(u.pathname)) {
      const pid = u.searchParams.get('pid'), lid = u.searchParams.get('lid');
      u.search = ''; u.hash = '';
      if (pid && /^[A-Z0-9]{8,30}$/.test(pid)) u.searchParams.set('pid', pid);
      if (lid && /^[A-Z0-9]{8,80}$/.test(lid)) u.searchParams.set('lid', lid);
      return u.href;
    }
    if (!listingOnly && ((host === 'croma.com' && /\/p\/\d+\/?$/.test(u.pathname)) ||
      (host === 'reliancedigital.in' && /\/p\/[a-z0-9]+\/?$/i.test(u.pathname)))) {
      u.search = ''; u.hash = ''; return u.href;
    }
    // Approved manufacturer/store hosts share the existing original-source reader
    // allowlist. This only discovers links; it never fetches a new destination.
    if (!listingOnly && !['amazon.in', 'flipkart.com', 'croma.com', 'reliancedigital.in'].includes(host) && canFetchListing(u.href)) {
      u.search = ''; u.hash = ''; return u.href;
    }
  } catch { /* Invalid input never reaches a provider. */ }
  return null;
}
class ToolFailure extends Error {
  code: string; retryable: boolean;
  constructor(code: string, message: string, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}
async function responseJson(response: Response, secrets: string[], signal: AbortSignal) {
  if (response.status === 202) { await response.body?.cancel(); throw new ToolFailure('PENDING', 'Listing collection is still pending; no listing data is available yet.', false); }
  if (!response.ok) { await response.body?.cancel(); throw new ToolFailure(response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED',
    response.status === 429 ? 'Product provider quota or rate limit reached.' : 'Product provider rejected or could not complete the request.', response.status === 429 || response.status >= 500); }
  const reader = response.body?.getReader(); if (!reader) throw new ToolFailure('INVALID_OUTPUT', 'Product provider returned no data.');
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
    if (size > PRODUCT_TOOL_LIMITS.maxResponseBytes) { await reader.cancel(); throw new ToolFailure('INVALID_OUTPUT', 'Product provider response exceeded its size limit.'); }
    chunks.push(item.value); } } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  if (signal.aborted) throw new ToolFailure('INTERRUPTED', 'Product response was interrupted.');
  const raw = Buffer.concat(chunks).toString('utf8');
  // Some APIs echo request URLs. Never return a response containing our credentials.
  if (secrets.some(secret => secret && (raw.includes(secret) || raw.includes(encodeURIComponent(secret))))) throw new ToolFailure('INVALID_OUTPUT', 'Product provider response could not be safely retained.');
  try { return { data: JSON.parse(raw) as unknown, raw }; } catch { throw new ToolFailure('INVALID_OUTPUT', 'Product provider returned malformed data.'); }
}
function evidence(provider: ProductToolProvider, raw: string, retailerUrl: string | null, kind: ProductApiSource['evidenceKind'], retrievedAt: string): ProductApiSource {
  const bodyText = raw.slice(0, PRODUCT_TOOL_LIMITS.maxEvidenceChars);
  return { url: ENDPOINTS[provider], retailerUrl, bodyText, contentHash: createHash('sha256').update(bodyText).digest('hex'),
    responseHash: createHash('sha256').update(raw).digest('hex'), retrievedAt, textTrust: 'untrusted-provider-api-json',
    truncated: bodyText.length !== raw.length, evidenceKind: kind };
}
function offer(row: Json, url: string, kind: ProductApiSource['evidenceKind']): ProductOffer {
  const currency = row.currency === 'INR' ? 'INR' : null;
  return { url, title: string(row.title ?? row.name), retailer: new URL(url).hostname.replace(/^www\./, ''),
    variant: string(row.variant_id ?? row.variant), seller: string(row.seller_name ?? row.seller),
    price: currency ? amount(row.final_price ?? row.price) : null, currency,
    condition: string(row.condition), availability: string(row.availability), providerCollectedAt: iso(row.timestamp),
    shipping: null, total: null, postcodeAvailability: null, checkoutVerified: false, evidenceKind: kind };
}
function inputRecord(input: unknown, allowed: string[]) {
  const obj = record(input);
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(obj).some(key => !allowed.includes(key))) throw new ToolFailure('INVALID_INPUT', 'Product tool inputs are invalid.');
  return obj;
}
function integer(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) throw new ToolFailure('INVALID_INPUT', 'Product tool limit is invalid.');
  return Number(value);
}
function keepaDate(value: unknown): string | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 1e8 ? new Date((Number(value) + 21564000) * 60000).toISOString() : null;
}
export async function executeProductTool(name: ProductToolName, input: unknown, signal: AbortSignal, options: ProductToolOptions = {}): Promise<ProductToolResult> {
  if (typeof window !== 'undefined') throw new Error('Product transport is server-only.');
  const env = options.env ?? process.env, fetcher = options.fetch ?? fetch, now = options.now ?? Date.now;
  const provider: ProductToolProvider = name === 'search_products_india' ? 'serpapi' : name === 'fetch_product_listing' ? 'brightdata' : 'keepa';
  const base: ProductToolResult = { ok: false, tool: name, provider, retrievedAt: new Date(now()).toISOString(), offers: [], sources: [], observations: [], note: NOTE };
  let budgetHookFailed = false;
  try {
    let endpoint: URL, init: RequestInit = {}, listing: string | null = null, limit = 8, asin = '', days = 90;
    const key = provider === 'serpapi' ? env.SERPAPI_API_KEY : provider === 'brightdata' ? env.BRIGHT_DATA_API_TOKEN : env.KEEPA_API_KEY;
    if (name === 'search_products_india') {
      const args = inputRecord(input, ['query', 'limit', 'location']);
      if (typeof args.query !== 'string' || args.query.trim().length < 2 || args.query.length > 250 || /[\u0000-\u001f]/.test(args.query)) throw new ToolFailure('INVALID_INPUT', 'Shopping search query is invalid.');
      limit = integer(args.limit, 5, 8);
      if (args.location !== undefined && (typeof args.location !== 'string' || args.location.trim().length < 2 || args.location.length > 80 || /[\u0000-\u001f]/.test(args.location))) throw new ToolFailure('INVALID_INPUT', 'Shopping search location is invalid.');
      endpoint = new URL(ENDPOINTS.serpapi);
      endpoint.search = new URLSearchParams({ engine: 'google_shopping', q: args.query.trim(), gl: 'in', hl: 'en', google_domain: 'google.co.in', no_cache: 'true', api_key: key ?? '' }).toString();
      endpoint.searchParams.set('json_restrictor',SHOPPING_PROJECTION);
      if (typeof args.location === 'string') endpoint.searchParams.set('location', args.location.trim());
    } else if (name === 'fetch_product_listing') {
      const args = inputRecord(input, ['url']); listing = allowedProductUrl(args.url, true);
      if (!listing) throw new ToolFailure('INVALID_INPUT', 'Only an exact Amazon India or Flipkart product URL is supported.');
      endpoint = new URL(ENDPOINTS.brightdata);
      const datasetId = new URL(listing).hostname.endsWith('amazon.in') ? env.BRIGHT_DATA_AMAZON_DATASET_ID : env.BRIGHT_DATA_FLIPKART_DATASET_ID;
      if (!dataset(datasetId)) throw new ToolFailure('NOT_CONFIGURED', 'The retailer product scraper dataset is not configured.');
      endpoint.search = new URLSearchParams({ dataset_id: datasetId, format: 'json', include_errors: 'true', notify: 'false' }).toString();
      init = { method: 'POST', headers: { Authorization: `Bearer ${key ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: [{ url: listing }], limit_per_input: 1 }) };
    } else if (name === 'amazon_price_history') {
      const args = inputRecord(input, ['asin', 'days']);
      if (typeof args.asin !== 'string' || !/^[A-Z0-9]{10}$/.test(args.asin)) throw new ToolFailure('INVALID_INPUT', 'Amazon history requires one exact ASIN.');
      asin = args.asin; days = integer(args.days, 90, 180); listing = `https://www.amazon.in/dp/${asin}`;
      endpoint = new URL(ENDPOINTS.keepa);
      // History only: do not mislabel tracker observations as newly retrieved offers.
      endpoint.search = new URLSearchParams({ key: key ?? '', domain: '10', asin, history: '1', days: String(days), update: '-1' }).toString();
    } else { throw new ToolFailure('INVALID_INPUT', 'Unknown product tool.'); }
    if (!credential(key)) throw new ToolFailure('NOT_CONFIGURED', `${provider} product data is not configured.`);
    if (signal.aborted) throw new ToolFailure('INTERRUPTED', 'Product tool was interrupted.');
    try { await options.beforeToolCall?.(name, provider); } catch (error) { budgetHookFailed = true; throw error; }
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(PRODUCT_TOOL_LIMITS.timeoutMs)]);
    const result = await fetcher(endpoint, { ...init, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: boundedSignal });
    const { data, raw } = await responseJson(result, [env.SERPAPI_API_KEY, env.BRIGHT_DATA_API_TOKEN, env.KEEPA_API_KEY].filter(credential), boundedSignal);
    base.retrievedAt = new Date(now()).toISOString();
    if (provider === 'serpapi') {
      const obj = record(data);
      if (obj.error || record(obj.search_metadata).status !== 'Success') throw new ToolFailure('INVALID_OUTPUT', 'Shopping provider did not return a successful search.');
      const rows = [obj.shopping_results, obj.inline_shopping_results, ...((Array.isArray(obj.categorized_shopping_results) ? obj.categorized_shopping_results : []).map(c => record(c).shopping_results))].flatMap(r => Array.isArray(r) ? r : []);
      const seen = new Set<string>();
      for (const value of rows.slice(0, 100)) {
        const row = record(value), url = allowedProductUrl(row.link)||allowedProductUrl(row.product_link);
        if(!url){
          // Current Shopping results often expose Google's product page, not
          // a merchant listing. Keep it as a lead without inventing a retailer
          // URL or turning its advertised price into a current offer.
          const lead=shoppingDiscoveryUrl(row.product_link),title=string(row.title,500);
          if(lead&&title&&!seen.has(lead)&&(base.discoveryLeads?.length||0)<limit){seen.add(lead);
            (base.discoveryLeads??=[]).push({url:lead,title,retailerLabel:string(row.source),evidenceKind:'search-result',merchantUrl:null});}
          continue;
        }
        if (!url || seen.has(url)) continue; seen.add(url);
        // INR text is required. Localization does not prove each result's currency.
        const currency = typeof row.price === 'string' && /(?:₹|\bINR\b)/.test(row.price) ? 'INR' : null;
        base.offers.push(offer({ ...row, currency, price: currency ? row.extracted_price : null, seller: null, condition: null, availability: null }, url, 'search-result'));
        if (base.offers.length >= limit) break;
      }
      base.sources = [evidence(provider, raw, null, 'search-result', base.retrievedAt)];
    } else if (provider === 'brightdata') {
      if (!Array.isArray(data)) throw new ToolFailure('INVALID_OUTPUT', 'Listing provider returned an unexpected response.');
      for (const value of data.slice(0, 8)) {
        const row = record(value), url = allowedProductUrl(row.url, true);
        if (!url || url !== listing || row.error || row.errors) continue;
        const item = offer(row, url, 'listing-extraction');
        if (!item.title) continue;
        const source = evidence(provider, JSON.stringify(row), listing, 'listing-extraction', base.retrievedAt);
        source.responseHash = createHash('sha256').update(raw).digest('hex');
        base.offers.push(item); base.sources.push(source);
        const u = new URL(url), exactId = u.hostname.endsWith('amazon.in') ? u.pathname.split('/').pop()! : u.searchParams.get('pid') ?? u.pathname.split('/').pop()!;
        base.observations.push({ kind: 'listing-api', provider, requestedUrl: listing, url, exactId, title: item.title,
          retrievedAt: base.retrievedAt, providerUpdatedAt: item.providerCollectedAt,
          freshness: { retrieval: 'on-demand-scraper', cacheStatus: 'unknown', verifiedFresh: false }, offer: item, source,
          fieldPaths: { url: 'url', title: typeof row.title === 'string' ? 'title' : 'name',
            price: row.final_price !== undefined ? 'final_price' : 'price', currency: 'currency',
            variant: row.variant_id !== undefined ? 'variant_id' : 'variant', seller: row.seller_name !== undefined ? 'seller_name' : 'seller',
            condition: 'condition', availability: 'availability', providerCollectedAt: 'timestamp' } }); break;
      }
      if (!base.offers.length) throw new ToolFailure('NO_DATA', 'No matching product listing was returned.');
    } else {
      const obj = record(data), product = (Array.isArray(obj.products) ? obj.products : []).map(record).find(p => p.asin === asin && p.domainId === 10 && p.productType === 0);
      if (!product) throw new ToolFailure('NO_DATA', 'No tracked Amazon India history was returned for this ASIN.');
      const points: ProductHistory['points'] = []; const cutoff = now() - days * 86400000;
      for (const [index, series] of [[0, 'amazon'], [1, 'marketplace-new']] as const) {
        const csv = Array.isArray(product.csv) ? product.csv[index] : null;
        if (!Array.isArray(csv) || csv.length % 2 !== 0) continue;
        for (let i = 0; i < Math.min(csv.length, 20000); i += 2) {
          const at = keepaDate(csv[i]), price = csv[i + 1];
          if (!at || Date.parse(at) < cutoff || Date.parse(at) > now() || typeof price !== 'number' || !Number.isSafeInteger(price) || price < -1) continue;
          points.push({ at, price: price > 0 ? price / 100 : null, series });
        }
      }
      points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      base.history = { asin, domain: 10, currency: 'INR', lastProviderUpdate: keepaDate(product.lastUpdate),
        points: points.slice(-PRODUCT_TOOL_LIMITS.maxHistoryPoints), truncated: points.length > PRODUCT_TOOL_LIMITS.maxHistoryPoints,
        note: 'Historical tracker observations only. Missing/unavailable values are null. No current offer, stock, postcode delivery or checkout verification; marketplace-new shipping semantics may vary by observation date.' };
      base.sources = [evidence(provider, raw, listing, 'historical-tracker', base.retrievedAt)];
    }
    if (provider !== 'brightdata') base.observations = base.sources.map(source => ({ kind: provider === 'serpapi' ? 'search-result' : 'price-history',
      provider, requestedUrl: listing, url: listing, exactId: asin || null, title: null, retrievedAt: base.retrievedAt,
      providerUpdatedAt: base.history?.lastProviderUpdate ?? null,
      freshness: { retrieval: provider === 'serpapi' ? 'search-cache-bypassed' : 'history-only', cacheStatus: 'unknown', verifiedFresh: false },
      offer: null, source, fieldPaths: {} }));
    return { ...base, ok: true };
  } catch (error) {
    // Durable lease/budget fences belong to the orchestrator and must stop the run.
    if (budgetHookFailed) throw error;
    const failure = error instanceof ToolFailure ? error : new ToolFailure(signal.aborted ? 'INTERRUPTED' : 'UNAVAILABLE', signal.aborted ? 'Product tool was interrupted.' : 'Product provider could not be reached or returned unreadable data.', !signal.aborted);
    return { ...base, offers: [], sources: [], observations: [], error: { code: failure.code, message: failure.message, retryable: failure.retryable } };
  }
}
