import { after } from 'next/server';
import { user } from '@/lib/auth';
import { body, db } from '@/lib/store';
import { runWorker, workerConfigured } from '@/lib/worker';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;
export async function POST(request: Request) {
  const identity = await user(request);
  if (!identity) return Response.json({ error: 'Sign in with Google to continue.' }, { status: 401 });
  try {
    const data = await body(request);
    if (typeof data.purchaseId !== 'string' || data.purchaseId.length > 100) return Response.json({ error: 'Choose a valid shopping item.' }, { status: 400 });
    const row = await db().prepare('SELECT id,status FROM purchases WHERE id=? AND user_id=?').bind(data.purchaseId, identity.id).first();
    if (!row) return Response.json({ error: 'Shopping item not found.' }, { status: 404 });
    if (row.status !== 'queued') return Response.json({ status: 'not_queued' });
    if (!workerConfigured()) return Response.json({ status: 'setup_required', error: 'Research provider is not configured.' }, { status: 503 });
    after(async () => { try { await runWorker({ purchaseId: data.purchaseId, userId: identity.id }); } catch { /* Cron retries queued jobs; never log user/provider payloads. */ } });
    return Response.json({ status: 'queued' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Research request could not be queued.' }, { status: 400 }); }
}
