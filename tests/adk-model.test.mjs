import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(error){if(s.startsWith('.'))return next(`${s}.ts`,c);throw error;}}});
const {createAdkVertexModel,adkVertexEndpoint,ADK_MODEL_LIMITS}=await import('../lib/research/adk-model.ts');
const env={NODE_ENV:'test',GOOGLE_API_KEY:'vertex-private-canary',GOOGLE_CLOUD_PROJECT:'mirana-adk-fixture',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash'};
const signal=new AbortController().signal;
const request={model:'gemini-3.8-flash',contents:[{role:'user',parts:[{text:'Find a tablet'}]}],config:{systemInstruction:'Use registered tools.',tools:[{googleSearch:{}},{functionDeclarations:[{name:'search_products_india',parametersJsonSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}]}],responseSchema:{type:'object',properties:{answer:{type:['string','null']}},required:['answer']}},liveConnectConfig:{},toolsDict:{}};
const collect=async(model,input=request)=>{const events=[];for await(const event of model.generateContentAsync(input,false))events.push(event);return events;};
const reply=(parts,extra={})=>new Response(JSON.stringify({candidates:[{content:{role:'model',parts},finishReason:'STOP',groundingMetadata:{webSearchQueries:['tablet reviews','tablet reviews'],groundingChunks:[{web:{uri:'https://www.samsung.com/in/tablets/',title:'Tablets'}}],searchEntryPoint:{renderedContent:'Untrusted HTML'}},...extra}],usageMetadata:{promptTokenCount:101,candidatesTokenCount:22,thoughtsTokenCount:33}}));
let fetches=0,reserved=0;const usage=[];
const model=createAdkVertexModel({env,signal,maxOutputTokens:65536,beforeModelCall:async(bytes,max)=>{reserved++;assert.ok(bytes>0);assert.equal(max,65536);},onModelUsage:async(item)=>usage.push(item),fetch:async(target,init)=>{
  fetches++;assert.equal(reserved,fetches,'Reserve each model attempt before dispatch');assert.equal(target,adkVertexEndpoint(env));
  assert.equal(new Headers(init.headers).get('x-goog-api-key'),env.GOOGLE_API_KEY);assert.equal(init.redirect,'error');
  const body=JSON.parse(init.body);assert.equal(body.generationConfig.maxOutputTokens,65536);assert.deepEqual(body.generationConfig.thinkingConfig,{thinkingLevel:'HIGH',includeThoughts:false});
  assert.equal(body.generationConfig.responseSchema.type,'OBJECT');assert.deepEqual(body.generationConfig.responseSchema.properties.answer,{type:'STRING',nullable:true});
  assert.ok(body.tools.some(tool=>tool.googleSearch));assert.ok(body.tools.some(tool=>tool.functionDeclarations?.[0].parametersJsonSchema.additionalProperties===false));
  assert.equal(JSON.stringify(body).includes('httpOptions'),false);
  return reply([{thought:true,text:'Private internal reasoning.'},{functionCall:{name:'search_products_india',args:{query:'tablet pen India'},id:'a1'},thoughtSignature:'opaque-signature'}]);
}});
const events=await collect(model);
assert.equal(events.length,1);assert.equal(events[0].finishReason,'STOP');assert.equal(events[0].content.parts.length,1);
assert.equal(events[0].content.parts[0].thoughtSignature,'opaque-signature');assert.equal(JSON.stringify(events).includes('Private internal reasoning'),false);
assert.equal(JSON.stringify(events).includes('Untrusted HTML'),false);assert.equal(usage.length,1);
assert.deepEqual(usage[0],{provider:'vertex',model:'gemini-3.8-flash',inputTokens:101,outputTokens:22,thinkingTokens:33,searchQueries:1});

// ADK history replays function signatures and tool results without thought text.
let replayBody;
await collect(createAdkVertexModel({env,signal,fetch:async(_target,init)=>{replayBody=JSON.parse(init.body);return reply([{text:'Read this listing before deciding.'}]);}}),{...request,config:{...request.config,responseSchema:undefined},contents:[...request.contents,events[0].content,{role:'user',parts:[{functionResponse:{name:'search_products_india',id:'a1',response:{ok:true,sources:[]}}}]}]});
assert.equal(replayBody.contents[1].parts[0].thoughtSignature,'opaque-signature');assert.equal(replayBody.contents[2].parts[0].functionResponse.id,'a1');assert.equal(replayBody.generationConfig.maxOutputTokens,65536);

for(const override of [{NODE_ENV:'production'},{VERCEL:'1'},{GEMINI_RESEARCH_MODEL:'gemini-flash-latest'},{GOOGLE_CLOUD_PROJECT:'../other-project'}])assert.throws(()=>createAdkVertexModel({env:{...env,...override},signal}));
assert.match(adkVertexEndpoint({...env,NODE_ENV:'production',RESEARCH_PRODUCTION_ENABLED:'true'}),/gemini-3.8-flash:generateContent$/);
let deniedFetches=0;const noDispatch=createAdkVertexModel({env,signal,fetch:async()=>{deniedFetches++;throw new Error('Must not dispatch');}});
for(const bad of [{...request,model:'another-model'},{...request,config:{tools:[{urlContext:{}}]}},{...request,config:{maxOutputTokens:ADK_MODEL_LIMITS.maxOutputTokens+1}},{...request,contents:[{role:'user',parts:[{text:'x'.repeat(ADK_MODEL_LIMITS.inputBytes)}]}]}])await assert.rejects(collect(noDispatch,bad),error=>error.code==='INVALID_INPUT'||error.code==='INVALID_MODEL');
assert.equal(deniedFetches,0);
await assert.rejects(collect(createAdkVertexModel({env,signal,beforeModelCall:async()=>{throw Object.assign(new Error('No lease'),{code:'lease_lost'});},fetch:async()=>{throw new Error('Must not dispatch');}})),error=>error.code==='lease_lost');
await assert.rejects(collect(createAdkVertexModel({env,signal,fetch:async()=>new Response(`${env.GOOGLE_API_KEY} private quota details`,{status:429})})),error=>error.code==='RATE_LIMIT'&&error.statusCode===429&&error.retryable&&!error.message.includes(env.GOOGLE_API_KEY));
await assert.rejects(collect(createAdkVertexModel({env,signal,fetch:async()=>new Response('x'.repeat(ADK_MODEL_LIMITS.responseBytes+1))})),error=>error.code==='INVALID_OUTPUT');
let incompleteUsage=0;
await assert.rejects(collect(createAdkVertexModel({env,signal,onModelUsage:async()=>{incompleteUsage++;},fetch:async()=>reply([{text:'Incomplete'}],{finishReason:'MAX_TOKENS'})})),error=>error.code==='INCOMPLETE_OUTPUT');
assert.equal(incompleteUsage,1,'Usage is accounted even when completion validation fails');
const cancelled=new AbortController();cancelled.abort();await assert.rejects(collect(createAdkVertexModel({env,signal:cancelled.signal,fetch:async()=>{throw new Error('Must not dispatch');}})),error=>error.code==='INTERRUPTED');
const bodyAbort=new AbortController();let bodyCancelled=false;
const blocked=collect(createAdkVertexModel({env,signal:bodyAbort.signal,fetch:async()=>new Response(new ReadableStream({start(){setTimeout(()=>bodyAbort.abort(),10);},cancel(){bodyCancelled=true;}}))}));
await assert.rejects(blocked,error=>error.code==='INTERRUPTED');assert.equal(bodyCancelled,true);
console.log('PASS: ADK BaseLlm fixed Vertex API-key endpoint, Gemini 3.8-only, HIGH thinking, 65536 override, function signatures/history, schemas and Google Search, attempt fencing, bounded/cancellable responses, private error redaction, usage and no thought text');
