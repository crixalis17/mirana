import { acquireLease, releaseLease, getResearchQueue, saveResearchResult, recordResearchFailure, setSchedule, AutomationError } from './automation';
import { researchPurchase } from './research';
export { cronAuthorized } from './research/cron-auth';
export function workerConfigured() { return Boolean(process.env.OPENAI_API_KEY); }
export async function runWorker(options: { purchaseId?: string; userId?: string } = {}) {
  if (!workerConfigured()) return { status: 'setup_required', processed: 0 };
  const leaseName = 'mirana-research-worker';
  const lease = await acquireLease(leaseName, 300000);
  if (!lease) return { status: 'busy', processed: 0 };
  let processed = 0; let failed = 0;
  const deadline = Date.now() + 200000; // Reserve time for durable writes, email timeout and lease release.
  try {
    const count = Math.max(1, Math.min(2, Number(process.env.RESEARCH_MAX_JOBS) || 1));
    const { queue, observations } = await getResearchQueue({ ...options, limit: count });
    for (const purchase of queue) {
      if (Date.now() > deadline - 30000) break;
      try {
        const generated = await researchPurchase(purchase, observations.filter((o: any) => o.purchaseId === purchase.id), AbortSignal.timeout(Math.max(1000, deadline - Date.now())));
        await saveResearchResult({ purchaseId: purchase.id, expectedUpdatedAt: purchase.updatedAt, ...generated });
        processed++;
      } catch (error) {
        // Changed/paused requests must not acquire a stale error or send an email.
        if (error instanceof AutomationError && error.status === 409) continue;
        failed++;
        // Never persist raw exception/provider bodies: they can include secrets or user data.
        await recordResearchFailure(purchase.id, purchase.updatedAt,
          'Research could not finish. Your previous report is preserved; a later check will retry. Check the provider configuration if this continues.',
          new Date(Date.now() + 3600000).toISOString());
      }
    }
    // Scheduled execution only marks the scheduler; immediate user research does not imply cron is active.
    if (!options.purchaseId) await setSchedule(failed ? 'error' : 'active', new Date().toISOString());
    return { status: failed ? 'retry_pending' : 'complete', processed, failed };
  } finally { await releaseLease(leaseName, lease); }
}
