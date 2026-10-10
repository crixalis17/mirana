'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderUsage } from '@/lib/admin/provider-usage';
import { createAdminUsageTools } from '@/lib/admin/usage-webmcp';

type UsageSnapshot = {
  providers: ProviderUsage[];
  checkedAt: string;
  cache: { expiresAt: string; refreshAfter: string; cached: boolean };
};
type ModelContext = {
  registerTool: (tool: ReturnType<typeof createAdminUsageTools>[number], options: { signal: AbortSignal }) => void | Promise<void>;
};
const statuses: Record<ProviderUsage['status'], string> = {
  available: 'Available', not_configured: 'Not connected', unsupported: 'Check provider console',
  unavailable: 'Temporarily unavailable', access_denied: 'Access unavailable', rate_limited: 'Rate limited',
};

function time(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return `${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date)} IST`;
}
function metric(value: number | null, unit: ProviderUsage['metrics'][number]['unit']) {
  if (value === null || !Number.isFinite(value)) return '—';
  return unit === 'USD' || unit === 'INR'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: unit, maximumFractionDigits: 2 }).format(value)
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);
}

export default function AdminUsageDashboard() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const requestUsage = useCallback(async (refresh: boolean) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/usage', {
        method: refresh ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(refresh ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
      });
      if (response.status === 401 || response.status === 403) {
        if (!controller.signal.aborted && mounted.current) { setSnapshot(null); setAccessDenied(true); }
        throw new Error('Owner access is required.');
      }
      if (!response.ok) throw new Error('Usage could not be refreshed.');
      const next = await response.json() as UsageSnapshot;
      if (!Array.isArray(next.providers) || !next.cache || typeof next.checkedAt !== 'string') {
        throw new Error('Usage response is unavailable.');
      }
      if (!controller.signal.aborted && mounted.current) setSnapshot(next);
      return next;
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError('Usage could not be refreshed. Please retry.');
      throw cause;
    } finally {
      if (!controller.signal.aborted && mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const startup = new AbortController();
    // Keep the initial render stable and cancel a Strict Mode/unmount startup.
    queueMicrotask(() => {
      if (!startup.signal.aborted) void requestUsage(false).catch(() => {});
    });
    return () => { startup.abort(); mounted.current = false; active.current?.abort(); };
  }, [requestUsage]);

  useEffect(() => {
    if (accessDenied) return;
    const model = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!model?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of createAdminUsageTools(requestUsage)) {
      try { Promise.resolve(model.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); }
      catch { /* Optional browser support does not affect dashboard access. */ }
    }
    return () => lifecycle.abort();
  }, [accessDenied, requestUsage]);

  return <main className="admin-usage-page">
    <Link href="/" className="admin-usage-back">← Back to shopping list</Link>
    <header className="admin-usage-heading">
      <div><p className="eyebrow">MIRANA · OWNER ONLY</p><h1>API usage</h1>
        <p className="admin-usage-subtitle">Balances and limits from your connected providers.</p></div>
      {!accessDenied && <button type="button" className="outline-button" disabled={busy}
        onClick={() => { void requestUsage(true).catch(() => {}); }}>{busy ? 'Checking…' : 'Refresh usage'}</button>}
    </header>
    {accessDenied ? <section className="admin-usage-empty" role="alert"><h2>Owner access required</h2>
      <p>Sign in with the Mirana owner account to view provider usage.</p><Link className="text-link" href="/">Return to sign-in</Link></section>
      : <>
        <p className="admin-usage-context">These are provider account totals. They may include usage outside Mirana. A missing balance means the provider has not supplied a usable value.</p>
        <div className="admin-usage-check" role="status" aria-live="polite">
          {busy ? 'Checking connected providers…' : snapshot ? `Last checked ${time(snapshot.checkedAt)}${snapshot.cache.cached ? ' · Cached snapshot' : ''}` : 'No usage snapshot yet.'}
        </div>
        {error && <div className="admin-usage-error" role="alert"><p>{error}{snapshot ? ' The last successful snapshot is shown below.' : ''}</p>
          <button type="button" className="text-link" disabled={busy} onClick={() => { void requestUsage(true).catch(() => {}); }}>Retry</button></div>}
        <section className="admin-usage-grid" aria-label="Provider account usage" aria-busy={busy}>
          {snapshot?.providers.map(provider => <article className="admin-usage-card" key={provider.id}>
            <div className="admin-usage-card-heading"><h2>{provider.name}</h2><span className={`admin-usage-status admin-usage-status-${provider.status}`}>{statuses[provider.status]}</span></div>
            <dl className="admin-usage-metrics">{provider.metrics.map((entry, index) => <div key={`${entry.label}-${index}`}>
              <dt>{entry.label}</dt><dd>{metric(entry.value, entry.unit)}
                {entry.unit !== 'USD' && entry.unit !== 'INR' && <span>{entry.unit}</span>}</dd></div>)}</dl>
            <p className="admin-usage-message">{provider.message}</p>
            <footer className="admin-usage-card-footer"><p>Checked {time(provider.checkedAt)}{provider.resetAt && <><br />Resets {time(provider.resetAt)}</>}</p>
              <a href={provider.consoleUrl} target="_blank" rel="noopener noreferrer">Provider console ↗</a></footer>
          </article>)}
        </section>
        {!busy && snapshot?.providers.length === 0 && <p className="admin-usage-empty">No connected provider usage is available.</p>}
      </>}
  </main>;
}
