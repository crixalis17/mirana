// Server-only diagnostics. Never accept provider bodies, prompts, URLs or identities.
import {createHash} from 'node:crypto';

const events = ['started','completed','failed','retry','lease','cancel','publish','source-read','model-call','tool-call'] as const;
const toolProviders = ['serpapi','rainforest','brightdata','keepa','serpapi-mcp','brightdata-mcp','original-page','firecrawl','tavily'] as const;
const toolNames = ['search_products_india','fetch_product_listing','amazon_price_history','search','search_engine','scrape_as_markdown','read_source_page','search_web_tavily','read_source_tavily','search_web_firecrawl','read_source_firecrawl'] as const;
const stages = ['plan','gather','read','assess','followup','synthesize','verify','publish'] as const;
const genericCodes = new Set(['RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','PROVIDER_TIMEOUT','INTERRUPTED',
  'INVALID_OUTPUT','INCOMPLETE_OUTPUT','NO_EVIDENCE','LEASE_LOST','BUDGET_EXHAUSTED','CANCELLED','SUPERSEDED','NETWORK_ERROR','VALIDATION_ERROR','UNEXPECTED_ERROR']);
const networkCodes = new Set(['ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','EHOSTUNREACH','ENETUNREACH','UND_ERR_SOCKET']);
const timeoutCodes = new Set(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
export type ResearchLogFields = {
  event: typeof events[number]; jobId?: string; stage?: typeof stages[number]; attempt?: number; elapsedMs?: number;
  round?: number; maxCalls?: number; maxRounds?: number; sourceCount?: number; factCount?: number; gapCount?: number;
  candidateCount?: number; retainedCount?: number; inputTokens?: number; outputTokens?: number; thinkingTokens?: number;
  searchQueries?: number; provider?: 'openai' | 'vertex'; model?: string; errorCode?: string; retryable?: boolean; statusCode?: number;
  inputBytes?:number;maxOutputTokens?:number;attemptedToolCalls?:number;maxToolCalls?:number;toolProvider?:string;tool?:string;
};
type SafeLog = Record<string, string | number | boolean>;
const numericBounds: Record<string, number> = {
  attempt:1000, elapsedMs:86_400_000, round:1000, maxCalls:1000, maxRounds:1000,
  sourceCount:1_000_000, factCount:1_000_000, gapCount:1_000_000, candidateCount:1_000_000, retainedCount:1_000_000,
  inputTokens:1_000_000_000, outputTokens:1_000_000_000, thinkingTokens:1_000_000_000, searchQueries:1_000_000,
  inputBytes:1_000_000_000,maxOutputTokens:1_000_000,attemptedToolCalls:1000,maxToolCalls:24,
};
function normalizedCode(value: unknown) {
  if (typeof value !== 'string' || value.length > 40 || !/^[A-Za-z_]+$/.test(value)) return null;
  const code = value.toUpperCase();
  return genericCodes.has(code) ? code : null;
}

/** Classify typed provider/job codes and standard runtime failures without reading error.message. */
export function safeResearchErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNEXPECTED_ERROR';
  try {
    const candidate = error as {code?: unknown; name?: unknown};
    const known = normalizedCode(candidate.code);
    if (known) return known;
    if (typeof candidate.code === 'string') {
      if (networkCodes.has(candidate.code)) return 'NETWORK_ERROR';
      if (timeoutCodes.has(candidate.code)) return 'PROVIDER_TIMEOUT';
    }
    if (candidate.name === 'AbortError') return 'INTERRUPTED';
    if (candidate.name === 'TimeoutError') return 'PROVIDER_TIMEOUT';
    if (candidate.name === 'SyntaxError') return 'INVALID_OUTPUT';
    if (candidate.name === 'RangeError') return 'VALIDATION_ERROR';
  } catch { /* Malformed diagnostic objects never become log content. */ }
  return 'UNEXPECTED_ERROR';
}

/** Emit a flat, bounded whitelist. Debug deliberately has the same privacy boundary as info. */
export function logResearchEvent(fields: ResearchLogFields): SafeLog | null {
  try {
    if (typeof window !== 'undefined' || process.env.RESEARCH_LOG_LEVEL === 'off') return null;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
    const input = fields as unknown as Record<string, unknown>;
    if (typeof input.event !== 'string' || !(events as readonly string[]).includes(input.event)) return null;
    const log: SafeLog = {timestamp:new Date().toISOString(),event:input.event};
    if (typeof input.jobId === 'string' && input.jobId.length > 0 && input.jobId.length <= 512)
      log.jobHash = createHash('sha256').update(input.jobId).digest('hex');
    if (typeof input.stage === 'string' && (stages as readonly string[]).includes(input.stage)) log.stage = input.stage;
    for (const [key, maximum] of Object.entries(numericBounds)) {
      const value = input[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum) log[key] = value;
    }
    if (typeof input.statusCode === 'number' && Number.isInteger(input.statusCode) && input.statusCode >= 100 && input.statusCode <= 599) log.statusCode = input.statusCode;
    if (input.provider === 'openai' || input.provider === 'vertex') log.provider = input.provider;
    if(typeof input.toolProvider==='string'&&(toolProviders as readonly string[]).includes(input.toolProvider))log.toolProvider=input.toolProvider;
    if(typeof input.tool==='string'&&(toolNames as readonly string[]).includes(input.tool))log.tool=input.tool;
    // Keep configured model names, never arbitrary strings, email addresses, query parameters or keys.
    if (typeof input.model === 'string' && input.model.length <= 80 &&
      /^(?:gemini-\d+(?:\.\d+)?-(?:flash|pro)(?:-lite)?(?:-preview)?(?:-\d{3})?|gpt-\d+(?:\.\d+)?(?:-(?:mini|nano|pro|codex))?(?:-\d{4}-\d{2}-\d{2})?|o[134](?:-mini)?(?:-\d{4}-\d{2}-\d{2})?)$/.test(input.model)) log.model = input.model;
    const errorCode = normalizedCode(input.errorCode);
    if (errorCode) log.errorCode = errorCode;
    if (typeof input.retryable === 'boolean') log.retryable = input.retryable;
    const line = `mirana_research ${JSON.stringify(log)}`;
    if (input.event === 'failed') console.error(line);
    else console.info(line);
    return log;
  } catch {return null;}
}
