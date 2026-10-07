import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
type Json = Record<string, any>;
// The configured operator-controlled adapter must obtain real merchant checkout quotes.
// AI summaries, search snippets and product JSON-LD are not eligible receipt issuers.
export function requirementsHash(purchase: Json, parsed: Json) {
  return createHash('sha256').update(JSON.stringify({ requestText: purchase.requestText || '', mustHave: parsed.mustHave || [], postcode: purchase.postcode })).digest('hex');
}
export function signedReceiptBody(raw: string, signature: string, secret: string) {
  if (secret.length < 32 || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function publicHttps(value: unknown) {
  if (typeof value !== 'string') return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname.includes('.') &&
    !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) && !u.hostname.endsWith('.local'); } catch { return false; }
}
export function validateCheckoutReceipt(receipt: Json, candidate: Json, purchase: Json, hash: string, now = Date.now()) {
  if (!/^\d{6}$/.test(purchase.postcode || '') || !/^[a-f0-9]{64}$/.test(hash) || !receipt || typeof receipt.quoteId !== 'string' || !receipt.quoteId || receipt.quoteId.length > 200 ||
    receipt.productId !== candidate.productId || receipt.variant !== candidate.variant || receipt.productName !== candidate.productName ||
    receipt.listingUrl !== candidate.url || receipt.postcode !== purchase.postcode || receipt.requirementsHash !== hash ||
    receipt.currency !== 'INR' || receipt.condition !== 'New' || receipt.availability !== 'In stock' ||
    receipt.completeCost !== true || receipt.unconditional !== true || receipt.deliveryAvailable !== true ||
    receipt.seller?.reliable !== true || typeof receipt.seller?.name !== 'string' || !receipt.seller.name.trim() || !publicHttps(receipt.seller?.evidenceUrl)) return null;
  const issued = Date.parse(receipt.issuedAt), expires = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 30000 || issued < now - 900000 || expires <= now || expires > issued + 900000) return null;
  if (!Array.isArray(receipt.components) || receipt.components.length < 3 || receipt.components.length > 30) return null;
  if (!receipt.components.every((c: Json) => ['product', 'accessory', 'shipping', 'tax'].includes(c.kind) && typeof c.label === 'string' && c.label.trim() &&
    Number.isFinite(c.amount) && c.amount >= 0 && publicHttps(c.evidenceUrl))) return null;
  const products = receipt.components.filter((c: Json) => c.kind === 'product');
  if (products.length !== 1 || products[0].amount <= 0 || !receipt.components.some((c: Json) => c.kind === 'shipping') || !receipt.components.some((c: Json) => c.kind === 'tax')) return null;
  const total = receipt.components.reduce((n: number, c: Json) => n + c.amount, 0);
  if (!Number.isFinite(receipt.total) || receipt.total <= 0 || Math.abs(total - receipt.total) > 0.01) return null;
  return { ...candidate, price: products[0].amount, total: receipt.total, checkedAt: new Date(issued).toISOString(),
    availability: 'In stock', condition: 'New', verified: true, deliveryVerified: true, sellerReliable: true,
    mandatoryCostsVerified: true, delivery: `Checkout delivery verified for ${purchase.postcode}`,
    accessories: receipt.components.filter((c: Json) => c.kind === 'accessory').map((c: Json) => c.label).join(', ') || 'Required kit checked by merchant adapter',
    quoteId: receipt.quoteId, quoteExpiresAt: receipt.expiresAt, evidenceLevel: 'Authenticated merchant checkout receipt', checkoutComponents: receipt.components };
}
export function verifierConfigured() {
  return publicHttps(process.env.OFFER_VERIFIER_URL) && (process.env.OFFER_VERIFIER_TOKEN?.length || 0) >= 32 && (process.env.OFFER_VERIFIER_SIGNING_SECRET?.length || 0) >= 32;
}
export async function verifiedCheckoutOffers(purchase: Json, parsed: Json, candidates: Json[], signal: AbortSignal) {
  if (!verifierConfigured() || !candidates.length) return [];
  const hash = requirementsHash(purchase, parsed);
  try {
    const result = await fetch(process.env.OFFER_VERIFIER_URL!, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${process.env.OFFER_VERIFIER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, purchaseId: purchase.id, postcode: purchase.postcode, currency: 'INR', condition: 'New',
        requestText: purchase.requestText, mustHave: parsed.mustHave || [], requirementsHash: hash,
        candidates: candidates.slice(0,4).map(c => ({ productId: c.productId, productName: c.productName, variant: c.variant, url: c.url })) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!result.ok || !result.headers.get('content-type')?.includes('application/json')) return [];
    const reader = result.body?.getReader(); if (!reader) return [];
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
      if (size > 300000) { await reader.cancel(); return []; } chunks.push(item.value); } } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!signedReceiptBody(raw, result.headers.get('x-mirana-signature') || '', process.env.OFFER_VERIFIER_SIGNING_SECRET!)) return [];
    const data = JSON.parse(raw); if (!Array.isArray(data.receipts) || data.receipts.length > 4) return [];
    const validated: Json[] = [];
    for (const receipt of data.receipts) {
      const candidate = candidates.find(c => c.productId === receipt.productId && c.url === receipt.listingUrl);
      if (!candidate || validated.some(c => c.productId === candidate.productId && c.url === candidate.url)) continue;
      const offer = validateCheckoutReceipt(receipt, candidate, purchase, hash); if (offer) validated.push(offer);
    }
    return validated;
  } catch { return []; } // Unavailable/malformed adapters never create deals.
}
