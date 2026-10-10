// This transport is imported by authenticated server routes only. Credentials and
// full account responses must never be passed to React client components.
type UsageEnv = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export type ProviderUsageStatus = 'available' | 'not_configured' | 'unsupported' | 'unavailable' | 'access_denied' | 'rate_limited';
export type ProviderUsageMetric = {label: string; value: number | null; unit: 'credits' | 'searches' | 'tokens' | 'USD' | 'INR' | 'requests' | 'tokens/minute'};
export type ProviderUsage = {
  id: 'vertex' | 'serpapi' | 'brightdata' | 'firecrawl' | 'tavily' | 'keepa' | 'resend' | 'turso';
  name: string; status: ProviderUsageStatus; message: string; metrics: ProviderUsageMetric[];
  consoleUrl: string; checkedAt: string; resetAt: string | null;
};
export type ProviderUsageSnapshot = {providers: ProviderUsage[]; checkedAt: string};
export type ProviderUsageOptions = {env?: UsageEnv; fetch?: typeof fetch; now?: () => number; signal?: AbortSignal};
export const PROVIDER_USAGE_LIMITS = {timeoutMs: 10_000, maxResponseBytes: 65_536} as const;
const ENDPOINTS = {
  serpapi: 'https://serpapi.com/account.json', tavily: 'https://api.tavily.com/usage',
  firecrawl: 'https://api.firecrawl.dev/v2/team/credit-usage', brightdata: 'https://api.brightdata.com/customer/balance',
  keepa: 'https://api.keepa.com/token',
} as const;
const CONSOLES: Record<ProviderUsage['id'], string> = {
  vertex: 'https://console.cloud.google.com/billing', serpapi: 'https://serpapi.com/dashboard',
  brightdata: 'https://brightdata.com/cp/billing', firecrawl: 'https://www.firecrawl.dev/app',
  tavily: 'https://app.tavily.com', keepa: 'https://keepa.com/#!api',
  resend: 'https://resend.com/overview', turso: 'https://app.turso.tech',
};
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
function credential(value: string | undefined) {return typeof value === 'string' && value.trim().length > 0 && !/[\r\n]/.test(value);}
function number(value: unknown, signed = false): number | null {
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e15 && (signed || value >= 0) ? value : null;
}
function date(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function remaining(limit: number | null, used: number | null) {return limit !== null && used !== null ? Math.max(0, limit - used) : null;}
function metric(label: string, value: unknown, unit: ProviderUsageMetric['unit'], signed = false): ProviderUsageMetric {return {label, value: number(value, signed), unit};}
function failure(status: ProviderUsageStatus) {return {status, message: status === 'access_denied' ? 'The configured key cannot read account usage. Check provider permissions.' :
  status === 'rate_limited' ? 'The provider limited this account check. No retries were made.' : 'Account usage is temporarily unavailable. Open the provider console for its current balance.'};}
class UsageFailure extends Error {constructor(readonly status: ProviderUsageStatus) {super('Usage request failed');}}

async function readUsageData(url: string, key: string, kind: keyof typeof ENDPOINTS, options: ProviderUsageOptions): Promise<Json> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const deadline = setTimeout(() => controller.abort(), PROVIDER_USAGE_LIMITS.timeoutMs);
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () => reject(new UsageFailure('unavailable'));
    if (signal.aborted) abortListener(); else signal.addEventListener('abort', abortListener, {once: true});
  });
  const operation = async () => {
    signal.throwIfAborted();
    const headers: Record<string, string> = {Accept: 'application/json'};
    // SerpApi's Account API requires the query key and echoes it in its response.
    // No URL or body is logged or returned; only explicitly selected metrics survive.
    if (kind !== 'serpapi' && kind !== 'keepa') headers.Authorization = `Bearer ${key}`;
    const response = await (options.fetch ?? fetch)(url, {method: 'GET', headers, redirect: 'error', cache: 'no-store', signal});
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new UsageFailure(response.status === 401 || response.status === 403 ? 'access_denied' : response.status === 429 ? 'rate_limited' : 'unavailable');
    }
    if (!response.body) throw new UsageFailure('unavailable');
    const length = number(response.headers.get('content-length'));
    if (length !== null && length > PROVIDER_USAGE_LIMITS.maxResponseBytes) {await response.body.cancel(); throw new UsageFailure('unavailable');}
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let bytes = 0;
    const cancel = () => {void reader.cancel().catch(() => {});};
    signal.addEventListener('abort', cancel, {once: true});
    try {
      while (true) {
        signal.throwIfAborted(); const part = await reader.read(); signal.throwIfAborted();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > PROVIDER_USAGE_LIMITS.maxResponseBytes) {await reader.cancel(); throw new UsageFailure('unavailable');}
        chunks.push(part.value);
      }
    } finally {signal.removeEventListener('abort', cancel); reader.releaseLock();}
    const parsed = object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (parsed.error || parsed.success === false) throw new UsageFailure('unavailable');
    return parsed;
  };
  try {return await Promise.race([operation(), aborted]);}
  finally {clearTimeout(deadline); if (abortListener) signal.removeEventListener('abort', abortListener);}
}

/** Read-only account endpoints; never perform a search, scrape or model call. */
export async function loadProviderUsage(options: ProviderUsageOptions = {}): Promise<ProviderUsageSnapshot> {
  if (typeof window !== 'undefined') throw new Error('Provider account usage is server-only.');
  const env = options.env ?? process.env, checkedAt = new Date((options.now ?? Date.now)()).toISOString();
  const card = (id: ProviderUsage['id'], name: string, configured: boolean, message: string): ProviderUsage => ({
    id, name, status: configured ? 'unsupported' : 'not_configured', message: configured ? message : 'No server credential is configured.',
    metrics: [], consoleUrl: CONSOLES[id], checkedAt, resetAt: null,
  });
  const live = async (id: keyof typeof ENDPOINTS, name: string, key: string | undefined,
    parse: (data: Json) => Pick<ProviderUsage, 'message' | 'metrics' | 'resetAt'>): Promise<ProviderUsage> => {
    const base = card(id, name, credential(key), ''); if (!credential(key)) return base;
    const target = new URL(ENDPOINTS[id]); if (id === 'serpapi') target.searchParams.set('api_key', key!);
    if (id === 'keepa') target.searchParams.set('key', key!);
    try {
      const result = parse(await readUsageData(target.href, key!, id, options));
      if (!result.metrics.some(item => item.value !== null)) return {...base, ...failure('unavailable')};
      return {...base, status: 'available', ...result};
    } catch (error) {return {...base, ...failure(error instanceof UsageFailure ? error.status : 'unavailable')};}
  };
  // Each provider fails independently. Never return an account identity, echoed
  // API key, raw error body, plan name, arbitrary URL or provider instruction.
  const providers = await Promise.all([
    Promise.resolve(card('vertex', 'Gemini / Vertex AI', credential(env.GOOGLE_API_KEY) && credential(env.GOOGLE_CLOUD_PROJECT),
      'The model API key does not expose Cloud Billing promotional credit balances. Check Billing → Credits; billing access or an export needs separate setup.')),
    live('serpapi', 'SerpApi', env.SERPAPI_API_KEY, data => ({metrics: [metric('Searches remaining (including extra credits)', data.total_searches_left, 'searches'),
      metric('Used this month', data.this_month_usage, 'searches'), metric('Monthly plan allowance', data.searches_per_month, 'searches'),
      metric('Monthly plan searches remaining', data.plan_searches_left, 'searches'), metric('Extra search credits', data.extra_credits, 'searches')],
      resetAt: date(data.plan_renewal_date), message: 'Account-reported search quota. Extra credits are separate from the monthly plan allowance.'})),
    live('brightdata', 'Bright Data', env.BRIGHT_DATA_API_TOKEN, data => ({metrics: [metric('Available account balance', data.balance, 'USD', true),
      metric('Account credit', data.credit, 'USD', true), metric('Prepayment', data.prepayment, 'USD', true), metric('Pending usage costs', data.pending_costs, 'USD', true)],
      resetAt: null, message: 'USD account funds and pending costs. Bright Data does not expose remaining free scraper credits through this API; check its Free credits console card.'})),
    live('firecrawl', 'Firecrawl', env.FIRECRAWL_API_KEY, data => {const usage = object(data.data); return {metrics: [metric('Team credits remaining', usage.remainingCredits, 'credits'),
      metric('Plan credits (excludes extra credits)', usage.planCredits, 'credits')], resetAt: date(usage.billingPeriodEnd),
      message: 'Team balance can include extra credits, so used credits cannot be inferred by subtracting this balance from plan credits.'};}),
    live('tavily', 'Tavily', env.TAVILY_API_KEY, data => {const account = object(data.account), key = object(data.key), planUsed = number(account.plan_usage), planLimit = number(account.plan_limit),
      paygoUsed = number(account.paygo_usage), paygoLimit = number(account.paygo_limit);
      return {metrics: [metric('Plan credits remaining', remaining(planLimit, planUsed), 'credits'), metric('Plan credits used', planUsed, 'credits'),
        metric('Plan credit allowance', planLimit, 'credits'), metric('Pay-as-you-go credits used', paygoUsed, 'credits'), metric('Pay-as-you-go limit', paygoLimit, 'credits'),
        metric('This API key credits used', key.usage, 'credits'), metric('This API key limit', key.limit, 'credits')], resetAt: null,
        message: `Account and key limits are separate. Pay-as-you-go is billed usage, not free prepaid credits.${env.TAVILY_ACCESS_MODE === 'keyless' ? ' Mirana research currently uses keyless access; these account figures do not measure its anonymous allowance.' : ''}`};}),
    live('keepa', 'Keepa', env.KEEPA_API_KEY, data => ({metrics: [metric('Token bucket balance', data.tokensLeft, 'tokens', true),
      metric('Token refill rate', data.refillRate, 'tokens/minute')], resetAt: null,
      message: 'Continuously replenishing API token bucket, not a monthly prepaid balance. A negative balance reflects tokens already consumed.'})),
    Promise.resolve(card('resend', 'Resend', credential(env.RESEND_API_KEY), 'Email allowance is not exposed by the sending API integration. View account usage in Resend.')),
    Promise.resolve(card('turso', 'Turso', credential(env.TURSO_DATABASE_URL) && credential(env.TURSO_AUTH_TOKEN) && !env.TURSO_DATABASE_URL!.startsWith('file:'),
      'Database credentials allow queries, not organization billing access. View row, storage and quota usage in the Turso console.')),
  ]);
  return {providers, checkedAt};
}
