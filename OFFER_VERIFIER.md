# Actual checkout verification for deal emails

Mirana can research products and read provisional listing prices, but those alone cannot qualify an automatic deal email. Full-kit cost, shipping, tax, new condition, reliable seller and delivery to the requested postcode need actual merchant checkout evidence.

The migration includes an adapter client and validator in `lib/research/offer-verifier.ts`. **It does not include a merchant checkout service or a ready-made Amazon/Flipkart checkout API integration.** A trusted operator must implement or connect that service separately. Adding API keys does not supply the missing service. There has been no live adapter or verified offer-email test.

The service must obtain real authorized merchant quotes for the requested kit without placing an order. It must never sign an AI summary, cached snippet or product JSON-LD as a checkout quote. Mirana trusts the configured service to establish these facts; HMAC authenticates the receipt issuer and body, not the underlying merchant truth. Keep an auditable link from each component to actual evidence.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `OFFER_VERIFIER_URL` | Operator-controlled public HTTPS service endpoint; no URL credentials, custom port or redirects |
| `OFFER_VERIFIER_TOKEN` | Request bearer token, at least 32 characters |
| `OFFER_VERIFIER_SIGNING_SECRET` | Independent shared response-signing secret, at least 32 characters |

Store credentials only in server environment settings. Do not expose this endpoint credential to the browser or reuse Google, cron or database secrets. The service receives the purchase brief and postcode, so its operator must handle that data privately.

## Request

Mirana sends an HTTPS JSON POST with `Authorization: Bearer <OFFER_VERIFIER_TOKEN>`. At most four candidates are included. The example below is illustrative; identifiers, URLs and hashes are placeholders and are not a working merchant quote.

```json
{
  "version": 1,
  "purchaseId": "PURCHASE_ID",
  "postcode": "110001",
  "currency": "INR",
  "condition": "New",
  "requestText": "USER_REQUEST_TEXT",
  "mustHave": ["REQUIRED_KIT_OR_COMPATIBILITY"],
  "requirementsHash": "SHA256_HEX_FROM_THIS_REQUEST",
  "candidates": [
    {
      "productId": "PRODUCT_ID",
      "productName": "EXACT_PRODUCT_NAME",
      "variant": "EXACT_VARIANT",
      "url": "https://merchant.example/product"
    }
  ]
}
```

`requirementsHash` is lowercase hexadecimal SHA-256 of the UTF-8 result of:

```js
JSON.stringify({
  requestText: purchase.requestText || '',
  mustHave: parsed.mustHave || [],
  postcode: purchase.postcode
})
```

Preserve these property names and order when checking the hash. The service must inspect the brief and must-haves to quote all required accessories and compatibility. The hash binds the receipt to those requirements; it does not by itself prove the service checked them.

## Response and signature

Return HTTP 200, `Content-Type: application/json`, and an `x-mirana-signature` header. Its value is the 64-character hexadecimal HMAC-SHA256 of the **exact raw UTF-8 response body**, using `OFFER_VERIFIER_SIGNING_SECRET`. Sign the serialized body once and send those same bytes; do not sign a parsed/reformatted object.

```js
const raw = JSON.stringify({ receipts });
const signature = createHmac('sha256', signingSecret)
  .update(raw, 'utf8')
  .digest('hex');
```

An illustrative response has this shape. The sample amounts only demonstrate component addition; timestamps and all placeholder values must come from an actual current quote.

```json
{
  "receipts": [
    {
      "quoteId": "UNIQUE_MERCHANT_QUOTE_ID",
      "productId": "PRODUCT_ID",
      "productName": "EXACT_PRODUCT_NAME",
      "variant": "EXACT_VARIANT",
      "listingUrl": "https://merchant.example/product",
      "postcode": "110001",
      "requirementsHash": "SHA256_HEX_FROM_THIS_REQUEST",
      "currency": "INR",
      "condition": "New",
      "availability": "In stock",
      "completeCost": true,
      "unconditional": true,
      "deliveryAvailable": true,
      "seller": {
        "name": "VERIFIED_SELLER_NAME",
        "reliable": true,
        "evidenceUrl": "https://merchant.example/seller-evidence"
      },
      "issuedAt": "CURRENT_QUOTE_ISO_TIMESTAMP",
      "expiresAt": "QUOTE_EXPIRY_ISO_TIMESTAMP",
      "total": 1100,
      "components": [
        { "kind": "product", "label": "EXACT_PRODUCT", "amount": 1000, "evidenceUrl": "https://merchant.example/product" },
        { "kind": "accessory", "label": "REQUIRED_ACCESSORY", "amount": 100, "evidenceUrl": "https://merchant.example/accessory" },
        { "kind": "shipping", "label": "Shipping", "amount": 0, "evidenceUrl": "https://merchant.example/checkout-evidence" },
        { "kind": "tax", "label": "Additional tax", "amount": 0, "evidenceUrl": "https://merchant.example/checkout-evidence" }
      ]
    }
  ]
}
```

Only return zero shipping or additional tax if verified; if tax is already included, describe that in the zero additional-tax component. Do not double count tax. Include every required accessory; never label a kit complete when required components or costs are unknown. Conditional bank, EMI or coupon eligibility cannot be folded into an unconditional receipt.

## Validation and failures

The validator requires exact matches for candidate product ID, name, variant and listing URL, plus request postcode and requirements hash. It accepts only INR, new goods, stock and delivery confirmations, complete unconditional cost, and a named reliable seller with public HTTPS evidence.

The quote must have been issued within the last 15 minutes, no more than 30 seconds in the future, and remain unexpired. Expiry cannot exceed 15 minutes after issue. The receipt has 3–30 nonnegative components, exactly one positive-priced product, explicit shipping and tax entries (including verified zero charges), and total equal to the component sum within ₹0.01. Evidence URLs must be public HTTPS URLs without credentials or custom ports.

The call is limited to 8 seconds, a 300 KB response and at most four receipts. Redirects, bad signatures, invalid bodies, mismatches, expired quotes and service failures produce no verified offers. The server rechecks quote expiry before sending email. Valid receipts still do not guarantee an alert: consent, budget, paused/purchased state, current report, history/target rule and duplicate suppression must pass.

Before enabling deal emails, verify an actual merchant quote end to end, including postcode, required kit, cost components, expiry and an actual Resend result. The UI's configured badge means the environment values are present; it is not evidence that checkout verification or delivery was tested.
