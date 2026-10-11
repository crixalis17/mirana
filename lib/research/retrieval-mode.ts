export type RetrievalMode = 'controlled' | 'agent' | 'gemini-directed';

export function researchRetrievalMode(env:Record<string,string|undefined>=process.env):RetrievalMode {
  const mode=env.RESEARCH_RETRIEVAL_MODE||'controlled';
  if(mode==='controlled'||mode==='agent'||mode==='gemini-directed')return mode;
  throw new Error('Invalid research retrieval mode.');
}
