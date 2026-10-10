/** Server authorization policy. Never accept an identity supplied by a request body/header. */
export function canViewUsage(identity: unknown, ownerEmail = process.env.ADMIN_OWNER_EMAIL): boolean {
  if (!ownerEmail || !/^[^\s,;]+@[^\s,;]+\.[^\s,;]+$/.test(ownerEmail)) return false;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
  const user = identity as Record<string, unknown>;
  return user.provider === 'google' && user.emailVerified === true && user.preview === false &&
    typeof user.id === 'string' && user.id.length > 0 && user.id !== 'local-demo' &&
    typeof user.email === 'string' && user.email.toLowerCase() === ownerEmail.toLowerCase();
}

export const privateUsageHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};
