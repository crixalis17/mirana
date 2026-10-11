export function researchRequestError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'daily_limit') return {
    status: 429,
    body: { error: 'The rolling 24-hour research allowance has been reached. Try again after an earlier job leaves that window.', code: 'daily_limit' },
    logCode: 'daily_limit',
  };
  return {
    status: 503,
    body: { error: 'Research could not be queued. Please retry; if this continues, contact support.', code: 'queue_unavailable' },
    // Log only a bounded error category, never database SQL, parameters or credentials.
    logCode: /^[A-Z_]{1,40}$/.test(code) ? code : 'queue_unavailable',
  };
}
