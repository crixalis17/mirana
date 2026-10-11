import {RETRIEVAL_HARNESS} from './retrieval-harness';
import type {ProviderRequest,ProviderAnswer} from './provider';
import {researchToolAgentRequest,type ToolAgentOptions} from './tool-agent';

export const DIRECTED_RETRIEVAL_INSTRUCTIONS=`You are a retrieval agent. Construct your own queries and choose the registered external tools adaptively from the supplied research plan and original user brief. The brief takes precedence over the plan. Never rank candidates, select a winner or make a purchase recommendation during retrieval.
Use short natural queries containing product family, explicit specifications and India. Do not concatenate the whole narrative, search placeholders such as "Any reputable brand", invent model names or silently relax constraints. For comparisons, search each requested family separately and obtain exact listing/specification evidence for each before spending the remaining calls on deep reviews. Missing attributes are optional; missing delivery postcode stays unknown.
Cover official Indian sources, Amazon India and Flipkart. Try different configured discovery providers when results are irrelevant or insufficient. Refine wrong variants. Read or fetch only exact URLs observed in tool results; never invent URLs. Cross-check Amazon/Flipkart candidates with fetch_product_listing when configured. Reuse canonical selected-variant URLs returned by the listing tool. Search snippets are leads, not verified prices or specifications. Resolve conflicting URL/title/storage identities explicitly. Related-product carousels do not prove the main listing's identity. Separate regular prices from education pricing, conditional bank offers, historical launch prices and unavailable listings. Never calculate selling price from MRP and discount percentage.
Reserve calls for exact listing extraction across all compared families before reading reviews. Then retrieve attributable Amazon/Flipkart customer review bodies, independent reviews and owner feedback, recording missing or pooled-variant reviews honestly. For follow-up, use supplied gaps and previous evidence; do not repeat identical failed calls or already completed discovery. Built-in Google Search is a FINAL RESORT only after all configured external discovery APIs fail to return usable leads. Report unresolved facts rather than fill them from training knowledge. No ranking or recommendations.`;

// The same retrieval-only ADK adapter exercised by the local harness. Durable
// worker hooks remain authoritative for every generation and provider dispatch.
export async function retrieveDirectedEvidence(request:ProviderRequest,signal:AbortSignal,options:ToolAgentOptions={}):Promise<ProviderAnswer>{
  const remaining=Number(request.input.retrievalAllowance);
  const maxToolCalls=Number.isSafeInteger(remaining)?Math.max(1,Math.min(24,remaining)):24;
  const answer=await researchToolAgentRequest({...request,instructions:`${request.instructions}\n${DIRECTED_RETRIEVAL_INSTRUCTIONS}`},signal,{
    ...options,retrievalOnly:true,maxSteps:RETRIEVAL_HARNESS.modelTurns,maxToolCalls,
    maxOutputTokens:RETRIEVAL_HARNESS.outputTokens,
    allowedTools:['search_web_firecrawl','search_web_tavily','search_products_india','read_source_firecrawl','read_source_tavily','fetch_product_listing','read_source_page','google_search'],
    beforeModelCall:request.beforeModelCall,beforeToolCall:request.beforeToolCall,onModelUsage:request.onModelUsage,
  });
  // No additional summary generation. Assessment receives actual, provenance-
  // preserving receipts/snapshots, never a retrieval-model recommendation.
  return {...answer,text:JSON.stringify({retrievalMode:'gemini-directed',inventory:answer.diagnostics.observations.map(({provider,title,url,exactId,kind,offer})=>({provider,title,url,exactId,kind,offer})),gaps:answer.diagnostics.limitations})};
}
