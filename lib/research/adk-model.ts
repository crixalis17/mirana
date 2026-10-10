import {BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse} from '@google/adk';
import {ResearchProviderError, type ResearchUsage} from './provider';
import {researchRuntimeAllowed} from './runtime-policy';

type Env = Record<string, string | undefined>;
type RecordValue = Record<string, unknown>;
export const ADK_RESEARCH_MODEL = 'gemini-3.8-flash';
export const ADK_MODEL_LIMITS = {inputBytes:500_000,responseBytes:2_000_000,maxOutputTokens:65_536} as const;
export type AdkVertexModelOptions = {
  env?:Env; fetch?:typeof fetch; signal:AbortSignal; maxOutputTokens?:number;
  beforeModelCall?:(inputBytes:number,maxOutputTokens:number)=>Promise<void>;
  onModelUsage?:(usage:ResearchUsage)=>Promise<void>;
};

function record(value:unknown):RecordValue {return value && typeof value==='object' && !Array.isArray(value)?value as RecordValue:{};}
function tokens(value:unknown) {return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;}

// A project-bound Vertex endpoint keeps API-key research on the user's Cloud
// account. ADK's built-in Gemini Vertex client uses ADC rather than this key.
export function adkVertexEndpoint(env:Env=process.env) {
  if(typeof window!=='undefined')throw new ResearchProviderError('Research transport is server-only.','LOCAL_ONLY');
  if(!researchRuntimeAllowed(env))throw new ResearchProviderError('Production research is not enabled.','LOCAL_ONLY');
  if(!env.GOOGLE_API_KEY||!(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/).test(env.GOOGLE_CLOUD_PROJECT||''))throw new ResearchProviderError('Vertex research credentials are not configured.','NOT_CONFIGURED');
  if(env.GEMINI_RESEARCH_MODEL&&env.GEMINI_RESEARCH_MODEL!==ADK_RESEARCH_MODEL)throw new ResearchProviderError('ADK research requires Gemini 3.8 Flash.','INVALID_MODEL');
  return `https://aiplatform.googleapis.com/v1/projects/${env.GOOGLE_CLOUD_PROJECT}/locations/global/publishers/google/models/${ADK_RESEARCH_MODEL}:generateContent`;
}

function vertexSchema(value:unknown):RecordValue {
  const schema=record(value);
  const type=Array.isArray(schema.type)?schema.type.find(kind=>kind!=='null'):schema.type;
  if(typeof type!=='string')throw new ResearchProviderError('Research schema is invalid.','INVALID_INPUT');
  return {
    type:type.toUpperCase(),
    ...(schema.nullable===true||Array.isArray(schema.type)&&schema.type.includes('null')?{nullable:true}:{}),
    ...Object.fromEntries(['description','format','enum','minimum','maximum','minItems','maxItems','minLength','maxLength','pattern'].filter(key=>schema[key]!==undefined).map(key=>[key,schema[key]])),
    ...(schema.items?{items:vertexSchema(schema.items)}:{}),
    ...(schema.properties?{properties:Object.fromEntries(Object.entries(record(schema.properties)).map(([name,child])=>[name,vertexSchema(child)])),
      ...(schema.required?{required:schema.required}:{}),propertyOrdering:schema.propertyOrdering||Object.keys(record(schema.properties))}:{}),
  };
}

function requestBody(request:LlmRequest,maxOutputTokens:number):RecordValue {
  if(request.model&&request.model!==ADK_RESEARCH_MODEL)throw new ResearchProviderError('ADK research requires Gemini 3.8 Flash.','INVALID_MODEL');
  const config=request.config||{};
  const contents=request.contents.map(content=>{
    if(content.role!=='user'&&content.role!=='model')throw new ResearchProviderError('Research content role is invalid.','INVALID_INPUT');
    const parts=(content.parts||[]).filter(part=>!part.thought).map(part=>{
      if(typeof part.text==='string')return {text:part.text};
      if(part.functionCall)return {functionCall:part.functionCall,...(part.thoughtSignature?{thoughtSignature:part.thoughtSignature}:{})};
      if(part.functionResponse)return {functionResponse:part.functionResponse};
      throw new ResearchProviderError('Research supports text and registered function tools only.','INVALID_INPUT');
    });
    if(!parts.length)throw new ResearchProviderError('Research content is empty.','INVALID_INPUT');
    return {role:content.role,parts};
  });
  const instruction=config.systemInstruction;
  let systemInstruction:RecordValue|undefined;
  if(typeof instruction==='string')systemInstruction={parts:[{text:instruction}]};
  else if(instruction){
    const items=Array.isArray(instruction)?instruction:[instruction];
    const parts=items.flatMap(item=>typeof item==='string'?[{text:item}]:record(item).parts as Array<RecordValue>||[]);
    if(parts.some(part=>typeof part.text!=='string'))throw new ResearchProviderError('Research instructions must be text.','INVALID_INPUT');
    systemInstruction={parts:parts.map(part=>({text:part.text}))};
  }
  const tools=(config.tools||[]).map(tool=>{
    const fields=record(tool);
    if(fields.googleSearch)return {googleSearch:{}};
    if(Array.isArray(fields.functionDeclarations))return {functionDeclarations:fields.functionDeclarations.map(record).map(declaration=>({
      name:declaration.name,description:declaration.description,
      ...(declaration.parametersJsonSchema?{parametersJsonSchema:declaration.parametersJsonSchema}:declaration.parameters?{parameters:vertexSchema(declaration.parameters)}:{}),
    }))};
    throw new ResearchProviderError('Research tool configuration is unsupported.','INVALID_INPUT');
  });
  const generationConfig:RecordValue={maxOutputTokens,thinkingConfig:{thinkingLevel:'HIGH',includeThoughts:false},
    ...Object.fromEntries(['temperature','topP','topK','stopSequences','responseMimeType'].filter(key=>record(config)[key]!==undefined).map(key=>[key,record(config)[key]])),
    ...(config.responseSchema?{responseSchema:vertexSchema(config.responseSchema)}:{}),
    ...(config.responseJsonSchema?{responseJsonSchema:config.responseJsonSchema}:{}),
  };
  if(config.responseSchema&&config.responseJsonSchema)throw new ResearchProviderError('Research output schema is ambiguous.','INVALID_INPUT');
  return {contents,generationConfig,...(systemInstruction?{systemInstruction}:{}),...(tools.length?{tools}:{}),...(config.toolConfig?{toolConfig:config.toolConfig}:{})};
}

async function readChunk(reader:ReadableStreamDefaultReader<Uint8Array>,signal:AbortSignal):Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve,reject)=>{
    const abort=()=>{void reader.cancel().catch(()=>{});reject(signal.reason??new Error('Interrupted'));};
    signal.addEventListener('abort',abort,{once:true});
    reader.read().then(chunk=>{signal.removeEventListener('abort',abort);resolve(chunk);},error=>{signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted)abort();
  });
}
async function readResponse(response:Response,signal:AbortSignal):Promise<RecordValue> {
  if(!response.ok){await response.body?.cancel();const error=new ResearchProviderError(response.status===429?'Research quota or rate limit reached.':'Research provider rejected the request.',
    response.status===429?'RATE_LIMIT':response.status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_REJECTED',response.status===429||response.status>=500);
    error.statusCode=response.status;throw error;}
  const reader=response.body?.getReader();if(!reader)throw new ResearchProviderError('Research returned no response.','INVALID_OUTPUT');
  const chunks:Uint8Array[]=[];let bytes=0;
  try {
    while(true){signal.throwIfAborted();const chunk=await readChunk(reader,signal);if(chunk.done)break;
      bytes+=chunk.value.byteLength;if(bytes>ADK_MODEL_LIMITS.responseBytes)throw new ResearchProviderError('Research response exceeded its size limit.','INVALID_OUTPUT');chunks.push(chunk.value);}
    return record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch(error){
    await reader.cancel().catch(()=>{});
    if(error instanceof ResearchProviderError)throw error;
    if(signal.aborted)throw new ResearchProviderError('Research was interrupted.','INTERRUPTED',true);
    throw new ResearchProviderError('Research provider returned malformed response data.','INVALID_OUTPUT');
  } finally {reader.releaseLock();}
}

export class AdkVertexModel extends BaseLlm {
  private readonly options:AdkVertexModelOptions;
  constructor(options:AdkVertexModelOptions){super({model:ADK_RESEARCH_MODEL});adkVertexEndpoint(options.env||process.env);this.options=options;}
  async *generateContentAsync(request:LlmRequest,stream=false,abortSignal?:AbortSignal):AsyncGenerator<LlmResponse,void> {
    if(stream)throw new ResearchProviderError('Streaming model calls are unavailable for research.','UNSUPPORTED_TRANSPORT');
    const env=this.options.env||process.env,endpoint=adkVertexEndpoint(env);
    const signal=AbortSignal.any([this.options.signal,...(abortSignal?[abortSignal]:[]),...(request.config?.abortSignal?[request.config.abortSignal]:[])]);
    if(signal.aborted)throw new ResearchProviderError('Research was interrupted.','INTERRUPTED',true);
    const maxOutputTokens=request.config?.maxOutputTokens??this.options.maxOutputTokens??ADK_MODEL_LIMITS.maxOutputTokens;
    if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>ADK_MODEL_LIMITS.maxOutputTokens)throw new ResearchProviderError('Research output token configuration is invalid.','INVALID_INPUT');
    const body=JSON.stringify(requestBody(request,maxOutputTokens)),inputBytes=Buffer.byteLength(body);
    if(inputBytes>ADK_MODEL_LIMITS.inputBytes)throw new ResearchProviderError('Research input exceeded its size limit.','INVALID_INPUT');
    await this.options.beforeModelCall?.(inputBytes,maxOutputTokens);
    if(signal.aborted)throw new ResearchProviderError('Research was interrupted.','INTERRUPTED',true);
    let response:Response;
    try {response=await (this.options.fetch||fetch)(endpoint,{method:'POST',redirect:'error',headers:{'x-goog-api-key':env.GOOGLE_API_KEY!,'Content-Type':'application/json'},body,signal});}
    catch {throw new ResearchProviderError(signal.aborted?'Research was interrupted.':'Research provider could not be reached.',signal.aborted?'INTERRUPTED':'PROVIDER_UNAVAILABLE',true);}
    const data=await readResponse(response,signal),candidate=record(Array.isArray(data.candidates)?data.candidates[0]:undefined),grounding=record(candidate.groundingMetadata),rawUsage=record(data.usageMetadata);
    const usage:ResearchUsage={provider:'vertex',model:ADK_RESEARCH_MODEL,inputTokens:tokens(rawUsage.promptTokenCount),outputTokens:tokens(rawUsage.candidatesTokenCount),
      thinkingTokens:tokens(rawUsage.thoughtsTokenCount),searchQueries:new Set(Array.isArray(grounding.webSearchQueries)?grounding.webSearchQueries.filter(query=>typeof query==='string'):[]).size};
    await this.options.onModelUsage?.(usage);
    const content=record(candidate.content),parts=Array.isArray(content.parts)?content.parts.map(record).filter(part=>!part.thought):[];
    // Thought text is never returned to ADK events or persisted progress. Signed
    // function call parts retain their opaque signature for subsequent turns.
    const safeParts=parts.flatMap<RecordValue>(part=>typeof part.text==='string'?[{text:part.text}]:part.functionCall?[{functionCall:record(part.functionCall),...(typeof part.thoughtSignature==='string'?{thoughtSignature:part.thoughtSignature}:{})}]:[]);
    if(!safeParts.length)throw new ResearchProviderError('Research provider returned no usable content.','INVALID_OUTPUT');
    const finishReason=typeof candidate.finishReason==='string'?candidate.finishReason:undefined;
    if(finishReason!=='STOP')throw new ResearchProviderError('Research did not return a complete answer.','INCOMPLETE_OUTPUT');
    yield {
      content:{role:'model',parts:safeParts as NonNullable<LlmResponse['content']>['parts']},
      groundingMetadata:{...Object.fromEntries(['groundingChunks','groundingSupports','webSearchQueries'].filter(key=>grounding[key]!==undefined).map(key=>[key,grounding[key]]))},
      usageMetadata:{promptTokenCount:usage.inputTokens,candidatesTokenCount:usage.outputTokens,thoughtsTokenCount:usage.thinkingTokens},
      finishReason:finishReason as LlmResponse['finishReason'],partial:false,turnComplete:true,
    };
  }
  async connect():Promise<BaseLlmConnection>{throw new ResearchProviderError('Live model connections are unavailable for research.','UNSUPPORTED_TRANSPORT');}
}

export function createAdkVertexModel(options:AdkVertexModelOptions){return new AdkVertexModel(options);}
