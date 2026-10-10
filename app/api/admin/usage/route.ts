import {user} from '@/lib/auth';
import {canViewUsage, privateUsageHeaders} from '@/lib/admin/access';
import {guard} from '@/lib/origin';
import {readUsage} from '@/lib/admin/usage-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function usage(request: Request, force: boolean) {
  try {
    const identity = await user(request);
    if (!identity) return Response.json({error: 'Sign in to continue.'}, {status: 401, headers: privateUsageHeaders});
    if (!canViewUsage(identity)) return Response.json({error: 'Access denied.'}, {status: 403, headers: privateUsageHeaders});
    try {guard(request);} catch {
      return Response.json({error: 'Cross-site requests are not allowed.'}, {status: 403, headers: privateUsageHeaders});
    }
    return Response.json(await readUsage(force), {headers: privateUsageHeaders});
  } catch {
    // No database/provider error messages or credentials reach the response/log.
    return Response.json({error: 'Could not load API usage. Please retry.'}, {status: 503, headers: privateUsageHeaders});
  }
}
export const GET = (request: Request) => usage(request, false);
export const POST = (request: Request) => usage(request, true);
