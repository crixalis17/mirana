/** Public origin comes from operator configuration, never proxy/Host headers. */
export function appOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('APP_ORIGIN is required in production.');
  }
  const parsed = new URL(configured || new URL(request.url).origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' ||
      parsed.search || parsed.hash || parsed.username || parsed.password ||
      (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN must be an HTTP origin, and HTTPS in production.');
  }
  return parsed.origin;
}

export function guard(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const expectedOrigin = appOrigin(request);
  if ((origin && origin !== expectedOrigin) || fetchSite === 'cross-site') {
    throw new Error('Cross-site writes are not allowed.');
  }
}
