// Shared by the local live harness and the production retrieval adapter.
export const RETRIEVAL_HARNESS = {
  modelTurns:24,
  toolCalls:24,
  outputTokens:65536,
  jobModelCalls:64,
  jobInputTokens:8000000,
  jobOutputTokens:4194304,
} as const;
