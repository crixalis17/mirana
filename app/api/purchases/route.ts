import {db,body,brief,alerts,fail,readWorkspace} from '@/lib/store';
import {nextCheck} from '@/lib/deals';
import {requireUser} from '@/lib/auth';
import {cancelResearchJob,getResearchJob,retryResearchJob} from '@/lib/research-jobs';
export async function POST(request:Request){
  try{
    const u=await requireUser(request),data=await body(request),w=await readWorkspace(u.id);
    const b={...brief(data,w.settings.profile),briefRevision:1},id=crypto.randomUUID();
    await db().prepare('INSERT INTO purchases (id,user_id,brief,status,updated_at) VALUES (?,?,?,?,?)')
      .bind(id,u.id,JSON.stringify(b),'queued',new Date().toISOString()).run();
    return Response.json({...b,id,status:'queued',report:null},{status:201});
  }catch(e){return fail(e);}
}
export async function PATCH(request:Request){
  try{
    const u=await requireUser(request),d=await body(request);
    if(typeof d.id!=='string')throw new Error('Missing purchase.');
    const old=await db().prepare('SELECT * FROM purchases WHERE id=? AND user_id=?').bind(d.id,u.id).first() as any;
    if(!old)return Response.json({error:'Purchase not found.'},{status:404});
    let b=JSON.parse(old.brief),status=old.status,report=old.report;
    const revision=Number.isSafeInteger(b.briefRevision)?b.briefRevision:0;
    let resumeSavedJob=false;
    if(['pause','resume','bought'].includes(d.action)){
      status=d.action==='pause'?'paused':d.action==='bought'?'bought':'queued';
      if(d.action==='bought')b.alerts={...b.alerts,enabled:false};
      if(d.action==='resume'){
        const job=await getResearchJob(d.id,u.id);
        if(job?.status==='completed'){b.briefRevision=revision+1;delete b.retryAt;delete b.researchError;}
        else resumeSavedJob=!!job&&['cancelled','failed','retry_pending'].includes(job.status);
      }
    }else if(d.action==='edit'){
      const w=await readWorkspace(u.id);
      b={...brief(d.brief,w.settings.profile,b),briefRevision:revision+1};status='queued';report=null;
    }else if(d.action==='alerts'){
      b.alerts=alerts(d.alerts);
      if(old.status==='bought'&&b.alerts.enabled)throw new Error('Reopen this item before enabling deal alerts.');
      if(b.alerts.enabled){const now=new Date().toISOString(),last=old.report?JSON.parse(old.report).checkedAt:now;
        b.nextCheckAt=nextCheck(b.alerts,last);if(Date.parse(b.nextCheckAt)<Date.now())b.nextCheckAt=now;}
    }else throw new Error('Unknown action.');
    const saved=await db().prepare('UPDATE purchases SET brief=?,report=?,status=?,updated_at=? WHERE id=? AND user_id=? AND updated_at=?')
      .bind(JSON.stringify(b),report,status,new Date().toISOString(),d.id,u.id,old.updated_at).run();
    if(saved.meta.changes!==1)return Response.json({error:'This item changed. Reload before saving.'},{status:409});
    if(['pause','bought','edit'].includes(d.action))await cancelResearchJob(d.id,u.id);
    if(resumeSavedJob){try{await retryResearchJob(d.id,u.id);}catch{/* Preserve a reached budget; editing the brief creates a new bounded job. */}}
    return Response.json({ok:true});
  }catch(e){return fail(e);}
}
