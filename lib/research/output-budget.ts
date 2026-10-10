// HIGH thinking and the evidence ledger share the provider's output allowance.
// Reserve enough for both assessment and the final report before discovery.
export const EVIDENCE_OUTPUT_TOKENS = 16_384;
export function stageOutputTokens(stage:string,env:NodeJS.ProcessEnv=process.env){
  return env.RESEARCH_TOOLS_ENABLED==='true' && ['assess','synthesize'].includes(stage) ? EVIDENCE_OUTPUT_TOKENS : 6000;
}
export function finalOutputReserve(env:NodeJS.ProcessEnv=process.env){
  return env.RESEARCH_TOOLS_ENABLED==='true' ? EVIDENCE_OUTPUT_TOKENS : 6000;
}
