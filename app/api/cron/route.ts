import { cronAuthorized, runWorker, workerConfigured } from '@/lib/worker';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) return Response.json({ error: 'Scheduler is not configured.' }, { status: 503 });
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!workerConfigured()) return Response.json({ status: 'setup_required', error: 'Research provider is not configured.' }, { status: 503 });
  try { return Response.json(await runWorker(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Background research is unavailable. Check database and provider configuration.' }, { status: 503 }); }
}
