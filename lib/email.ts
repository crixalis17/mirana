import {config,emailReady} from './auth';
import {db} from './store';
import {qualifies} from './deals';

async function currentPurchase(id:string,checkedAt:string){
  const row=await db().prepare('SELECT brief,status,report FROM purchases WHERE id=?').bind(id).first() as any;
  if(!row||row.status!=='ready'||!row.report||JSON.parse(row.report).checkedAt!==checkedAt)return null;
  const brief=JSON.parse(row.brief);
  return brief.alerts?.enabled?{...brief,id}:null;
}

const notificationId=(p:any,o:any)=>`${p.id}|${o.productId}|${o.retailer}|${o.total}|${p.alerts.rule}|${p.alerts.targetPrice||''}`;

/**
 * Failed deliveries do not roll back a completed research write. A later due
 * research pass retries a still-qualifying offer with the same notification ID
 * and Resend idempotency key. Only sent notifications suppress that retry;
 * withdrawn consent or an offer that no longer qualifies is never retried.
 */
export async function sendDeal(p:any,report:any,history:any[],email:string|null){
  let latest=await currentPurchase(p.id,report.checkedAt);
  if(!latest)return {state:'disabled'};
  const matches=report.products.flatMap((product:any)=>product.offers.map((o:any)=>({...o,productId:product.id,variant:product.variant,name:product.name})))
    .filter((o:any)=>qualifies(o,history,latest.budget,latest.alerts).qualified);
  if(!matches.length)return {state:'no_offer'};
  if(!email||!emailReady())return {state:'setup_required',offers:matches.length};
  const results:string[]=[];
  for(const o of matches){
    latest=await currentPurchase(p.id,report.checkedAt);
    if(!latest||!qualifies(o,history,latest.budget,latest.alerts).qualified)continue;
    const id=notificationId(latest,o);
    const previous=await db().prepare('SELECT status FROM notifications WHERE id=?').bind(id).first() as any;
    if(previous?.status==='sent'){results.push('already_sent');continue;}
    const message={
      from:config().EMAIL_FROM,to:[email],subject:`Mirana: ${o.name} at ₹${o.total.toLocaleString('en-IN')}`,
      text:`A verified offer matches your ${latest.alerts.rule==='target'?'target price':'price-history rule'}.\n\n${o.name}\nFull cost: ₹${o.total}\nStore: ${o.retailer}\nChecked: ${o.checkedAt}\n${o.url}\n\nPrices and eligibility can change. Confirm the exact model and total at checkout.\nManage alerts: ${config().APP_ORIGIN||''}`,
    };
    const notice={to:email,product:o.name,total:o.total,url:o.url,message};
    await db().prepare('INSERT OR IGNORE INTO notifications (id,purchase_id,payload,status,created_at) VALUES (?,?,?,?,?)')
      .bind(id,p.id,JSON.stringify(notice),'pending',new Date().toISOString()).run();
    // Reuse the original provider payload too: an idempotency key cannot be
    // reused with a different checkedAt/body on a later retry.
    const saved=await db().prepare('SELECT payload FROM notifications WHERE id=?').bind(id).first() as any;
    const savedMessage=saved?JSON.parse(saved.payload).message:null;
    const idem=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id))))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    // Check consent and the current rule immediately before handing off to the
    // provider. Changes after this read cannot retract an in-flight request.
    latest=await currentPurchase(p.id,report.checkedAt);
    if(!latest||!qualifies(o,history,latest.budget,latest.alerts).qualified||notificationId(latest,o)!==id)continue;
    let status='failed';
    try{
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',signal:AbortSignal.timeout(20000),
        headers:{Authorization:`Bearer ${config().RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idem},
        body:JSON.stringify(savedMessage||message),
      });
      if(response.ok)status='sent';
    }catch{
      // A timeout/network failure is a retryable notification failure, not a
      // failed research write. Provider secrets/errors are never returned.
    }
    await db().prepare('UPDATE notifications SET status=? WHERE id=?').bind(status,id).run();
    results.push(status);
    // One provider attempt per research write bounds the worker delivery time.
    // Remaining qualifying offers are reconsidered on a later due check.
    break;
  }
  return {state:results.includes('failed')?'failed':'complete',results};
}
