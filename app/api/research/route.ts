import { after } from 'next/server';
import { user } from '@/lib/auth';
import { body, db } from '@/lib/store';
import { runWorker, workerConfigured } from '@/lib/worker';
import { ensureResearchJob, getResearchJob, researchJobDTO, cancelResearchJob, retryResearchJob, ResearchJobError } from '@/lib/research-jobs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;
const noCache = { 'Cache-Control': 'no-store' };
function validId(id: unknown): id is string { return typeof id === 'string' && id.length > 0 && id.length <= 100; }
async function owned(id: string, userId: string) { return db().prepare('SELECT id,status FROM purchases WHERE id=? AND user_id=?').bind(id, userId).first(); }
function wake(purchaseId: string, userId: string) {
  after(async () => { try { await runWorker({ purchaseId, userId }); } catch { /* Durable dispatcher resumes saved work; never log provider payloads. */ } });
}
export async function GET(request: Request) {
  const identity = await user(request);
  if (!identity) return Response.json({ error: 'Sign in with Google to continue.' }, { status: 401, headers: noCache });
  const id = new URL(request.url).searchParams.get('purchaseId');
  if (!validId(id)) return Response.json({ error: 'Choose a valid shopping item.' }, { status: 400, headers: noCache });
  try {
    if (!await owned(id, identity.id)) return Response.json({ error: 'Shopping item not found.' }, { status: 404, headers: noCache });
    return Response.json({ job: await getResearchJob(id, identity.id) }, { headers: noCache });
  } catch { return Response.json({ error: 'Research progress is unavailable. Check the local database migration.' }, { status: 503, headers: noCache }); }
}
export async function POST(request: Request) {
  const identity = await user(request);
  if (!identity) return Response.json({ error: 'Sign in with Google to continue.' }, { status: 401, headers: noCache });
  try {
    const data = await body(request);
    if (!validId(data.purchaseId) || Object.keys(data).some(key => key !== 'purchaseId')) return Response.json({ error: 'Choose a valid shopping item.' }, { status: 400 });
    const row = await owned(data.purchaseId, identity.id);
    if (!row) return Response.json({ error: 'Shopping item not found.' }, { status: 404 });
    if (row.status !== 'queued') return Response.json({ status: 'not_queued' }, { headers: noCache });
    if (!workerConfigured()) return Response.json({ status: 'setup_required', error: 'Research provider is not configured.' }, { status: 503 });
    const job = await ensureResearchJob(data.purchaseId, identity.id);
    if (['queued','running','retry_pending'].includes(job.status)) wake(data.purchaseId, identity.id);
    return Response.json({ status: job.status, job: researchJobDTO(job) }, { status: 202, headers: noCache });
  } catch { return Response.json({ error: 'Research request could not be queued. Check the local database migration.' }, { status: 400 }); }
}
export async function PATCH(request: Request) {
  const identity = await user(request);
  if (!identity) return Response.json({ error: 'Sign in with Google to continue.' }, { status: 401, headers: noCache });
  try {
    const data = await body(request);
    if (!validId(data.purchaseId) || !['cancel','retry'].includes(data.action) || Object.keys(data).some(key => !['purchaseId','action'].includes(key)))
      return Response.json({ error: 'Choose a valid research action.' }, { status: 400 });
    if (!await owned(data.purchaseId, identity.id)) return Response.json({ error: 'Shopping item not found.' }, { status: 404 });
    if (data.action === 'cancel') {
      await cancelResearchJob(data.purchaseId, identity.id);
      return Response.json({ job: await getResearchJob(data.purchaseId, identity.id) }, { headers: noCache });
    }
    if (!workerConfigured()) return Response.json({ status: 'setup_required', error: 'Research provider is not configured.' }, { status: 503 });
    const job = await retryResearchJob(data.purchaseId, identity.id);
    wake(data.purchaseId, identity.id);
    return Response.json({ status: job.status, job }, { status: 202, headers: noCache });
  } catch (error) {
    return Response.json({ error: error instanceof ResearchJobError && error.code === 'budget_exhausted'
      ? 'This research reached its request limit. Edit the brief to start a new bounded job.' : 'Research could not be changed. Check its state and retry.' }, { status: 409 });
  }
}
