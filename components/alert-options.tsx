'use client';
import {Checkbox} from '@/components/ui/checkbox';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';

export const defaultAlerts={enabled:false,mode:'daily',intervalHours:24,dailyHour:10,rule:'history',targetPrice:''};

export function AlertOptions({value,onChange,minimumHours=24}:{value:any,onChange:(v:any)=>void,minimumHours?:number}){
 const set=(key:string,v:any)=>onChange({...value,[key]:v});
 const preset=value.mode==='daily'?'daily':Number(value.intervalHours)===12?'12h':'custom';
 return <div className="alert-options">
  <label className="check-label"><Checkbox checked={value.enabled} onCheckedChange={v=>set('enabled',v===true)}/><span><strong>Watch for deals</strong><small>Email me only when a verified offer meets my rule.</small></span></label>
  {value.enabled&&<div className="alert-settings">
   <label className="field-label">How often should we check?</label>
   <RadioGroup value={preset} onValueChange={v=>onChange({...value,mode:v==='daily'?'daily':'interval',intervalHours:v==='12h'?12:v==='custom'?Math.max(minimumHours,6):value.intervalHours})} className="preset-options">
    <label><RadioGroupItem value="12h" disabled={minimumHours>12}/>Every 12 hours</label>
    <label><RadioGroupItem value="daily"/>Once daily</label>
    <label><RadioGroupItem value="custom"/>Custom</label>
   </RadioGroup>
   {value.mode==='daily'?<label>Daily at (IST)<select value={value.dailyHour} onChange={e=>set('dailyHour',Number(e.target.value))}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}</select></label>:preset==='custom'&&<label>Every how many hours?<input type="number" min={minimumHours} max={168} value={value.intervalHours} onChange={e=>set('intervalHours',e.target.value)}/></label>}
   <p className="field-note">{minimumHours>12?'Daily scheduling supports one check per day. Other selected times run at the next scheduled check; an hourly scheduler enables 12-hour and shorter custom intervals.':'Checks run when the background worker picks up a due watch. Times are approximate.'}</p>
   <label>What counts as a deal?<select value={value.rule} onChange={e=>set('rule',e.target.value)}><option value="history">A meaningful new low based on price history</option><option value="target">At or below my target price</option></select></label>
   {value.rule==='target'?<label>Target total price (INR)<input type="number" min={1} value={value.targetPrice||''} onChange={e=>set('targetPrice',e.target.value)} placeholder="Including required accessories"/></label>:<p className="field-note">A new observed low, at least 5% below the comparable 90-day median. We need prices from seven different days before using this rule.</p>}
   <p className="field-note">Only new products, reliable sellers and verified delivery and full costs qualify. Repeated offers are suppressed.</p>
  </div>}
 </div>
}
