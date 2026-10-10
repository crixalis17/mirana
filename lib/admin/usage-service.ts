import {createHash} from 'node:crypto';
import {loadProviderUsage} from './provider-usage';
import {createUsageCache} from './usage-cache';

const cachedUsage = createUsageCache<Awaited<ReturnType<typeof loadProviderUsage>>>();
export async function readUsage(force = false) {
  const env = {...process.env};
  // Server-only hash, never returned or logged. Changing credentials invalidates the cache.
  const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(env)
    .filter(([key]) => /^(?:GOOGLE|VERTEX|GEMINI|SERPAPI|BRIGHT_DATA|FIRECRAWL|TAVILY|KEEPA|RESEND|TURSO)_/.test(key))
    .sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
  const {snapshot, cache} = await cachedUsage(fingerprint, () => loadProviderUsage({env}), force);
  return {...snapshot, cache};
}
