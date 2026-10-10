'use client';
import {Checkbox} from '@/components/ui/checkbox';

export const defaultAlerts={enabled:false,mode:'daily',intervalHours:24,dailyHour:10,rule:'history',targetPrice:''};

type AlertValue={enabled:boolean;mode?:string;intervalHours?:number|string;dailyHour?:number;rule?:string;targetPrice?:number|string|null};

export function AlertOptions({value,onChange}:{value:AlertValue,onChange:(v:AlertValue)=>void,minimumHours?:number}){
 const set=<K extends keyof AlertValue,>(key:K,v:AlertValue[K])=>onChange({...value,[key]:v});
 return <div className="alert-options">
  <label className="check-label"><Checkbox checked={value.enabled} onCheckedChange={v=>set('enabled',v===true)}/><span><strong>Watch for deals</strong><small>Email me only when a verified offer meets my rule.</small></span></label>
  {value.enabled&&<div className="alert-settings">
   <strong>Once every 24 hours</strong>
   <p className="field-note">The daily check is scheduled for 10 AM IST. The hosting platform may run it later within that hour. No email is sent when there is no qualifying offer.</p>
   <label>What counts as a deal?<select value={value.rule} onChange={e=>set('rule',e.target.value)}><option value="history">A meaningful new low based on price history</option><option value="target">At or below my target price</option></select></label>
   {value.rule==='target'?<label>Target total price (INR)<input type="number" min={1} value={value.targetPrice||''} onChange={e=>set('targetPrice',e.target.value)} placeholder="Including required accessories"/></label>:<p className="field-note">A new observed low, at least 5% below the comparable 90-day median. We need prices from seven different days before using this rule.</p>}
   <p className="field-note">Only new products, reliable sellers and verified delivery and full costs qualify. Repeated offers are suppressed.</p>
  </div>}
 </div>
}
