// Local evaluation utilities. They do not contact providers or load credentials.
export const benchmarkModels = [
  { id: 'gemini-3.5-flash-lite', inputUsd: 0.30, outputUsd: 2.50, cachedUsd: 0.03 },
  // List rates before introductory credits back; actual invoices can be lower.
  { id: 'gemini-3.8-flash', inputUsd: 1.50, outputUsd: 7.50, cachedUsd: 0.15 },
  { id: 'gemini-3.1-pro-preview', inputUsd: 2.00, outputUsd: 12.00, cachedUsd: 0.20 },
];

export const benchmarkCases = [
  { id: 'tablet', topN: 3, budget: 60000, category: 'Tablet', postcode: '600019', banks: 'SBI',
    priorities: ['Performance', 'Value for money'], customTags: ['Compact 10–11 inches', 'Smooth pressure-sensitive pen'],
    requestText: 'A new compact 10–11 inch tablet only for handwritten notes, PDF annotation, casual sketches and detailed artwork. Total maximum INR 60000 including the compatible pressure-sensitive stylus and all mandatory accessories. Smooth and fast matters. Recommend useful drawing and note-taking apps. SBI card type and EMI eligibility are unknown. Compare official stores, Amazon India and Flipkart first. Do not assume bank eligibility or postcode delivery.' },
  { id: 'laptop', topN: 3, budget: 55000, category: 'Laptop', postcode: '600019', banks: '',
    priorities: ['Durability', 'Value for money'], customTags: ['Repairable', 'Quiet fan', 'Under 1.5 kg'],
    requestText: 'A new laptop for university documents, browser research, video calls and Python coding. No gaming. INR 55000 complete cost, at least 16 GB RAM and 512 GB SSD, under 1.5 kg. Prioritize repairability and a quiet fan. Identify measured battery-life evidence separately from manufacturer claims. Flag unavailable measurements rather than inventing them.' },
  { id: 'air-purifier', topN: 3, budget: 20000, category: 'Air purifier', postcode: '600019', banks: '',
    priorities: ['Low maintenance', 'Warranty & support'], customTags: ['Quiet bedroom', 'No required subscription'],
    requestText: 'A new air purifier for a 180 square-foot bedroom, INR 20000 including required filters. Quiet at night, physical particulate filtration, no ozone-generating or required ionizer mode, no required subscription. Compare CADR, replacement-filter availability, recurring filter costs and India service support. Do not invent a health benefit or annual filter cost when evidence is missing.' },
  { id: 'tablet-repeat', repeatOf: 'tablet' },
];

export function toVertexSchema(schema) {
  const type = Array.isArray(schema.type) ? schema.type.find(t => t !== 'null') : schema.type;
  const out = { type: type.toUpperCase() };
  if (Array.isArray(schema.type) && schema.type.includes('null')) out.nullable = true;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toVertexSchema(v)]));
    out.required = schema.required;
    out.propertyOrdering = Object.keys(schema.properties);
  }
  if (schema.items) out.items = toVertexSchema(schema.items);
  return out;
}

export function validateSchema(value, schema, path = '$') {
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.includes(actual) || (actual === 'number' && !Number.isFinite(value))) return [`${path}: expected ${types.join('|')}`];
  if (actual === 'array') return value.flatMap((v, i) => validateSchema(v, schema.items, `${path}[${i}]`));
  if (actual !== 'object') return [];
  const errors = (schema.required || []).filter(k => !Object.hasOwn(value, k)).map(k => `${path}.${k}: missing`);
  for (const [k, v] of Object.entries(value)) {
    if (!schema.properties[k]) { if (schema.additionalProperties === false) errors.push(`${path}.${k}: unexpected`); }
    else errors.push(...validateSchema(v, schema.properties[k], `${path}.${k}`));
  }
  return errors;
}

export function responseText(data) {
  return (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n');
}

export function groundingSources(data) {
  const grounding = data.candidates?.[0]?.groundingMetadata || {};
  return { queries: (grounding.webSearchQueries || []).filter(q => typeof q === 'string' && q.trim()),
    supports: grounding.groundingSupports || [],
    sources: (grounding.groundingChunks || []).filter(c => c.web?.uri).map(c => ({ url: c.web.uri, title: c.web.title || '', domain: c.web.domain || '' })) };
}

export function estimatedCost(model, usage = {}, queries = []) {
  const input = usage.promptTokenCount || 0, cached = usage.cachedContentTokenCount || 0;
  const output = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
  // Conservative assumption that the account's free search quota is exhausted.
  const searchCount = new Set(queries).size;
  return { promptTokens: input, cachedTokens: cached, outputAndThinkingTokens: output, searchCount,
    usd: (Math.max(0, input - cached) * model.inputUsd + cached * model.cachedUsd + output * model.outputUsd) / 1e6 + searchCount * 0.014 };
}

export function structuralMetrics(draft, report, sources, brief, schemaErrors) {
  const candidates = draft?.products || [], retained = report?.products || [];
  const urls = new Set(sources.map(s => s.url));
  const supplied = candidates.flatMap(p => [...(p.sources || []).map(s => s.url), ...(p.offers || []).map(o => o.url)]);
  const sourceText = sources.map(s => `${s.url} ${s.title} ${s.domain}`).join(' ').toLowerCase();
  return { schemaValid: !schemaErrors.length, candidatesReturned: candidates.length, candidatesRetained: retained.length,
    topNRespected: candidates.length <= brief.topN, unknownSourceUrls: supplied.filter(url => !urls.has(url)).length,
    knownOverBudgetCandidates: candidates.filter(p => p.offers?.length && p.offers.every(o => typeof o.price === 'number' && o.price > brief.budget)).length,
    hasAmazonEvidence: /amazon\.in/.test(sourceText), hasFlipkartEvidence: /flipkart\.com/.test(sourceText),
    sourceCount: sources.length, clarificationCount: draft?.needsClarification?.length || 0,
    preferencesCaptured: report?.preferencesUsed || null };
}
