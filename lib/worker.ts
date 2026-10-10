import { acquireLease, releaseLease, getResearchQueue, saveResearchResult, setSchedule, AutomationError } from './automation';
import { db } from './store';
import { researchProviderConfigured, runResearchStage, refreshSavedOffers } from './research';
import { ensureResearchJob, listRunnableResearchJobs, claimResearchJob, assertResearchJobCurrent, reserveResearchCall,
  completeResearchStep, finishResearchJob, failResearchJob, releaseResearchJob, checkResearchInputBudget, checkResearchModelBudget, reserveResearchToolCall, finalizeResearchFromSavedAssessment, ResearchJobError } from './research-jobs';
import type { ProviderRequest } from './research/provider';
import {recordResearchUsage} from './research-jobs';
import {stageOutputTokens,finalOutputReserve} from './research/output-budget';
import { logResearchEvent, safeResearchErrorCode } from './research/logs';
export { cronAuthorized } from './research/cron-auth';
export const workerConfigured = researchProviderConfigured;
const billableStages = new Set(['plan', 'gather', 'assess', 'followup', 'synthesize']);
type StageRunner = typeof runResearchStage;
type JobOptions = { deadline?: number; maxSteps?: number };
function stepTimeout() { return Math.max(10000, Math.min(180000, Number(process.env.RESEARCH_STEP_TIMEOUT_MS) || 120000)); }

// HTTP callers cannot replace the stage runner; injection supports isolated worker tests.
export async function runResearchJob(jobId: string, options: JobOptions = {}, runner: StageRunner = runResearchStage) {
  const claimed = await claimResearchJob(jobId);
  if (!claimed) {logResearchEvent({jobId,event:'lease',errorCode:'lease_lost'});return { status: 'busy', steps: 0 };}
  const token = claimed.token;
  let job = claimed.job, steps = 0;
  const deadline = options.deadline || Date.now() + 200000;
  try {
    while (steps < (options.maxSteps ?? 12)) {
      job = await assertResearchJobCurrent(jobId, token);
      const remainingSteps=job.stage==='followup'?3:job.stage==='assess'?2:0;
      const remainingOutput=stageOutputTokens('assess')+finalOutputReserve()+(job.stage==='followup'?6000:0);
      if(remainingSteps&&job.outputs.assess&&(job.attemptedCalls+remainingSteps>job.limits.maxCalls||job.outputTokens+remainingOutput>job.limits.maxOutputTokens)){
        job=await finalizeResearchFromSavedAssessment(jobId,token);
        logResearchEvent({jobId,event:'lease',stage:'synthesize',attempt:job.attemptedCalls,errorCode:'BUDGET_EXHAUSTED'});
      }
      const stage = job.stage;
      if (stage === 'publish') {
        const started = Date.now();
        logResearchEvent({jobId,event:'started',stage,attempt:job.attemptedCalls});
        const result = job.outputs.verify;
        if (!result?.report) throw new Error('No research output is available.');
        const row = await db().prepare('SELECT updated_at FROM purchases WHERE id=? AND user_id=?')
          .bind(job.purchaseId, job.userId).first();
        if (!row) throw new Error('Shopping item no longer exists.');
        await saveResearchResult({ ...result, purchaseId: job.purchaseId, expectedUpdatedAt: row.updated_at,
          preserveBrief: true, researchJobId: job.id, researchLeaseToken: token });
        await finishResearchJob(jobId, token);
        logResearchEvent({jobId,event:'publish',stage,elapsedMs:Date.now()-started,candidateCount:result.report.products?.length||0});
        return { status: 'completed', steps };
      }
      const billable = billableStages.has(stage);
      if (Date.now() + (billable ? stepTimeout() + 10000 : 50000) > deadline) break;
      const observations = await db().prepare('SELECT payload FROM observations WHERE purchase_id=?').bind(job.purchaseId).all();
      let firstGeneration=true,pendingOutputTokens=0,stageInputEstimate=0,usageRecorded=false;
      const input = { purchase: job.purchase, outputs: job.outputs, referenceDate: job.referenceDate,
        history: observations.results.map(row => JSON.parse(String(row.payload))).slice(-40),
        beforeProvider:async(request:ProviderRequest)=>{job=await checkResearchInputBudget(jobId,token,
          Buffer.byteLength(JSON.stringify(request.input))+Buffer.byteLength(request.instructions)+6000);},
        beforeModelCall:async(inputBytes:number,maxOutputTokens:number)=>{
          if(!billable||!Number.isSafeInteger(inputBytes)||inputBytes<0||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<=0)throw new Error('Invalid research generation budget.');
          // Bytes conservatively bound tokens, including returned tool observations.
          const estimate=stageInputEstimate+inputBytes;
          const reserveCalls=stage==='gather'||stage==='followup'?2:stage==='synthesize'?0:1;
          const request={inputTokens:estimate,maxOutputTokens,pendingOutputTokens,reserveCalls,reserveOutputTokens:stage==='synthesize'?0:finalOutputReserve()};
          job=firstGeneration?await checkResearchModelBudget(jobId,token,request):await reserveResearchCall(jobId,token,request);
          firstGeneration=false;stageInputEstimate=estimate;pendingOutputTokens+=maxOutputTokens;
          logResearchEvent({jobId,event:'model-call',stage,attempt:job.attemptedCalls,inputBytes,maxOutputTokens});
        },
        onModelUsage:async(usage:NonNullable<Awaited<ReturnType<StageRunner>>['usage']>)=>{
          job=await recordResearchUsage(jobId,token,{inputTokens:usage.inputTokens,outputTokens:usage.outputTokens+usage.thinkingTokens});
          usageRecorded=true;pendingOutputTokens=0;stageInputEstimate=0;
          logResearchEvent({jobId,event:'model-usage',stage,attempt:job.attemptedCalls,...usage});
        },
        beforeToolCall:async(provider:string,tool:string)=>{
          job=await reserveResearchToolCall(jobId,token);
          logResearchEvent({jobId,event:'tool-call',stage,attemptedToolCalls:job.attemptedToolCalls,maxToolCalls:job.limits.maxToolCalls,toolProvider:provider,tool});
        } };
      if (billable) {
        // Conservative estimate: provider search context is separately metered, so this is not an invoice ceiling.
        job = await reserveResearchCall(jobId, token, { maxOutputTokens: stageOutputTokens(stage) });
      }
      const started = Date.now();
      logResearchEvent({jobId,event:'started',stage,attempt:job.attemptedCalls,round:job.rounds,maxCalls:job.limits.maxCalls,maxRounds:job.limits.maxRounds});
      const result = await runner(stage, input, AbortSignal.timeout(Math.min(stepTimeout(), Math.max(1000, deadline - Date.now() - 5000))));
      await assertResearchJobCurrent(jobId, token);
      let next = result.nextStage;
      if (!next) throw new Error('Research stage returned no continuation.');
      const outputUsage=result.usage?(result.usage.outputTokens+(result.usage.thinkingTokens||0)):0;
      if (next === 'followup' && (job.rounds >= job.limits.maxRounds || job.attemptedCalls + 3 > job.limits.maxCalls ||
        job.outputTokens+(usageRecorded?0:outputUsage)+6000+stageOutputTokens('assess')+finalOutputReserve()>job.limits.maxOutputTokens)) {
        next = 'synthesize';
        result.output.gaps=[...new Set([...(result.output.gaps||[]),'Follow-up limits reached; remaining gaps are carried into the final report.'])];
      }
      job = await completeResearchStep(jobId, token, stage, result.output, next, undefined, result.usage && !usageRecorded ? {
        inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens + (result.usage.thinkingTokens || 0),
      } : {});
      logResearchEvent({jobId,event:'completed',stage,elapsedMs:Date.now()-started,attempt:job.attemptedCalls,
        sourceCount:result.output.sources?.length,gapCount:result.output.gaps?.length,candidateCount:result.output.report?.products?.length,
        ...(result.usage||{})});
      steps++;
    }
    await releaseResearchJob(jobId, token);
    logResearchEvent({jobId,event:'lease',stage:job.stage,attempt:job.attemptedCalls});
    return { status: 'pending', steps };
  } catch (error) {
    logResearchEvent({jobId,event:'failed',stage:job.stage,attempt:job.attemptedCalls,errorCode:safeResearchErrorCode(error),
      retryable:!!(error&&typeof error==='object'&&'retryable' in error&&error.retryable===true)});
    if ((error instanceof ResearchJobError && ['lease_lost', 'cancelled', 'superseded'].includes(error.code)) ||
      (error instanceof AutomationError && error.status === 409)) return { status: 'superseded', steps };
    const retryable = !!(error && typeof error === 'object' && 'retryable' in error && error.retryable === true);
    try { await failResearchJob(jobId, token, 'Research could not finish. Saved evidence is preserved.', {
      retryable, retryAt: retryable ? new Date(Date.now() + 60000).toISOString() : undefined,
    }); } catch { /* Cancellation, edits and lease loss must not acquire a stale error. */ }
    return { status: retryable ? 'retry_pending' : 'failed', steps };
  }
}

export async function runWorker(options: { purchaseId?: string; userId?: string } = {}) {
  const configured = workerConfigured();
  const count = Math.max(1, Math.min(2, Number(process.env.RESEARCH_MAX_JOBS) || 1));
  const deadline = Date.now() + 200000;
  let processed = 0, failed = 0, pending = 0;
  const { queue, observations } = await getResearchQueue({ ...options, limit: 20 });
  if (configured) for (const purchase of queue.filter(p => p.status === 'queued')) await ensureResearchJob(purchase.id, purchase.userId);
  const jobs = configured ? await listRunnableResearchJobs({ ...options, limit: count }) : [];
  for (const job of jobs) {
    const result = await runResearchJob(job.id, { deadline });
    if (result.status === 'completed') processed++;
    else if (['failed', 'retry_pending'].includes(result.status)) failed++;
    else if (result.status === 'pending') pending++;
    if (Date.now() > deadline - 50000) break;
  }
  // Due watches revisit saved variants; broad discovery is only for queued briefs.
  for (const purchase of queue.filter(p => p.status === 'ready' && p.alerts?.enabled)) {
    if (processed >= count || Date.now() > deadline - 50000) break;
    const name = `mirana-deal-check:${purchase.id}`, token = await acquireLease(name, 240000);
    if (!token) continue;
    try {
      const result = await refreshSavedOffers(purchase, observations.filter(o => o.purchaseId === purchase.id),
        AbortSignal.timeout(Math.max(1000, deadline - Date.now() - 5000)));
      await saveResearchResult({ purchaseId: purchase.id, expectedUpdatedAt: purchase.updatedAt, preserveBrief: true, ...result });
      processed++;
    } catch (error) { if (!(error instanceof AutomationError && error.status === 409)) failed++; }
    finally { await releaseLease(name, token); }
  }
  if (!options.purchaseId) await setSchedule(failed ? 'error' : 'active', new Date().toISOString());
  return { status: failed ? 'retry_pending' : pending ? 'pending' : !configured && queue.some(p => p.status === 'queued') ? 'setup_required' : 'complete', processed, failed, pending };
}
