import { createHash, timingSafeEqual } from 'node:crypto';
export function cronAuthorized(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 32) return false;
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  const provided = createHash('sha256').update(request.headers.get('authorization') || '').digest();
  return timingSafeEqual(expected, provided);
}
