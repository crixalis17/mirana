import { request as httpsRequest } from 'node:https';

// Node fetch can impose a header timeout even without an AbortSignal. The HIGH
// benchmark uses native HTTPS so long reasoning calls have no socket deadline.
// Provider/network failures can still end a request. No automatic retries.
export function requestJson(url, { headers, body, timeoutMs = null }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpsRequest(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) },
      ...(timeoutMs === null ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2_000_000) {
          response.destroy(new Error('Provider response exceeds benchmark limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch { reject(new Error('Provider returned an invalid JSON response.')); }
      });
    });
    req.on('error', error => {
      const code = /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'REQUEST_FAILED';
      reject(new Error(`HTTPS transport failure: ${code}`));
    });
    // No req.setTimeout or Agent timeout: the long study is explicitly uncapped
    // at the application transport layer, within the provider's model limits.
    req.end(payload);
  });
}
