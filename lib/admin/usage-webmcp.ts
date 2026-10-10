import type { MiranaTool } from '../webmcp';

type UsageRequest = (refresh: boolean) => Promise<unknown>;

// The owner API enforces access for every call, including calls through WebMCP.
export function createAdminUsageTools(request: UsageRequest): MiranaTool[] {
  return [false, true].map(refresh => ({
    name: refresh ? 'mirana_admin_usage_refresh' : 'mirana_admin_usage',
    description: refresh
      ? 'Refresh the signed-in Mirana owner’s provider account usage. Provider usage endpoints may have rate limits. No research or product searches are started.'
      : 'Read cached provider account balances for the signed-in Mirana owner. Account totals can include usage outside Mirana; unavailable balances remain unknown.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: !refresh, untrustedContentHint: true, consequentialHint: false },
    execute: async (input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
        return { ok: false, error: 'Use an empty input object.', kind: 'validation' };
      }
      try { return await request(refresh); }
      catch { return { ok: false, error: 'Usage could not be read. Check your owner sign-in and retry.', kind: 'request' }; }
    },
  }));
}
