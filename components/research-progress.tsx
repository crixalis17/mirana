'use client';

import {useEffect, useRef, useState} from 'react';
import {researchJobView} from '@/lib/webmcp';

type Job = NonNullable<ReturnType<typeof researchJobView>>;
const pollRetryDelays = [3000, 6000, 12000];
class ProgressReadError extends Error {
  constructor(message: string, readonly retryable: boolean) {super(message);}
}
const activeStatuses = new Set(['queued', 'running', 'retry_pending']);
const stages: Record<string, string> = {
  plan: 'Preparing your research plan', gather: 'Gathering product and review evidence',
  read: 'Reading original product pages and reviews',
  assess: 'Checking the evidence', followup: 'Investigating missing details',
  synthesize: 'Comparing suitable products', verify: 'Verifying the comparison', publish: 'Saving your recommendations',
};
const statuses: Record<string, string> = {
  queued: 'Queued', running: 'In progress', retry_pending: 'Waiting to retry', completed: 'Research completed',
  failed: 'Research needs attention', cancelled: 'Research cancelled', superseded: 'Requirements changed',
};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function ResearchProgress({purchaseId, refreshKey, canResearch, itemInactive = false, canStart = true, reportGaps, onUpdated}: {
  purchaseId: string; refreshKey: number; canResearch: boolean; itemInactive?: boolean; canStart?: boolean; reportGaps?: unknown; onUpdated: () => void | Promise<void>;
}) {
  const [state, setState] = useState<{job: Job | null; loaded: boolean; error: string}>({job: null, loaded: false, error: ''});
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const latestUpdate = useRef(onUpdated);
  const refreshedJob = useRef<string | null>(null);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => {latestUpdate.current = onUpdated;}, [onUpdated]);
  useEffect(() => () => mutation.current?.abort(), [purchaseId]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;
    async function poll() {
      try {
        const response = await fetch(`/api/research?purchaseId=${encodeURIComponent(purchaseId)}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new ProgressReadError(response.status === 401 ? 'Sign in again to check research progress.' :
          response.status === 404 ? 'This shopping item is no longer available.' : 'Could not check research progress.',
          response.status >= 500 || response.status === 429 || response.status === 408);
        const result = await response.json();
        if (controller.signal.aborted) return;
        consecutiveFailures = 0;
        const job = researchJobView(result.job);
        setState({job, loaded: true, error: ''});
        if (job?.status === 'completed' && typeof job.id === 'string' && refreshedJob.current !== job.id) {
          refreshedJob.current = job.id;
          await latestUpdate.current();
        }
        if (!controller.signal.aborted && job && activeStatuses.has(String(job.status))) timer = setTimeout(poll, 3000);
      } catch (error) {
        if (controller.signal.aborted) return;
        const retryable = !(error instanceof ProgressReadError) || error.retryable;
        const retryDelay = retryable ? pollRetryDelays[consecutiveFailures] : undefined;
        consecutiveFailures++;
        const message = error instanceof ProgressReadError ? error.message : 'Could not check research progress.';
        setState(previous => ({...previous, loaded: true, error: retryDelay === undefined
          ? `${message}${retryable ? ' Automatic retries stopped.' : ''} Choose Check again when ready.`
          : `${message} Retrying shortly (${consecutiveFailures} of ${pollRetryDelays.length}).`}));
        if (retryDelay !== undefined) timer = setTimeout(poll, retryDelay);
      }
    }
    void poll();
    return () => {controller.abort(); if (timer) clearTimeout(timer);};
  }, [purchaseId, refreshKey, revision]);

  async function change(action: 'start' | 'cancel' | 'retry') {
    mutation.current?.abort();
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    try {
      const response = await fetch('/api/research', {method: action === 'start' ? 'POST' : 'PATCH',
        credentials: 'same-origin', signal: controller.signal, headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({purchaseId, ...(action === 'start' ? {} : {action})}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update research.');
      if (controller.signal.aborted) return;
      if (result.status === 'not_queued') throw new Error('Edit your request to start a new research comparison.');
      if (result.status === 'setup_required') throw new Error('Connect a research provider before starting research.');
      setState({job: researchJobView(result.job), loaded: true, error: ''});
      setRevision(value => value + 1);
      await latestUpdate.current();
    } catch (error) {
      if (!controller.signal.aborted) setState(previous => ({...previous,
        error: error instanceof Error ? error.message : 'Could not update research.'}));
    } finally {if (!controller.signal.aborted) setBusy(false);}
  }

  const {job, loaded, error} = state;
  const status = String(job?.status || '');
  const active = activeStatuses.has(status);
  const plan = object(job?.plan);
  const coverage = object(job?.coverage);
  const gaps = status === 'completed' ? strings(reportGaps) : strings(coverage.gaps);
  const uniqueGaps = [...new Set(gaps)];
  const events = Array.isArray(job?.events) ? job.events.map(object).slice(-5) : [];
  return <section className="panel" aria-label="Research progress" aria-busy={!loaded || busy}>
    <div role="status" aria-live="polite" aria-atomic="true">
      <h2>{job ? statuses[status] || 'Research progress' : loaded ? 'Research' : 'Loading research progress…'}</h2>
      {job && active ? <p>{stages[String(job.stage)] || 'Waiting for the research worker'}</p> : null}
      {status === 'queued' ? <p className="field-note">Your request is saved. The background worker will continue from here.</p> : null}
      {status === 'retry_pending' && typeof job?.retryAt === 'string' ? <p className="field-note">Next attempt: {new Date(job.retryAt).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} IST</p> : null}
    </div>
    {typeof coverage.readCount==='number' ? <p className="field-note">{coverage.readCount} original sources read · {typeof coverage.blockedCount==='number'?coverage.blockedCount:0} unavailable or unreadable</p> : null}
    {strings(plan.criteria).length || strings(plan.questions).length ? <details><summary>Research plan</summary>
      {strings(plan.hardRequirements).length ? <><h3>Your requirements</h3><ul>{strings(plan.hardRequirements).map((item,index)=><li key={index}>{item}</li>)}</ul></> : null}
      {strings(plan.criteria).length ? <ul>{strings(plan.criteria).map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
      {strings(plan.questions).length ? <><h3>Questions to investigate</h3><ul>{strings(plan.questions).map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
    </details> : null}
    {events.length ? <details><summary>Recent progress</summary><ol>{events.filter(event => typeof event.message === 'string').map((event, index) =>
      <li key={typeof event.id === 'string' || typeof event.id === 'number' ? event.id : index}>{String(event.message)}</li>)}</ol></details> : null}
    {uniqueGaps.length ? <div><h3>Evidence still missing</h3><ul>{uniqueGaps.slice(0,5).map(gap => <li key={gap}>{gap}</li>)}</ul>
      {uniqueGaps.length>5 ? <details><summary>{uniqueGaps.length-5} more evidence gaps</summary><ul>{uniqueGaps.slice(5).map(gap=><li key={gap}>{gap}</li>)}</ul></details> : null}
    </div> : null}
    {typeof job?.error === 'string' && job.error ? <p className="error" role="alert">{job.error}</p> : null}
    {error ? <p className="error" role="alert">{error} <button className="text-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>Check again</button></p> : null}
    <div className="status-actions">
      {active ? <button className="outline-button" disabled={busy} onClick={() => change('cancel')}>{busy ? 'Updating…' : 'Cancel research'}</button> : null}
      {['failed', 'cancelled'].includes(status) ? <button className="outline-button" disabled={busy || !canResearch || itemInactive} onClick={() => change('retry')}>{busy ? 'Updating…' : 'Retry research'}</button> : null}
      {loaded && !job && !error && canStart ? <button className="outline-button" disabled={busy || !canResearch || itemInactive} onClick={() => change('start')}>{busy ? 'Starting…' : 'Start research'}</button> : null}
    </div>
    {itemInactive ? <p className="field-note">Resume this item before starting or retrying research.</p> : null}
    {!canResearch ? <p className="field-note">Connect a research provider to start or retry.</p> : null}
    {active || ['failed', 'cancelled'].includes(status) || !job ? <p className="field-note">Research uses your configured AI provider. Starting or retrying can incur usage charges.</p> : null}
  </section>;
}
