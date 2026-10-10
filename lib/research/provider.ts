// Server-only transport. Secrets are read at request time and never returned.
// Provider/schema envelopes are validated at runtime before consumption.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
export type ResearchUsage = { provider: 'openai' | 'vertex'; model: string; inputTokens: number; outputTokens: number; thinkingTokens: number; searchQueries: number };
export type GroundedSource = { url: string; title: string; excerpts: string[] };
export type ProviderAnswer = { text: string; sources: GroundedSource[]; searched: boolean; usage: ResearchUsage; diagnostics?:import('./tool-agent').ToolAgentDiagnostics };
export type ProviderRequest = { instructions: string; input: Json; schema?: Json; search?: boolean;
  beforeModelCall?:(inputBytes:number,maxOutputTokens:number)=>Promise<void>;
  beforeToolCall?:(provider:string,tool:string)=>Promise<void> };
export class ResearchProviderError extends Error {
  code: string; retryable: boolean;
  constructor(message: string, code: string, retryable = false) {super(message);this.code=code;this.retryable=retryable;}
}

export function researchProviderConfigured() {
  if(process.env.RESEARCH_TOOLS_ENABLED==='true'&&(process.env.NODE_ENV==='production'||process.env.VERCEL)&&process.env.RESEARCH_PRODUCTION_ENABLED!=='true')return false;
  const provider = process.env.RESEARCH_PROVIDER || 'openai';
  return provider === 'openai' ? !!process.env.OPENAI_API_KEY : provider === 'vertex' &&
    !!process.env.GOOGLE_API_KEY && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(process.env.GOOGLE_CLOUD_PROJECT || '');
}
function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const u = new URL(value); if (u.protocol !== 'https:' || u.port || u.username || u.password || !u.hostname.includes('.') ||
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname.endsWith('.local')) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
export function validateProviderSchema(value: unknown, schema: Json): boolean {
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.includes(kind) && !(kind === 'number' && types.includes('integer') && Number.isSafeInteger(value))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (kind === 'number') return Number.isFinite(value) &&
    (schema.minimum === undefined || Number(value) >= schema.minimum) && (schema.maximum === undefined || Number(value) <= schema.maximum);
  if (kind === 'string') return (schema.minLength === undefined || String(value).length >= schema.minLength) &&
    (schema.maxLength === undefined || String(value).length <= schema.maxLength);
  if (kind === 'array') return (schema.minItems === undefined || (value as unknown[]).length >= schema.minItems) &&
    (schema.maxItems === undefined || (value as unknown[]).length <= schema.maxItems) &&
    (value as unknown[]).every(v => validateProviderSchema(v, schema.items));
  if (kind !== 'object') return true;
  const record = value as Json;
  return (schema.required || []).every((key: string) => Object.hasOwn(record, key)) &&
    Object.entries(record).every(([key, v]) => schema.properties[key] ? validateProviderSchema(v, schema.properties[key]) : schema.additionalProperties !== false);
}
export function vertexSchema(schema: Json): Json {
  const type = Array.isArray(schema.type) ? schema.type.find((t: string) => t !== 'null') : schema.type;
  return { type: type.toUpperCase(), ...(Array.isArray(schema.type) && schema.type.includes('null') ? { nullable: true } : {}),
    ...(schema.enum ? {enum:schema.enum} : {}),
    ...Object.fromEntries(['minimum','maximum','minItems','maxItems'].filter(key=>schema[key]!==undefined).map(key=>[key,schema[key]])),
    ...(schema.items ? { items: vertexSchema(schema.items) } : {}),
    ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([k, s]) => [k, vertexSchema(s as Json)])), required: schema.required, propertyOrdering: Object.keys(schema.properties) } : {}) };
}
async function readJson(result: Response) {
  if (!result.ok) {
    await result.body?.cancel();
    throw new ResearchProviderError(result.status === 429 ? 'Research quota or rate limit reached.' : 'Research provider rejected the request. Check its server configuration.',
      result.status===429?'RATE_LIMIT':result.status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_REJECTED',result.status===429||result.status>=500);
  }
  const reader = result.body?.getReader(); if (!reader) throw new Error('Research provider returned an empty response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('Research provider response exceeded its size limit.'); } chunks.push(item.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Research provider returned malformed data.'); }
}
// Resolve ONLY Google's fixed search redirect service. Never follow or fetch the destination.
async function canonicalSource(value: unknown, signal: AbortSignal) {
  const key = publicUrl(value); if (!key) return null;
  const u = new URL(key); if (u.hostname !== 'vertexaisearch.cloud.google.com') return key;
  if (!u.pathname.startsWith('/grounding-api-redirect/')) return null;
  try { const r = await fetch(key, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
    const location = r.headers.get('location'); await r.body?.cancel();
    const destination = location && publicUrl(location); return destination && new URL(destination).hostname !== u.hostname ? destination : null;
  } catch { return null; }
}
function surrounding(text: string, start: number, end: number) {
  const left = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const right = text.indexOf('\n', end);
  return text.slice(left, right < 0 ? Math.min(text.length, end + 500) : right).trim().slice(0,1800);
}
export async function researchProviderRequest(request: ProviderRequest, signal: AbortSignal): Promise<ProviderAnswer> {
  if (typeof window !== 'undefined') throw new Error('Research transport is server-only.');
  if (!researchProviderConfigured()) throw new Error('Research provider is not configured.');
  const provider = (process.env.RESEARCH_PROVIDER || 'openai') as 'openai' | 'vertex';
  if(provider==='vertex'&&process.env.RESEARCH_TOOLS_ENABLED==='true'){
    if(request.search){
      const {researchToolAgentRequest}=await import('./tool-agent');
      return researchToolAgentRequest(request,signal,{beforeModelCall:request.beforeModelCall,beforeToolCall:request.beforeToolCall});
    }
    const {researchAdkStructuredRequest}=await import('./adk-structured');
    return researchAdkStructuredRequest(request,signal);
  }
  const timeout = Math.max(10000, Math.min(180000, Number(process.env.RESEARCH_STEP_TIMEOUT_MS) || 120000));
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
  let endpoint: string, body: Json, headers: Record<string,string>, model: string;
  if (provider === 'vertex') {
    model = process.env.GEMINI_RESEARCH_MODEL || 'gemini-3.8-flash';
    if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error('Invalid Gemini research model configuration.');
    endpoint = `https://aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
    headers = { 'x-goog-api-key': process.env.GOOGLE_API_KEY!, 'Content-Type': 'application/json' };
    body = { systemInstruction: { parts: [{text:request.instructions}] }, contents:[{role:'user',parts:[{text:JSON.stringify(request.input)}]}],
      generationConfig:{maxOutputTokens:6000,thinkingConfig:{thinkingLevel:request.search?'MEDIUM':'LOW'},
        ...(request.schema ? {responseMimeType:'application/json',responseSchema:vertexSchema(request.schema)} : {})},
      ...(request.search ? {tools:[{googleSearch:{}}]} : {}) };
  } else {
    model = process.env.OPENAI_RESEARCH_MODEL || 'gpt-5.5'; endpoint = 'https://api.openai.com/v1/responses';
    headers = { Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' };
    body = {model,store:false,max_output_tokens:6000,instructions:request.instructions,input:JSON.stringify(request.input),
      ...(request.search ? {tools:[{type:'web_search',external_web_access:true,search_context_size:'medium'}],tool_choice:'required',max_tool_calls:6,include:['web_search_call.action.sources']} : {}),
      ...(request.schema ? {text:{format:{type:'json_schema',name:'mirana_research_stage',strict:true,schema:request.schema}}} : {})};
  }
  await request.beforeModelCall?.(Buffer.byteLength(JSON.stringify(body)),6000);
  let result: Response;
  try { result = await fetch(endpoint, {method:'POST',redirect:'error',headers,body:JSON.stringify(body),signal:boundedSignal}); }
  catch {const interrupted=signal.aborted&&signal.reason?.name!=='TimeoutError';
    throw new ResearchProviderError(interrupted ? 'Research request was interrupted.' : 'Research provider could not be reached before the deadline.',interrupted?'INTERRUPTED':'PROVIDER_TIMEOUT',true); }
  let data:Json;
  try {data=await readJson(result);} catch(error) {
    if (error instanceof ResearchProviderError) throw error;
    if (boundedSignal.aborted) throw new ResearchProviderError('Research response was interrupted.','PROVIDER_TIMEOUT',true);
    throw new ResearchProviderError('Research provider returned invalid or oversized response data.','INVALID_OUTPUT');
  }
  const sources = new Map<string,GroundedSource>();
  const add = (url: unknown,title = '',excerpt = '') => {const key = publicUrl(url); if (!key || sources.size >= 40) return;
    const source = sources.get(key) || {url:key,title,excerpts:[]}; if (excerpt && source.excerpts.length < 12 && !source.excerpts.includes(excerpt)) source.excerpts.push(excerpt); sources.set(key,source);};
  let text = '', searched = false; let usage: ResearchUsage;
  if (provider === 'vertex') {
    const candidate = data.candidates?.[0]; if (candidate?.finishReason !== 'STOP') throw new ResearchProviderError('Research did not return a complete answer.','INCOMPLETE_OUTPUT');
    text = (candidate.content?.parts || []).filter((p: Json) => !p.thought && typeof p.text === 'string').map((p: Json)=>p.text).join('\n');
    const grounding = candidate.groundingMetadata || {}, chunks = grounding.groundingChunks || [];
    const mapped = await Promise.all(chunks.slice(0,40).map((chunk:Json)=>canonicalSource(chunk.web?.uri,boundedSignal)));
    mapped.forEach((url:string|null,index:number)=>add(url,chunks[index].web?.title || ''));
    for (const support of grounding.groundingSupports || []) for (const index of support.groundingChunkIndices || []) {
      add(mapped[index],chunks[index]?.web?.title || '',String(support.segment?.text || '').slice(0,1800));
    }
    searched = (grounding.webSearchQueries || []).length > 0 && sources.size > 0;
    usage = {provider,model,inputTokens:data.usageMetadata?.promptTokenCount || 0,outputTokens:data.usageMetadata?.candidatesTokenCount || 0,
      thinkingTokens:data.usageMetadata?.thoughtsTokenCount || 0,searchQueries:new Set(grounding.webSearchQueries || []).size};
  } else {
    if (data.status !== 'completed') throw new ResearchProviderError('Research did not return a complete answer.','INCOMPLETE_OUTPUT');
    for (const item of data.output || []) {
      if (item.type === 'web_search_call' && item.status === 'completed') {searched=true;for(const s of item.action?.sources || []) add(s.url,s.title || '');}
      if (item.type === 'message') for (const part of item.content || []) if (part.type === 'output_text') {
        text += `${part.text || ''}\n`;
        for (const annotation of part.annotations || []) if (annotation.type === 'url_citation') add(annotation.url,annotation.title || '',surrounding(part.text || '',annotation.start_index || 0,annotation.end_index || 0));
      }
    }
    // OpenAI total output already includes reasoning; expose disjoint counters.
    usage = {provider,model,inputTokens:data.usage?.input_tokens || 0,outputTokens:Math.max(0,(data.usage?.output_tokens || 0)-(data.usage?.output_tokens_details?.reasoning_tokens || 0)),
      thinkingTokens:data.usage?.output_tokens_details?.reasoning_tokens || 0,searchQueries:(data.output || []).filter((o:Json)=>o.type==='web_search_call').length};
  }
  if (!text.trim()) throw new ResearchProviderError('Research provider returned no usable text.','INVALID_OUTPUT');
  if (request.search && (!searched || !sources.size)) throw new ResearchProviderError('Research returned no usable web evidence.','NO_EVIDENCE');
  if (request.schema) {let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new ResearchProviderError('Research stage returned malformed JSON.','INVALID_OUTPUT');}
    if (!validateProviderSchema(parsed,request.schema)) throw new ResearchProviderError('Research stage failed its schema contract.','INVALID_OUTPUT');}
  return {text:text.trim(),sources:[...sources.values()],searched,usage};
}
