// Read-only comparison of saved local studies. No credential loading or provider calls.
import {readFileSync,writeFileSync,chmodSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),model='gemini-3.8-flash';
const baselinePath=resolve(root,'outputs/gemini-benchmark-2026-10-08/results.json');
const highPath=resolve(root,'outputs/gemini-benchmark-high-max-2026-10-08/results.json');
const baselineRaw=readFileSync(baselinePath),baseline=JSON.parse(baselineRaw),high=JSON.parse(readFileSync(highPath));
if(high.runs.some(run=>run.model!==model)||high.config?.researchThinking!=='HIGH'||high.config?.extractionThinking!=='HIGH'||high.config?.maxOutputTokens!==65536||high.config?.timeoutMs!==null)throw new Error('Unexpected high-thinking study configuration.');
const knownBaselineHash='5f2260713e56f38ae0cc95b9e252b39be992dd3c28999ab59bfbc1a2a4190108';
if(createHash('sha256').update(baselineRaw).digest('hex')!==knownBaselineHash)throw new Error('Saved baseline changed; refusing a misleading comparison.');
const cases=['tablet','laptop','air-purifier','tablet-repeat'];
function stats(study,caseId){
 const run=study.runs.find(run=>run.model===model&&run.caseId===caseId);
 if(!run)return {status:'not_started'};
 const calls=study.requests.filter(call=>call.runId===run.id);
 const returned=calls.filter(call=>call.usage&&typeof call.usage.promptTokenCount==='number');
 const sum=key=>returned.reduce((n,call)=>n+(call.usage[key]||0),0);
 return {status:run.status,attempts:calls.length,elapsedSeconds:Math.round(calls.reduce((n,call)=>n+(call.elapsedMs||0),0)/1000),
   inputTokens:sum('promptTokenCount'),visibleOutputTokens:sum('candidatesTokenCount'),thinkingTokens:sum('thoughtsTokenCount'),
   missingUsageAttempts:calls.length-returned.length,knownEstimatedUsd:Number(calls.reduce((n,call)=>n+(call.cost?.usd||0),0).toFixed(6)),
   uniqueSearchQueries:run.research?new Set(run.research.queries).size:null,sourceCount:run.resolvedSources?.length??null,
   candidateCount:run.metrics?.candidatesRetained??null,unknownSourceUrls:run.metrics?.unknownSourceUrls??null,
   schemaValid:run.metrics?.schemaValid??null,researchFinishReason:run.research?.finishReason??null,extractionFinishReason:run.extractionFinishReason??null};
}
const rows=cases.map(caseId=>({caseId,baseline:stats(baseline,caseId),high:stats(high,caseId)}));
const aggregate=side=>({completed:rows.filter(row=>row[side].status==='completed').length,totalCases:cases.length,
 attemptedRequests:rows.reduce((n,row)=>n+(row[side].attempts||0),0),
 returnedInputTokens:rows.reduce((n,row)=>n+(row[side].inputTokens||0),0),
 returnedVisibleOutputTokens:rows.reduce((n,row)=>n+(row[side].visibleOutputTokens||0),0),
 returnedThinkingTokens:rows.reduce((n,row)=>n+(row[side].thinkingTokens||0),0),
 unknownUsageAttempts:rows.reduce((n,row)=>n+(row[side].missingUsageAttempts||0),0),
 knownEstimatedUsd:Number(rows.reduce((n,row)=>n+(row[side].knownEstimatedUsd||0),0).toFixed(6))});
const caveats=[
 'Historical comparison changes thinking, output allowance and application deadline; improvement cannot be attributed to thinking alone.',
 'The same four briefs and legacy two-stage search/extraction procedure are used; live search results are not frozen.',
 'Baseline prompts were not snapshotted, so byte-identical historical prompts cannot be independently proven. Current prompt/schema hashes are saved in the high study.',
 'This evaluates the earlier two-stage benchmark, not the current durable original-page-reader and claim-ledger workflow.',
 'Grounding URLs and schema/candidate counts do not establish claim truth, reviews, complete kit costs, checkout or a qualifying deal.',
 'Thinking tokens and search are billable. List-price estimates are not invoices or verified promotional-credit deductions; missing usage is unknown, not free.',
 'One earlier superseded HIGH request was interrupted after user settings changed; its usage is unknown and excluded from the new-study totals.'
];
const comparison={model,baselineHash:knownBaselineHash,updatedAt:new Date().toISOString(),configuration:{baseline:{researchThinking:'MEDIUM',extractionThinking:'LOW',maxOutputTokens:6000,timeoutMs:90000},high:high.config},aggregate:{baseline:aggregate('baseline'),high:aggregate('high')},rows,caveats};
comparison.transportRetries=cases.flatMap(caseId=>{
 const path=resolve(root,`outputs/gemini-benchmark-high-transport-retry-${caseId}-2026-10-08/results.json`);
 if(!existsSync(path))return [];
 const study=JSON.parse(readFileSync(path));
 if(study.experiment!=='high-thinking-transport-retry'||study.config?.transport!=='native-https'||study.config?.models?.join(',')!==model||study.config?.researchThinking!=='HIGH'||study.config?.extractionThinking!=='HIGH'||study.config?.maxOutputTokens!==65536||study.config?.timeoutMs!==null||study.config?.researchInstructionsHash!==high.config?.researchInstructionsHash||study.config?.schemaHash!==high.config?.schemaHash||study.runs.some(run=>run.caseId!==caseId||run.model!==model))throw new Error('Unexpected transport retry configuration.');
 return [{caseId,...stats(study,caseId)}];
});
const retrySum=key=>comparison.transportRetries.reduce((n,retry)=>n+(retry[key]||0),0);
comparison.aggregate.highIncludingTransportRetries={
 completed:rows.filter(row=>row.high.status==='completed'||comparison.transportRetries.some(retry=>retry.caseId===row.caseId&&retry.status==='completed')).length,
 totalCases:cases.length,
 attemptedRequests:comparison.aggregate.high.attemptedRequests+retrySum('attempts'),
 returnedInputTokens:comparison.aggregate.high.returnedInputTokens+retrySum('inputTokens'),
 returnedVisibleOutputTokens:comparison.aggregate.high.returnedVisibleOutputTokens+retrySum('visibleOutputTokens'),
 returnedThinkingTokens:comparison.aggregate.high.returnedThinkingTokens+retrySum('thinkingTokens'),
 unknownUsageAttempts:comparison.aggregate.high.unknownUsageAttempts+retrySum('missingUsageAttempts'),
 knownEstimatedUsd:Number((comparison.aggregate.high.knownEstimatedUsd+retrySum('knownEstimatedUsd')).toFixed(6)),
};
const output=resolve(root,'outputs/gemini-benchmark-high-max-2026-10-08/comparison.json');
writeFileSync(output,JSON.stringify(comparison,null,2)+'\n',{mode:0o600});chmodSync(output,0o600);
const format=row=>`| ${row.caseId} | ${row.baseline.status} / ${row.high.status} | ${row.baseline.elapsedSeconds??'—'} / ${row.high.elapsedSeconds??'—'} | ${row.baseline.thinkingTokens??'—'} / ${row.high.thinkingTokens??'—'} | ${row.baseline.candidateCount??'—'} / ${row.high.candidateCount??'—'} | ${row.baseline.unknownSourceUrls??'—'} / ${row.high.unknownSourceUrls??'—'} |`;
const markdown=`# Gemini 3.8 Flash: historical versus HIGH\n\nSame tablet, laptop, air-purifier and repeated-tablet briefs. No production changes or emails.\n\nOld configuration: MEDIUM research / LOW extraction, 6000 output tokens, 90s request deadline. New: HIGH / HIGH, 65536 output tokens (model maximum), no application request deadline.\n\nValues below are old / HIGH.\n\n| Case | Completion | Seconds | Returned thinking tokens | Retained candidates | Unknown source URLs |\n|---|---|---:|---:|---:|---:|\n${rows.map(format).join('\n')}\n\nOld completed: ${comparison.aggregate.baseline.completed}/4. HIGH completed: ${comparison.aggregate.high.completed}/4.\n\nKnown list-price estimate: old $${comparison.aggregate.baseline.knownEstimatedUsd.toFixed(4)} plus unknown usage for ${comparison.aggregate.baseline.unknownUsageAttempts} calls; HIGH $${comparison.aggregate.high.knownEstimatedUsd.toFixed(4)} plus unknown usage for ${comparison.aggregate.high.unknownUsageAttempts} calls.\n\n${caveats.map(caveat=>'- '+caveat).join('\n')}\n\nIndependent qualitative audit belongs alongside these mechanical results; no automatic accuracy or winner score is assigned.\n`;
const retryMarkdown=comparison.transportRetries.length?`\n## Separate transport retries\n\nOriginal failures remain in the table above. Retried generation uses native HTTPS without a socket/header deadline; prompts, model and thinking/output settings remain HIGH/HIGH and 65536. No automatic retries.\n\n| Case | Retry status | Seconds | Thinking tokens | Known estimated USD | Missing usage calls |\n|---|---|---:|---:|---:|---:|\n${comparison.transportRetries.map(retry=>`| ${retry.caseId} | ${retry.status} | ${retry.elapsedSeconds} | ${retry.thinkingTokens} | $${retry.knownEstimatedUsd.toFixed(4)} | ${retry.missingUsageAttempts} |`).join('\n')}\n\nCases completed including explicit transport retries: ${comparison.aggregate.highIncludingTransportRetries.completed}/4. All HIGH attempts' known estimate: $${comparison.aggregate.highIncludingTransportRetries.knownEstimatedUsd.toFixed(4)} plus unknown usage for ${comparison.aggregate.highIncludingTransportRetries.unknownUsageAttempts} calls; the superseded earlier attempt remains separate.\n`:'';
writeFileSync(output.replace('.json','.md'),markdown+retryMarkdown,{mode:0o600});
console.log(JSON.stringify({comparisonFile:output,aggregate:comparison.aggregate,rows:rows.map(row=>({case:row.caseId,baseline:row.baseline.status,high:row.high.status}))},null,2));
