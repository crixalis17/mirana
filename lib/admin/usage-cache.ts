export const USAGE_CACHE_MS = 5 * 60_000;
export const USAGE_REFRESH_MS = 30_000;

/** Server-memory cache: authenticated routes only. Fingerprint changes invalidate old credentials. */
export function createUsageCache<T>(now: () => number = Date.now) {
  let entry: {key: string; value: T; checkedAt: number} | undefined;
  let pending: {key: string; promise: Promise<{value: T; checkedAt: number}>} | undefined;
  return async (key: string, load: () => Promise<T>, force = false) => {
    const current = now();
    const lifetime = force ? USAGE_REFRESH_MS : USAGE_CACHE_MS;
    const metadata = (checkedAt: number, cached: boolean) => ({
      cached, expiresAt: new Date(checkedAt + USAGE_CACHE_MS).toISOString(),
      refreshAfter: new Date(checkedAt + USAGE_REFRESH_MS).toISOString(),
    });
    if (entry?.key === key && current - entry.checkedAt < lifetime) {
      return {snapshot: entry.value, cache: metadata(entry.checkedAt, true)};
    }
    if (pending?.key === key) {
      const result = await pending.promise;
      return {snapshot: result.value, cache: metadata(result.checkedAt, true)};
    }
    const promise = load().then(value => ({value, checkedAt: now()}));
    const work = {key, promise};
    pending = work;
    try {
      const result = await promise;
      // A credential rotation can start another load. Never replace its cache with an obsolete result.
      if (pending === work) entry = {key, ...result};
      return {snapshot: result.value, cache: metadata(result.checkedAt, false)};
    } finally {
      if (pending === work) pending = undefined;
    }
  };
}
