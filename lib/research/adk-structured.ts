import {LlmAgent,isFinalResponse} from '@google/adk';
import type {Schema} from '@google/genai';
import {createAdkVertexModel} from './adk-model';
import {configureAdkPrivacy,runIsolatedAdk} from './adk-runtime';
import {ResearchProviderError,validateProviderSchema,vertexSchema} from './provider';
import type {ProviderAnswer,ProviderRequest,ResearchUsage} from './provider';

export type AdkStructuredOptions={env?:NodeJS.ProcessEnv;fetch?:typeof fetch};

// Durable research checkpoints belong to the existing owner-scoped job store.
// A fresh ADK session executes one structured stage without sharing prior users'
// prompts, tools, or model-generated session state.
export async function researchAdkStructuredRequest(request:ProviderRequest,signal:AbortSignal,options:AdkStructuredOptions={}):Promise<ProviderAnswer>{
  if(typeof window!=='undefined')throw new ResearchProviderError('Research transport is server-only.','PROVIDER_REJECTED');
  if(request.search)throw new ResearchProviderError('Search requires the registered research tool agent.','PROVIDER_REJECTED');
  configureAdkPrivacy();
  const env=options.env||process.env;
  const maxOutputTokens=request.maxOutputTokens??6000;
  const usage:ResearchUsage={provider:'vertex',model:'gemini-3.8-flash',inputTokens:0,outputTokens:0,thinkingTokens:0,searchQueries:0};
  const model=createAdkVertexModel({env,fetch:options.fetch,signal,maxOutputTokens,
    beforeModelCall:request.beforeModelCall,
    onModelUsage:async observed=>{usage.inputTokens+=observed.inputTokens;usage.outputTokens+=observed.outputTokens;
      usage.thinkingTokens+=observed.thinkingTokens;usage.searchQueries+=observed.searchQueries;await request.onModelUsage?.(observed);}});
  const agent=new LlmAgent({name:'mirana_structured_stage',model,
    // An instruction provider avoids ADK interpreting literal braces in the
    // stage's contract as session-state substitution placeholders.
    instruction:()=>request.instructions,
    tools:[],disallowTransferToParent:true,disallowTransferToPeers:true,
    generateContentConfig:{maxOutputTokens},
    // ADK disallows responseSchema in constructor configuration. A callback
    // supplies the provider contract without ADK parsing or logging raw output;
    // the existing strict validator remains the authoritative final check.
    beforeModelCallback:request.schema?({request:modelRequest})=>{
      modelRequest.config??={};
      modelRequest.config.responseMimeType='application/json';
      modelRequest.config.responseSchema=vertexSchema(request.schema!) as Schema;
      return undefined;
    }:undefined});
  let text='';
  try{
    signal.throwIfAborted();
    for await(const event of runIsolatedAdk(agent,request.input,signal,1)){
      if(event.errorCode)throw new ResearchProviderError('Research stage returned an unusable answer.','INVALID_OUTPUT');
      if(isFinalResponse(event))text=(event.content?.parts||[]).filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('\n');
    }
    signal.throwIfAborted();
    if(!text.trim())throw new ResearchProviderError('Research provider returned no usable text.','INVALID_OUTPUT');
    if(request.schema){let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new ResearchProviderError('Research stage returned malformed JSON.','INVALID_OUTPUT');}
      if(!validateProviderSchema(parsed,request.schema))throw new ResearchProviderError('Research stage failed its schema contract.','INVALID_OUTPUT');}
    return {text:text.trim(),sources:[],searched:false,usage};
  }catch(error){
    if(error instanceof ResearchProviderError)throw error;
    // Preserve worker fencing errors: they decide whether a checkpoint may be
    // retried and must never be replaced by a provider retry.
    const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
    if(['lease_lost','budget_exhausted','cancelled','superseded'].includes(String(code)))throw error;
    if(signal.aborted)throw new ResearchProviderError('Research request was interrupted.','INTERRUPTED',true);
    throw new ResearchProviderError('Research stage returned invalid output or could not complete.','INVALID_OUTPUT');
  }
}
