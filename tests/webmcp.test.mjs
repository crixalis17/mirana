import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}}});
const {createMiranaTools,researchJobView}=await import('../lib/webmcp.ts');

const calls=[],uiCalls=[];let refreshed=0;
const sample={id:'item-1',title:'Desk lamp',requestText:'A desk lamp for reading',budget:5000,topN:3,postcode:'110001',priorities:['Durability'],customTags:['Warm lighting'],status:'ready',alerts:{enabled:false,mode:'interval',intervalHours:24,rule:'history'},report:{recommendedId:'lamp-1',summary:'Fits reading',products:[],providerApiKey:'SECRET-CANARY'},accessToken:'SECRET-CANARY'};
const workspace={purchases:[sample],settings:{profile:{postcode:'110001',banks:'SBI',priorities:['Durability'],customTags:['Warm lighting']},schedule:'pending',schedulerMinIntervalHours:24,offerVerificationReady:false,apiKey:'SECRET-CANARY'},observations:[{id:'observation-1',purchaseId:'item-1',price:2000}],user:{id:'user-1',name:'Fixture',email:'fixture@example.invalid',preview:false,sessionToken:'SECRET-CANARY'},googleReady:false,emailReady:false};
const job={id:'job-1',purchaseId:'item-1',status:'running',stage:'gather',plan:{criteria:['Fits budget'],questions:['Pen compatibility'],rawProviderOutput:'RAW-CANARY'},events:[{id:1,at:'2026-10-08T10:00:00Z',message:'Gathering sources',stage:'gather',raw:'RAW-CANARY'}],completedSteps:['plan'],limits:{maxCalls:10,maxRounds:2,attemptedCalls:1,rawUsage:'RAW-CANARY'},coverage:{sources:4,facts:2,sourceCount:4,gapCount:1,gaps:['Current seller stock'],rawEvidence:'RAW-CANARY'},createdAt:'2026-10-08T09:00:00Z',updatedAt:'2026-10-08T10:00:00Z',apiKey:'SECRET-CANARY',rawProviderOutput:'RAW-CANARY'};
const status={user:workspace.user,googleReady:false,emailReady:false,researchReady:false,schedulerMinIntervalHours:24,GOOGLE_CLIENT_SECRET:'SECRET-CANARY'};
const allowed=new Set(['/api/workspace','/api/auth/status','/api/preferences','/api/purchases','/api/research','/api/research/evidence','/api/auth/logout']);
const request=async(path,method='GET',body)=>{
  assert.equal(allowed.has(path.split('?')[0]),true);assert.equal(path.startsWith('/api/'),true);calls.push({path,method,body});
  if(path==='/api/workspace')return structuredClone(workspace);
  if(path==='/api/auth/status')return structuredClone(status);
  if(path.startsWith('/api/research/evidence'))return {sources:[{url:'https://www.apple.com/in/watch/'}],listingObservations:[],originalSnapshots:[],toolCalls:[{tool:'search_web_tavily',status:'error'}],note:'Discovery is provisional.',rawProviderOutput:'RAW-CANARY',apiKey:'SECRET-CANARY'};
  if(path.startsWith('/api/research'))return {ok:true,status:'queued',job:structuredClone(job),rawProviderOutput:'RAW-CANARY'};
  if(path==='/api/purchases'&&method==='POST')return {...body,id:'new-item',status:'queued',clientSecret:'SECRET-CANARY'};
  return {ok:true};
};
const tools=createMiranaTools({request,onMutation:()=>{refreshed++},
  getUiState:()=>({view:'list',modal:null,clientSecret:'SECRET-CANARY'}),
  navigate:input=>{uiCalls.push(['navigate',input]);return input;},openItemForm:input=>{uiCalls.push(['itemForm',input]);return {opened:true};},
  openAlerts:input=>{uiCalls.push(['alerts',input]);return {opened:true};},closeDialog:()=>{uiCalls.push(['close']);return {closed:true};}});
assert.equal(tools.length,25);assert.equal(new Set(tools.map(t=>t.name)).size,25);
const tool=name=>{const result=tools.find(t=>t.name===name);assert.ok(result,name);return result;};
const execute=(name,input={})=>tool(name).execute(input);
const withoutUi=createMiranaTools({request});assert.equal(withoutUi.length,20);
for(const t of tools){assert.equal(t.inputSchema.additionalProperties,false);assert.equal(t.annotations.untrustedContentHint,true);assert.equal('destructiveHint' in t.annotations,false);assert.equal('idempotentHint' in t.annotations,false);}
for(const name of ['start_research','cancel_research','retry_research','set_deal_alerts','logout'])assert.equal(tool(name).annotations.consequentialHint,true);
assert.equal(tool('get_ui_state').annotations.debugging,true);
const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=()=>{throw new Error('Tools must use the injected same-origin app API request only.');};
  for(const name of ['read_workspace','read_preferences','read_configuration','read_session','read_shopping_item','read_research','read_research_job','read_price_history','get_ui_state']){
    const output=await execute(name,['read_shopping_item','read_research','read_research_job','read_price_history'].includes(name)?{id:'item-1'}:{});
    assert.equal(JSON.stringify(output).includes('SECRET-CANARY'),false,name);
  }
  const all=await execute('read_workspace');assert.deepEqual(all.profile.customTags,['Warm lighting']);assert.equal(all.purchases[0].budget,5000);
  assert.equal((await execute('read_shopping_list',{status:'ready'})).items.length,1);
  assert.equal((await execute('read_shopping_list',{status:'paused'})).items.length,0);
  assert.equal((await execute('read_price_history',{id:'item-1'})).observations.length,1);
  assert.deepEqual(await execute('get_google_sign_in_link'),{ready:false,path:'/api/auth/google',requiresBrowserSignIn:true});
  await execute('save_preferences',{customTags:[' Quiet ','Travel-friendly'],postcode:''});
  assert.deepEqual(calls.at(-1),{path:'/api/preferences',method:'POST',body:{customTags:['Quiet','Travel-friendly'],postcode:''}});
  const brief={brand:'Acme',modelName:'Reading lamp',title:'Reading lamp',requestText:'A lamp for focused reading',productUrl:'https://www.amazon.in/dp/EXAMPLE',budget:3000,topN:2,postcode:'110001',banks:'SBI debit',priorities:['Value for money'],customTags:['Warm lighting']};
  const added=await execute('add_shopping_item',brief);assert.equal(added.id,'new-item');assert.equal(added.clientSecret,undefined);
  assert.deepEqual(calls.at(-1),{path:'/api/purchases',method:'POST',body:brief});
  assert.equal(calls.filter(c=>c.path==='/api/research').length,0);
  await execute('edit_shopping_item',{id:'item-1',brief});
  assert.deepEqual(calls.at(-1),{path:'/api/purchases',method:'PATCH',body:{id:'item-1',action:'edit',brief}});
  for(const action of ['pause','resume','bought']){
    await execute('set_shopping_item_status',{id:'item-1',action});assert.equal(calls.at(-1).body.action,action);
  }
  const alerts={enabled:true,mode:'daily',dailyHour:10,intervalHours:24,rule:'target',targetPrice:2500};
  await execute('set_deal_alerts',{id:'item-1',alerts});
  assert.deepEqual(calls.at(-1),{path:'/api/purchases',method:'PATCH',body:{id:'item-1',alerts,action:'alerts'}});
  const started=await execute('start_research',{id:'item-1'});assert.equal(JSON.stringify(started).includes('RAW-CANARY'),false);assert.deepEqual(calls.at(-1),{path:'/api/research',method:'POST',body:{purchaseId:'item-1'}});
  const progress=await execute('read_research_job',{id:'item-1'});assert.deepEqual(progress.job.plan,{criteria:['Fits budget'],hardRequirements:[],softPreferences:[],questions:['Pen compatibility']});
  assert.deepEqual(calls.at(-1),{path:'/api/research?purchaseId=item-1',method:'GET',body:undefined});
  assert.equal(progress.job.coverage.sourceCount,4);assert.equal(progress.job.coverage.gapCount,1);
  assert.equal(JSON.stringify(progress).includes('RAW-CANARY'),false);assert.equal(JSON.stringify(progress).includes('SECRET-CANARY'),false);
  const evidence=await execute('read_research_evidence',{id:'item-1',includeOriginalText:true});
  assert.deepEqual(calls.at(-1),{path:'/api/research/evidence?purchaseId=item-1&includeOriginalText=true',method:'GET',body:undefined});
  assert.equal(evidence.sources[0].url,'https://www.apple.com/in/watch/');
  assert.equal(JSON.stringify(evidence).includes('RAW-CANARY'),false);assert.equal(JSON.stringify(evidence).includes('SECRET-CANARY'),false);
  for(const action of ['cancel','retry']){const output=await execute(`${action}_research`,{id:'item-1'});assert.deepEqual(calls.at(-1),{path:'/api/research',method:'PATCH',body:{purchaseId:'item-1',action}});assert.equal(JSON.stringify(output).includes('RAW-CANARY'),false);}
  assert.equal(researchJobView(null),null);assert.equal(researchJobView([]),null);
  const wrongShapes=researchJobView({...job,plan:{criteria:[{raw:'RAW-CANARY'},'Valid'],questions:[]},coverage:{sources:{raw:'RAW-CANARY'},gaps:[{raw:'RAW-CANARY'},'Gap']},completedSteps:[{raw:'RAW-CANARY'},'plan']});
  assert.equal(JSON.stringify(wrongShapes).includes('RAW-CANARY'),false);assert.deepEqual(wrongShapes.plan.criteria,['Valid']);assert.deepEqual(wrongShapes.coverage.gaps,['Gap']);
  await execute('logout');assert.deepEqual(calls.at(-1),{path:'/api/auth/logout',method:'POST',body:{}});
  assert.equal(refreshed,11);
  await execute('show_view',{view:'preferences'});await execute('show_view',{view:'list',purchaseId:'item-1'});
  await execute('open_item_form');await execute('open_item_form',{purchaseId:'item-1'});await execute('open_alert_settings',{purchaseId:'item-1'});await execute('close_dialog');
  assert.equal(uiCalls.length,6);assert.equal(refreshed,11);
  const invalid=[['add_shopping_item',{brand:'Apple'}],['add_shopping_item',{modelName:'Watch'}],['read_workspace',null],['read_workspace',[]],['read_workspace',{extra:true}],['read_shopping_item',{id:''}],['read_research',{id:'item-1',url:'https://evil.example'}],
    ['save_preferences',{}],['save_preferences',{priorities:['Pen quality']}],['save_preferences',{customTags:[9]}],['save_preferences',{customTags:['x'.repeat(81)]}],['save_preferences',{customTags:Array.from({length:17},(_,i)=>String(i))}],['save_preferences',{postcode:'123'}],
    ['add_shopping_item',{requestText:'A lamp',topN:21}],['add_shopping_item',{requestText:'A lamp',budget:-1}],['add_shopping_item',{requestText:'A lamp',productUrl:'http://localhost/private'}],['add_shopping_item',{productUrl:'https://127.0.0.1/private'}],['add_shopping_item',{requestText:'A lamp',provider:'arbitrary'}],
    ['edit_shopping_item',{id:'item-1',brief:{requestText:'A lamp',report:{verified:true}}}],['set_shopping_item_status',{id:'item-1',action:'delete'}],['set_deal_alerts',{id:'item-1',alerts:{enabled:true,rule:'target',targetPrice:null}}],['set_deal_alerts',{id:'item-1',alerts:{enabled:true,dailyHour:24}}],['set_deal_alerts',{id:'item-1',alerts:{enabled:'yes'}}],
    ['start_research',{id:'item-1',endpoint:'https://evil.example'}],['read_research_job',{id:'item-1',includeRaw:true}],['read_research_evidence',{id:'item-1',includeRaw:true}],['read_research_evidence',{id:'item-1',includeOriginalText:'true'}],['cancel_research',{id:'item-1',force:true}],['retry_research',{id:'item-1',maxCalls:999}],['get_google_sign_in_link',{clientSecret:'secret'}],['logout',{force:true}],['show_view',{view:'admin'}],['open_item_form',{purchaseId:'item-1',save:true}],['close_dialog',{force:true}]];
  for(const [name,input] of invalid){const count=calls.length,uiCount=uiCalls.length;const result=await execute(name,input);assert.equal(result.ok,false);assert.equal(result.kind,'validation');assert.match(result.error,/Invalid tool input/);assert.equal(calls.length,count);assert.equal(uiCalls.length,uiCount);}
  const secretInput=await execute('save_preferences',{priorities:['sk-proj-SECRET-CANARY']});assert.equal(secretInput.error.includes('SECRET-CANARY'),false);
  for(const name of ['read_shopping_item','read_price_history','read_research_job','read_research_evidence','start_research','cancel_research','retry_research']){const result=await execute(name,{id:'other-account-item'});assert.equal(result.ok,false);assert.equal(result.kind,'request');assert.match(result.error,/not found/);}
  const rejecting=createMiranaTools({request:async()=>{throw new Error('Please sign in.');},onMutation:()=>{throw new Error('Should not refresh a failed write.');}});
  assert.deepEqual(await rejecting.find(t=>t.name==='add_shopping_item').execute(brief),{ok:false,kind:'request',error:'Please sign in.'});
  const errorResult=createMiranaTools({request:async()=>({error:'Unsupported scheduler cadence.'})});
  assert.deepEqual(await errorResult.find(t=>t.name==='set_deal_alerts').execute({id:'item-1',alerts:{enabled:true}}),{ok:false,kind:'request',error:'Unsupported scheduler cadence.'});
  for(const message of ['OPENAI_API_KEY=SECRET-CANARY','Bearer token: SECRET-CANARY','database https://private.example/SECRET-CANARY','Failure\n    at handler (/Users/private/source.ts:12:2)']){
    const sensitive=createMiranaTools({request:async()=>{throw new Error(message);}});
    const result=await sensitive.find(t=>t.name==='read_session').execute({});assert.equal(result.ok,false);assert.equal(result.kind,'request');assert.equal(result.error.includes('SECRET-CANARY'),false);assert.equal(result.error.includes('/Users'),false);
  }
  const noJob=createMiranaTools({request:async(path)=>path==='/api/workspace'?structuredClone(workspace):{job:null}});
  assert.deepEqual(await noJob.find(t=>t.name==='read_research_job').execute({id:'item-1'}),{job:null});
  const failedJobRead=createMiranaTools({request:async(path)=>path==='/api/workspace'?structuredClone(workspace):{error:'Please sign in.'}});
  assert.deepEqual(await failedJobRead.find(t=>t.name==='read_research_job').execute({id:'item-1'}),{ok:false,kind:'request',error:'Please sign in.'});
  let foreignJobRequests=0;
  const foreignJob=createMiranaTools({request:async(path)=>{if(path==='/api/workspace')return structuredClone(workspace);foreignJobRequests++;return {job};}});
  for(const name of ['read_research_job','read_research_evidence','start_research','cancel_research','retry_research'])assert.equal((await foreignJob.find(t=>t.name===name).execute({id:'someone-elses-item'})).ok,false);
  assert.equal(foreignJobRequests,0);
  const busy=createMiranaTools({request,closeDialog:()=>{throw new Error('Wait for the current save to finish.');}});
  assert.deepEqual(await busy.find(t=>t.name==='close_dialog').execute({}),{ok:false,kind:'request',error:'Wait for the current save to finish.'});
  const refreshFailure=createMiranaTools({request:async()=>({id:'created-once'}),onMutation:()=>{throw new Error('Refresh failed.');}});
  assert.match((await refreshFailure.find(t=>t.name==='add_shopping_item').execute(brief)).refreshWarning,/operation completed/);
  let previewWrites=0;
  const preview=createMiranaTools({request:async(path)=>{if(path==='/api/auth/status')return {user:{preview:true}};previewWrites++;return {ok:true};}});
  assert.equal((await preview.find(t=>t.name==='logout').execute({})).status,'preview_mode');assert.equal(previewWrites,0);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: all WebMCP app/UI tools, exact app API routing, tags/briefs/alerts payloads, secret-free reads, strict invalid-input rejection, consent annotations and failure handling');
