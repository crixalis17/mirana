type Env = Record<string, string | undefined>;

// Production activation is explicit. Authentication, fixed tool endpoints,
// per-job budgets and evidence verification remain enforced independently.
export function researchRuntimeAllowed(env: Env = process.env) {
  return typeof window === 'undefined' &&
    (!(env.NODE_ENV === 'production' || env.VERCEL) || env.RESEARCH_PRODUCTION_ENABLED === 'true');
}
