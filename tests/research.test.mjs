import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHmac } from 'node:crypto';
import { cronAuthorized } from '../lib/research/cron-auth.ts';
import { signedReceiptBody, validateCheckoutReceipt, requirementsHash } from '../lib/research/offer-verifier.ts';
import { qualifies } from '../lib/deals.ts';
// Next resolves extensionless TypeScript; keep the same resolution for direct Node tests.
registerHooks({resolve(specifier, context, nextResolve) {try {return nextResolve(specifier,context);}catch(error){if(specifier.startsWith('.'))return nextResolve(`${specifier}.ts`,context);throw error;}}});
const { sourceKey, responseEvidence, canFetchListing, listingReceipt, normalizeResearch, researchPurchase, RESEARCH_SCHEMA } = await import('../lib/research.ts');
const secret = 'x'.repeat(40);
const req = token => new Request('https://mirana.example/api/cron', {headers: token ? {authorization: token} : {}});
assert.equal(cronAuthorized(req(`Bearer ${secret}`),secret),true);
for(const token of ['',`Bearer ${secret}z`,secret,`bearer ${secret}`]) assert.equal(cronAuthorized(req(token),secret),false);
assert.equal(cronAuthorized(req('Bearer x'),'x'),false);
assert.equal(sourceKey('http://amazon.in'),null);
assert.equal(sourceKey('https://127.0.0.1/private'),null);
for(const url of ['https://amazon.in.evil.example/p','https://internal.example/product','https://amazon.in:444/p','https://user:password@amazon.in/p']) assert.equal(canFetchListing(url),false);
assert.equal(canFetchListing('https://www.amazon.in/dp/example'),true);
const source = 'https://www.amazon.in/dp/example';
const evidence=responseEvidence({output:[{type:'web_search_call',status:'completed',action:{sources:[{url:source}]}},{type:'message',content:[{type:'output_text',text:'notes',annotations:[{type:'url_citation',url:'https://review.example/tablet'}]}]}]});
assert.equal(evidence.searched,true); assert.equal(evidence.urls.size,2);
const draft={summary:'Fits pen use.',category:'Tablet',uses:['Sketching'],mustHave:['Pen'],budget:60000,needsClarification:[],excluded:[],products:[{name:'Tablet 10',variant:'128GB Blue',fit:'Pen work',pros:['Pressure pen'],cons:['Refresh rate'],sources:[{url:source,label:'Listing',kind:'Retailer',note:'Listing evidence'}],offers:[{url:source,retailer:'Amazon',price:45000,accessories:'Pen required',verified:true,deliveryVerified:true,total:45000}],verdict:'Fits',dealAssessment:'Great deal!'}]};
const purchase={id:'purchase',topN:3,budget:60000,priorities:['Smooth & fast','Pen quality'],customTags:[' Low glare ','Portability','portability']};
const normalized=normalizeResearch(draft,evidence.urls,purchase,'2026-10-07T00:00:00Z');
assert.deepEqual(normalized.preferencesUsed,{priorities:['Performance'],customTags:['Pen quality','Low glare','Portability']});
assert.equal(normalized.products.length,1); assert.equal(normalized.recommendedId,normalized.products[0].id);
for(const flag of ['verified','deliveryVerified','sellerReliable','mandatoryCostsVerified']) assert.equal(normalized.products[0].offers[0][flag],false);
assert.equal(normalized.products[0].offers[0].total,null);
assert.equal(normalizeResearch(draft,new Set(),purchase,'2026-10-07T00:00:00Z').products.length,0);
const ld = node => `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
const node={'@type':'Product',name:'Tablet 10 128GB Blue',offers:{'@type':'Offer',price:45000,priceCurrency:'INR',availability:'https://schema.org/InStock',itemCondition:'https://schema.org/NewCondition'}};
assert.equal(listingReceipt(ld(node),'Tablet 10','128GB Blue').price,45000);
assert.equal(listingReceipt(ld(node),'Tablet 10','256GB Blue'),null);
assert.equal(listingReceipt(ld({...node,offers:{...node.offers,priceCurrency:'USD'}}),'Tablet 10','128GB Blue'),null);
assert.equal(listingReceipt(ld({...node,offers:[node.offers,node.offers]}),'Tablet 10','128GB Blue'),null);
function strict(schema){if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,Object.keys(schema.properties));Object.values(schema.properties).forEach(strict);}if(schema.type==='array')strict(schema.items);}
strict(RESEARCH_SCHEMA);
const hash = requirementsHash({...purchase,postcode:'110001'},normalized.parsed);
const candidate = {...normalized.products[0].offers[0],productName:'Tablet 10'};
const now = Date.parse('2026-10-07T10:00:00Z');
const quote = {quoteId:'merchant-quote',productId:candidate.productId,productName:candidate.productName,variant:candidate.variant,listingUrl:candidate.url,postcode:'110001',requirementsHash:hash,
currency:'INR',condition:'New',availability:'In stock',completeCost:true,unconditional:true,deliveryAvailable:true,seller:{name:'Trusted merchant',reliable:true,evidenceUrl:source},
issuedAt:'2026-10-07T09:59:00Z',expiresAt:'2026-10-07T10:05:00Z',total:45100,
components:[{kind:'product',label:'Tablet',amount:45000,evidenceUrl:source},{kind:'shipping',label:'Shipping',amount:100,evidenceUrl:source},{kind:'tax',label:'Tax included',amount:0,evidenceUrl:source}]};
const raw=JSON.stringify({receipts:[quote]});const signature=createHmac('sha256',secret).update(raw).digest('hex');
assert.equal(signedReceiptBody(raw,signature,secret),true);assert.equal(signedReceiptBody(raw+' ',signature,secret),false);
assert.equal(validateCheckoutReceipt(quote,candidate,{postcode:'110001'},hash,now).mandatoryCostsVerified,true);
for(const change of [{total:45000},{postcode:'600020'},{requirementsHash:'different'},{variant:'256GB'},{unconditional:false},{completeCost:false},{condition:'Refurbished'},{expiresAt:'2026-10-07T09:00:00Z'},{issuedAt:'2026-10-07T08:00:00Z'},{seller:{name:'Unknown',reliable:false,evidenceUrl:source}},{components:quote.components.slice(0,2)}])assert.equal(validateCheckoutReceipt({...quote,...change},candidate,{postcode:'110001'},hash,now),null);
const originalFetch=globalThis.fetch, originalKey=process.env.OPENAI_API_KEY;
const verifierKeys=['OFFER_VERIFIER_URL','OFFER_VERIFIER_TOKEN','OFFER_VERIFIER_SIGNING_SECRET'];
const originalVerifier=Object.fromEntries(verifierKeys.map(key=>[key,process.env[key]]));
try {
  verifierKeys.forEach(key=>delete process.env[key]);
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch=()=>{throw new Error('Should never call network without a key');};
  await assert.rejects(researchPurchase(purchase,[],AbortSignal.timeout(1000)),/not configured/);
  process.env.OPENAI_API_KEY='mock-provider-key';let calls=0;
  globalThis.fetch=async(url,options)=>{
    calls++;
    if(url===source)return new Response(ld(node),{headers:{'content-type':'text/html'}});
    assert.equal(url,'https://api.openai.com/v1/responses');const input=JSON.parse(options.body);
    const supplied=JSON.parse(input.input);
    assert.deepEqual(supplied.brief.priorities,['Performance']);
    assert.deepEqual(supplied.brief.customTags,['Pen quality','Low glare','Portability']);
    assert.match(input.instructions,/secondary ranking preferences/);
    if(calls===1){assert.equal(input.tools[0].type,'web_search');assert.equal(input.store,false);return Response.json({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url:source}]}},{type:'message',content:[{type:'output_text',text:'Supported tablet research',annotations:[]}]}]});}
    assert.equal(input.text.format.strict,true);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft),annotations:[]}]}]});
  };
  const generated=await researchPurchase(purchase,[],AbortSignal.timeout(1000));
  assert.equal(calls,3);assert.equal(generated.observations.length,1);
  assert.equal(generated.report.products[0].offers[0].mandatoryCostsVerified,false);
  assert.equal(generated.observations[0].totalVerified,false);
  process.env.OFFER_VERIFIER_URL='https://merchant-adapter.example/verify';process.env.OFFER_VERIFIER_TOKEN=secret;process.env.OFFER_VERIFIER_SIGNING_SECRET=secret;
  const providerFetch=globalThis.fetch;calls=0;
  globalThis.fetch=async(url,options)=>{
    if(url!==process.env.OFFER_VERIFIER_URL)return providerFetch(url,options);
    const request=JSON.parse(options.body);assert.equal(options.redirect,'error');assert.equal(request.postcode,'110001');
    const incoming=request.candidates[0];const issuedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+300000).toISOString();
    const receipt={...quote,productId:incoming.productId,productName:incoming.productName,variant:incoming.variant,listingUrl:incoming.url,requirementsHash:request.requirementsHash,issuedAt,expiresAt};
    const signed=JSON.stringify({receipts:[receipt]});
    return new Response(signed,{headers:{'content-type':'application/json','x-mirana-signature':createHmac('sha256',secret).update(signed).digest('hex')}});
  };
  const checked=await researchPurchase({...purchase,postcode:'110001'},[],AbortSignal.timeout(1000));
  const checkedOffer=checked.report.products[0].offers[0];
  assert.equal(checkedOffer.total,45100);assert.equal(checkedOffer.mandatoryCostsVerified,true);
  assert.equal(checked.observations.length,1);assert.equal(checked.observations[0].totalVerified,true);
  assert.equal(qualifies(checkedOffer,[],60000,{rule:'target',targetPrice:46000}).qualified,true);
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
for(const key of verifierKeys){if(originalVerifier[key]===undefined)delete process.env[key];else process.env[key]=originalVerifier[key];}}
console.log('PASS: cron auth, source/SSRF gating, exact variants, conservative pricing, strict schema, no-key/mocked research and signed checkout receipt validation');
