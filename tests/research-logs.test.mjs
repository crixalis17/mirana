import assert from 'node:assert/strict';
import {logResearchEvent,safeResearchErrorCode} from '../lib/research/logs.ts';
const savedLevel=process.env.RESEARCH_LOG_LEVEL, info=console.info, error=console.error;
const lines=[];
try {
  delete process.env.RESEARCH_LOG_LEVEL;
  console.info=line=>lines.push({kind:'info',line});console.error=line=>lines.push({kind:'error',line});
  const publicInput={event:'completed',jobId:'private-job-SECRET-CANARY',stage:'gather',attempt:1,elapsedMs:234,
    round:0,maxCalls:8,maxRounds:2,sourceCount:12,factCount:4,gapCount:2,candidateCount:3,retainedCount:2,
    inputTokens:101,outputTokens:22,thinkingTokens:4,searchQueries:2,provider:'vertex',model:'gemini-3.8-flash',statusCode:200,retryable:false};
  const safe=logResearchEvent({...publicInput,userId:'SECRET-CANARY',email:'SECRET-CANARY@example.invalid',url:'https://merchant.test/?token=SECRET-CANARY',headers:{authorization:'SECRET-CANARY'},prompt:'SECRET-CANARY',privateReasoning:'SECRET-CANARY',rawProviderOutput:{message:'SECRET-CANARY'},timestamp:'SECRET-CANARY',counts:{secret:'SECRET-CANARY'}});
  assert.match(safe.timestamp,/^\d{4}-\d{2}-\d{2}T/);assert.match(safe.jobHash,/^[a-f0-9]{64}$/);assert.equal(safe.jobId,undefined);
  assert.equal(safe.model,'gemini-3.8-flash');assert.equal(safe.sourceCount,12);assert.equal(safe.thinkingTokens,4);assert.equal(safe.retryable,false);
  assert.equal(lines[0].kind,'info');assert.match(lines[0].line,/^mirana_research /);assert.equal(lines[0].line.includes('SECRET-CANARY'),false);
  for(const event of ['started','completed','failed','retry','lease','cancel','publish','source-read','model-call','tool-call'])assert.equal(logResearchEvent({event}).event,event);
  const toolLog=logResearchEvent({event:'tool-call',toolProvider:'rainforest',tool:'fetch_product_listing',attemptedToolCalls:2,maxToolCalls:12,inputBytes:200,maxOutputTokens:6000,rawUrl:'SECRET-CANARY',query:'SECRET-CANARY'});
  assert.equal(toolLog.toolProvider,'rainforest');assert.equal(toolLog.tool,'fetch_product_listing');assert.equal(toolLog.attemptedToolCalls,2);assert.equal(toolLog.maxToolCalls,12);assert.equal(JSON.stringify(toolLog).includes('SECRET-CANARY'),false);
  const unsafeTool=logResearchEvent({event:'tool-call',toolProvider:'SECRET-CANARY',tool:'https://merchant.test/?key=SECRET-CANARY',maxToolCalls:25,attemptedToolCalls:-1});
  assert.deepEqual(Object.keys(unsafeTool).sort(),['event','timestamp']);
  assert.equal(lines.find(line=>JSON.parse(line.line.slice('mirana_research '.length)).event==='failed').kind,'error');
  for(const model of ['gemini-3.5-flash-lite','gemini-3.1-pro-preview','gemini-2.5-flash-001','gpt-5.5','gpt-5-mini','gpt-4.1-2025-04-14','o3-mini'])assert.equal(logResearchEvent({event:'started',model}).model,model);
  const wrong=logResearchEvent({event:'failed',jobId:{secret:'SECRET-CANARY'},stage:'SECRET-CANARY',attempt:Infinity,elapsedMs:-1,inputTokens:1.5,outputTokens:1e12,
    statusCode:999,model:'gemini-SECRET-CANARY',provider:'SECRET-CANARY',errorCode:'SECRET-CANARY',retryable:'SECRET-CANARY',sourceCount:{secret:'SECRET-CANARY'}});
  assert.deepEqual(Object.keys(wrong).sort(),['event','timestamp']);
  for(const fields of [null,[],{}, {event:'SECRET-CANARY'}, {get event(){throw new Error('SECRET-CANARY');}}]){const before=lines.length;assert.equal(logResearchEvent(fields),null);assert.equal(lines.length,before);}
  for(const code of ['RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','PROVIDER_TIMEOUT','INTERRUPTED','INVALID_OUTPUT','INCOMPLETE_OUTPUT','NO_EVIDENCE','lease_lost','budget_exhausted','cancelled','superseded']) {
    const supplied={code,get message(){throw new Error('Error messages must never be read.');}};
    assert.equal(safeResearchErrorCode(supplied),code.toUpperCase());
    assert.equal(logResearchEvent({event:'failed',errorCode:safeResearchErrorCode(supplied)}).errorCode,code.toUpperCase());
  }
  for(const code of ['ECONNRESET','ENOTFOUND','EAI_AGAIN'])assert.equal(safeResearchErrorCode({code}),'NETWORK_ERROR');
  assert.equal(safeResearchErrorCode({code:'ETIMEDOUT'}),'PROVIDER_TIMEOUT');
  assert.equal(safeResearchErrorCode({name:'AbortError'}),'INTERRUPTED');assert.equal(safeResearchErrorCode({name:'TimeoutError'}),'PROVIDER_TIMEOUT');
  assert.equal(safeResearchErrorCode(new SyntaxError('SECRET-CANARY')),'INVALID_OUTPUT');
  for(const failure of [null,'SECRET-CANARY',{code:'SECRET-CANARY',message:'SECRET-CANARY'},new Error('SECRET-CANARY'),{get code(){throw new Error('SECRET-CANARY');}}])assert.equal(safeResearchErrorCode(failure),'UNEXPECTED_ERROR');
  for(const level of ['info','debug']){process.env.RESEARCH_LOG_LEVEL=level;logResearchEvent({...publicInput,raw:'SECRET-CANARY'});}
  process.env.RESEARCH_LOG_LEVEL='off';const before=lines.length;assert.equal(logResearchEvent(publicInput),null);assert.equal(lines.length,before);
  assert.equal(lines.some(line=>line.line.includes('SECRET-CANARY')),false);
} finally {
  if(savedLevel===undefined)delete process.env.RESEARCH_LOG_LEVEL;else process.env.RESEARCH_LOG_LEVEL=savedLevel;
  console.info=info;console.error=error;
}
console.log('PASS: flat safe research logs, hashed job identity, bounded numbers, model/code validation, safe error classification, level control and secret-canary exclusion');
