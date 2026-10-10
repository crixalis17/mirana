import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

// A fixed isolated run persists its request budget across invocations. Never remove its database to retry.
const root=fileURLToPath(new URL('../',import.meta.url));
const contract=process.argv.includes('--contract'),enhanced=contract||process.argv.includes('--enhanced'),maxCalls=enhanced?8:4;
const directory=join(root,'outputs',contract?'research-live-smoke-v3-2026-10-08':enhanced?'research-live-smoke-v2-2026-10-08':'research-live-smoke-2026-10-08');
const dbFile=join(directory,'smoke.db');
const userId='isolated-smoke-owner',purchaseId='isolated-tablet-smoke';
const live=process.argv.includes('--live'),retry=process.argv.includes('--retry');
const allowed=new Set(['--live','--retry','--enhanced','--contract']);
if(process.argv.slice(2).some(arg=>!allowed.has(arg))||retry&&!live){console.error('Usage: node --experimental-transform-types scripts/research-live-smoke.mjs [--enhanced | --contract] [--live [--retry]]');process.exitCode=1;}
else if(!live) {
  console.log(JSON.stringify({mode:'dry-run',provider:'vertex',maxCalls,maxRounds:2,maxWorkerInvocations:4,
    request:'New 10–11 inch tablet, notes/PDFs/sketching/art, INR 60000 including pressure stylus, top 3, postcode 600019; SBI eligibility unspecified.',
    alerts:false,email:false,productionWrites:false,savedBudget:'Repeated live invocations reuse the same isolated database and job. Failed jobs require explicit --live --retry; the saved request cap is retained.',
    run:`node --experimental-transform-types scripts/research-live-smoke.mjs ${contract?'--contract ':enhanced?'--enhanced ':''}--live`,output:directory},null,2));
} else {
  let client;
  try {
    // Read credentials locally; they remain confined to server transport and are never logged.
    const envFile=join(root,'.env.local');if(existsSync(envFile))process.loadEnvFile(envFile);
    if(!process.env.GOOGLE_API_KEY||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(process.env.GOOGLE_CLOUD_PROJECT||''))throw new Error('credential-setup');
    const unrelated=['TURSO_AUTH_TOKEN','OPENAI_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','RESEND_API_KEY','EMAIL_FROM','OFFER_VERIFIER_URL','OFFER_VERIFIER_TOKEN','OFFER_VERIFIER_SIGNING_SECRET','CRON_SECRET','AUTH_PREVIEW_MODE','MIRANA_DEMO_MODE'];
    for(const key of unrelated)delete process.env[key];
    process.env.NODE_ENV='test';process.env.RESEARCH_PROVIDER='vertex';process.env.GOOGLE_GENAI_USE_VERTEXAI='true';
    process.env.GEMINI_RESEARCH_MODEL=process.env.GEMINI_RESEARCH_MODEL||'gemini-3.8-flash';
    process.env.RESEARCH_MAX_CALLS=String(maxCalls);process.env.RESEARCH_MAX_ROUNDS='2';process.env.RESEARCH_MAX_INPUT_TOKENS=enhanced?'200000':'100000';process.env.RESEARCH_MAX_OUTPUT_TOKENS='24000';
    process.env.RESEARCH_STEP_TIMEOUT_MS=enhanced?'150000':'90000';
    await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
    process.env.TURSO_DATABASE_URL=`file:${dbFile}`;
    registerHooks({resolve(specifier,context,next){
      if(specifier.startsWith('@/'))return next(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
      try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}
    }});
    const {databaseClient}=await import('../lib/database.ts');client=databaseClient();
    const ddl=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');await client.batch(ddl.split(';').map(sql=>sql.trim()).filter(Boolean),'write');await chmod(dbFile,0o600);
    const brief={briefRevision:1,title:'Isolated tablet smoke test',requestText:'I need a compact 10–11 inch new tablet for handwritten work/study notes, PDF annotation, casual sketches and detailed artwork. Smooth and fast, good pressure-sensitive stylus and palm rejection, useful note-taking and sketching apps. Maximum INR 60000 including all required stylus/adapters/accessories. Recommend the top 3 and explain #1, drawing and PDF tradeoffs, independent reviews and owner feedback. Start with official stores, Amazon India and Flipkart. SBI bank card is available but credit/debit/EMI eligibility is unspecified. No refurbished products.',
      usage:'Handwritten notes, PDFs, casual sketches and detailed artwork',productUrl:'',category:'Tablet',budget:60000,topN:3,size:'10–11 inches',condition:'New only',country:'India',currency:'INR',postcode:'600019',banks:'SBI (card eligibility unspecified)',priorities:['Performance','Value for money'],customTags:['Compact 10–11 inches','Pressure-sensitive stylus','Palm rejection'],alerts:{enabled:false,mode:'interval',intervalHours:24,rule:'history',targetPrice:null},parsed:null};
    await client.execute({sql:'INSERT OR IGNORE INTO workspace (id,settings) VALUES (?,?)',args:[userId,JSON.stringify({profile:{postcode:'600019',priorities:brief.priorities,customTags:brief.customTags},schedule:'pending'})]});
    await client.execute({sql:'INSERT OR IGNORE INTO purchases (id,user_id,brief,status,updated_at) VALUES (?,?,?,?,?)',args:[purchaseId,userId,JSON.stringify(brief),'queued',new Date().toISOString()]});
    const {ensureResearchJob,getResearchJob,retryResearchJob}=await import('../lib/research-jobs.ts');
    const {runResearchJob}=await import('../lib/worker.ts');
    const {runResearchStage}=await import('../lib/research.ts');
    const job=await ensureResearchJob(purchaseId,userId);
    if(job.limits.maxCalls!==maxCalls||job.limits.maxRounds!==2)throw new Error('saved-budget-mismatch');
    if(retry&&['failed','retry_pending','cancelled'].includes(job.status))await retryResearchJob(purchaseId,userId);
    async function summary() {
      const safe=await getResearchJob(purchaseId,userId);
      const row=(await client.execute({sql:'SELECT report FROM purchases WHERE id=? AND user_id=?',args:[purchaseId,userId]})).rows[0];
      const report=row?.report?JSON.parse(String(row.report)):null;
      const info={status:safe?.status||'unavailable',stage:safe?.stage||null,attemptedCalls:safe?.limits.attemptedCalls||0,maxCalls,
        products:Array.isArray(report?.products)?report.products.length:0,gaps:Array.isArray(report?.researchGaps)?report.researchGaps.length:safe?.coverage.gapCount||0};
      await writeFile(join(directory,'report.json'),JSON.stringify(info,null,2)+'\n',{mode:0o600});await chmod(join(directory,'report.json'),0o600);
      await writeFile(join(directory,'report.md'),`Isolated live Vertex smoke test${enhanced?' with independent sources and claim ledger':''}\n\nStatus: ${info.status}\nStage: ${info.stage}\nCalls attempted: ${info.attemptedCalls}/${maxCalls}\nProducts: ${info.products}\nEvidence gaps: ${info.gaps}\n\nBudget and saved stages persist in smoke.db. No alerts, email or production writes are enabled. API usage may be billable; promotional-credit eligibility is not verified.\n`,{mode:0o600});await chmod(join(directory,'report.md'),0o600);
      return info;
    }
    const runner=async(stage,context,signal)=>{
      const result=await runResearchStage(stage,context,signal);
      console.log(JSON.stringify({stage,status:'completed'}));
      return result;
    };
    // Terminal failures are never silently retried. Pending work resumes in up to four bounded worker invocations.
    for(let invocation=0;invocation<4;invocation++) {
      const before=await getResearchJob(purchaseId,userId);
      if(!before||['completed','failed','retry_pending','cancelled','superseded'].includes(before.status))break;
      const result=await runResearchJob(job.id,{deadline:Date.now()+200000},runner);
      console.log(JSON.stringify(await summary()));
      if(result.status!=='pending')break;
    }
    const final=await summary();console.log(JSON.stringify(final));
    if(!['completed','queued','running'].includes(final.status))process.exitCode=2;
  } catch {
    // Intentionally do not echo provider errors, credential values, project identifiers or response bodies.
    console.error('Live smoke test could not proceed. Check local Vertex credentials, the saved request cap, and the isolated schema. Existing database and artifacts are preserved.');process.exitCode=1;
  } finally {
    client?.close();
    for(const suffix of ['','-wal','-shm'])if(existsSync(`${dbFile}${suffix}`))await chmod(`${dbFile}${suffix}`,0o600);
  }
}
