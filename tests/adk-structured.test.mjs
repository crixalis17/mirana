import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {researchAdkStructuredRequest}=await import('../lib/research/adk-structured.ts');
const env={NODE_ENV:'test',VERCEL:'',GOOGLE_API_KEY:'structured-key-canary',GOOGLE_CLOUD_PROJECT:'mirana-structured-fixture',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash'};
const signal=new AbortController().signal;
const schema={type:'object',properties:{category:{type:'string',minLength:1,maxLength:30},score:{type:'integer',minimum:1,maximum:3}},required:['category','score'],additionalProperties:false};
const request={instructions:'Assess the exact stage contract; {literal} is part of the instruction.',input:{brief:'A quiet laptop'},schema};
const response=(text,finishReason='STOP')=>Response.json({candidates:[{content:{role:'model',parts:[{text:'private model thought',thought:true},{text}]},finishReason}],usageMetadata:{promptTokenCount:11,candidatesTokenCount:7,thoughtsTokenCount:5}});
let reservations=0,dispatches=0;
const result=await researchAdkStructuredRequest({...request,beforeModelCall:async(bytes,max)=>{assert.ok(bytes>0);assert.equal(max,6000);reservations++;}},signal,{env,fetch:async(target,init)=>{
 dispatches++;
 assert.equal(target,'https://aiplatform.googleapis.com/v1/projects/mirana-structured-fixture/locations/global/publishers/google/models/gemini-3.8-flash:generateContent');
 const body=JSON.parse(init.body);
 assert.equal(new Headers(init.headers).get('x-goog-api-key'),env.GOOGLE_API_KEY);
 assert.ok(JSON.stringify(body.systemInstruction).includes('{literal}'),'Literal contract braces must not become ADK state references');
 assert.equal(body.generationConfig.responseMimeType,'application/json');
 assert.equal(body.generationConfig.responseSchema.type,'OBJECT');
 assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'HIGH');
 assert.equal(body.generationConfig.thinkingConfig.includeThoughts,false);
 assert.ok(!body.tools?.length,'Structured stages have no search, billing, auth or email tools');
 return response(JSON.stringify({category:'Laptop',score:2}));
}});
assert.equal(reservations,1);assert.equal(dispatches,1);assert.equal(result.text,'{"category":"Laptop","score":2}');
assert.equal(result.searched,false);assert.deepEqual(result.sources,[]);
assert.deepEqual(result.usage,{provider:'vertex',model:'gemini-3.8-flash',inputTokens:11,outputTokens:7,thinkingTokens:5,searchQueries:0});
assert.equal(JSON.stringify(result).includes('private model thought'),false);assert.equal(JSON.stringify(result).includes(env.GOOGLE_API_KEY),false);
assert.equal(process.env.ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS,'false');
assert.equal((await researchAdkStructuredRequest({instructions:'Summarize.',input:{brief:'laptop'}},signal,{env,fetch:async()=>response('A plain stage summary.')})).text,'A plain stage summary.');

for(const text of ['not JSON','{"category":"","score":2}','{"category":"Laptop","score":1.5}','{"category":"Laptop","score":4}','{"category":"Laptop","score":2,"extra":true}']){
 await assert.rejects(researchAdkStructuredRequest(request,signal,{env,fetch:async()=>response(text)}),e=>e.code==='INVALID_OUTPUT'&&!e.message.includes(text));
}
await assert.rejects(researchAdkStructuredRequest(request,signal,{env,fetch:async()=>response('{"category":"Laptop","score":2}','MAX_TOKENS')}),e=>e.code==='INCOMPLETE_OUTPUT');
// HIGH thinking shares the output allowance. Truncated answers must still
// report paid usage without accepting partial JSON.
let truncatedUsage;
await assert.rejects(researchAdkStructuredRequest({...request,maxOutputTokens:16384,onModelUsage:async usage=>{truncatedUsage=usage;}},signal,{env,fetch:async(_url,init)=>{
 assert.equal(JSON.parse(init.body).generationConfig.maxOutputTokens,16384);
 return response('{"category":"Laptop","score":2}','MAX_TOKENS');
}}),e=>e.code==='INCOMPLETE_OUTPUT');
assert.equal(truncatedUsage.thinkingTokens,5);assert.equal(truncatedUsage.outputTokens,7);
await assert.rejects(researchAdkStructuredRequest(request,signal,{env,fetch:async()=>new Response('private provider token',{status:429})}),e=>e.code==='RATE_LIMIT'&&e.retryable&&!e.message.includes('private'));
await assert.rejects(researchAdkStructuredRequest(request,signal,{env,fetch:async()=>{throw new Error(`provider detail ${env.GOOGLE_API_KEY}`);}}),e=>!e.message.includes(env.GOOGLE_API_KEY));
await assert.rejects(researchAdkStructuredRequest(request,signal,{env,fetch:async()=>Response.json({candidates:[{content:{role:'model',parts:[{functionCall:{name:'send_email',args:{body:'malicious'}}}]},finishReason:'STOP'}]})}),e=>e.code==='INVALID_OUTPUT');

for(const code of ['lease_lost','budget_exhausted']){
 let attempted=0;
 await assert.rejects(researchAdkStructuredRequest({...request,beforeModelCall:async()=>{throw Object.assign(new Error('fence'),{code});}},signal,{env,fetch:async()=>{attempted++;return response('{}');}}),e=>e.code===code);
 assert.equal(attempted,0,'A denied durable reservation must prevent dispatch');
}
const abort=new AbortController();abort.abort();let cancelledDispatches=0;
await assert.rejects(researchAdkStructuredRequest(request,abort.signal,{env,fetch:async()=>{cancelledDispatches++;return response('{}');}}));
assert.equal(cancelledDispatches,0);
await assert.rejects(researchAdkStructuredRequest({...request,search:true},signal,{env}),e=>e.code==='PROVIDER_REJECTED');
for(const override of [{NODE_ENV:'production'},{VERCEL:'1'},{GEMINI_RESEARCH_MODEL:'gemini-flash-latest'}]){
 await assert.rejects(researchAdkStructuredRequest(request,signal,{env:{...env,...override},fetch:async()=>{throw new Error('Must not dispatch');}}));
}

// Exercise the normal provider entry point, not just the isolated stage adapter.
const saved=Object.fromEntries(Object.keys({...env,RESEARCH_PROVIDER:'vertex',RESEARCH_TOOLS_ENABLED:'true'}).map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch;
try{
 Object.assign(process.env,env,{RESEARCH_PROVIDER:'vertex',RESEARCH_TOOLS_ENABLED:'true'});
 globalThis.fetch=async()=>response('{"category":"Laptop","score":3}');
 const {researchProviderRequest}=await import('../lib/research/provider.ts');
 assert.equal((await researchProviderRequest(request,signal)).text,'{"category":"Laptop","score":3}');
}finally{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
console.log('PASS: actual ADK structured Runner, isolated stage sessions, exact high-thinking Vertex transport, strict runtime schema validation, safe errors, no tools, call fences and provider routing');
