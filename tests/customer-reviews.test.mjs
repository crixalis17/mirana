import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {customerReviewUrl,customerReviewIdentity,REVIEW_RANKING_POLICY}=await import('../lib/research/customer-reviews.ts');
const {sourcePageKind}=await import('../lib/research/source-reader.ts');
const {validateClaimAssessment}=await import('../lib/research/claims.ts');
const {mergeSourceSnapshots}=await import('../lib/research/api-evidence.ts');
const url=customerReviewUrl('https://www.amazon.in/dp/B0FQG8R2XW');
assert.equal(url,'https://www.amazon.in/product-reviews/B0FQG8R2XW?sortBy=recent');
assert.equal(customerReviewUrl('https://www.flipkart.com/acme-washer/p/itmabc?pid=WASH1234&lid=LSTWASH1234'),'https://www.flipkart.com/acme-washer/product-reviews/itmabc?pid=WASH1234');
for(const unsafe of ['https://attacker.test/dp/B0FQG8R2XW','http://www.amazon.in/dp/B0FQG8R2XW','https://secret@www.amazon.in/dp/B0FQG8R2XW','https://www.amazon.in/s?k=washers'])assert.equal(customerReviewUrl(unsafe),null);
assert.equal(customerReviewIdentity(url).id,'B0FQG8R2XW');assert.equal(sourcePageKind(url),'owner');
assert.equal(sourcePageKind('https://www.amazon.in/dp/B0FQG8R2XW'),'retailer');
assert.match(REVIEW_RANKING_POLICY,/60%/);assert.match(REVIEW_RANKING_POLICY,/cannot override/);assert.match(REVIEW_RANKING_POLICY,/pool variants/);
const body='Acme Washer ModelA 8kg: My washer failed twice after six months. The technician took seven days to visit.';
const source={url,title:'Acme Washer ModelA 8kg Customer Reviews',sourceKind:'owner',accessStatus:'read',retrievedAt:'2026-10-10T10:00:00Z',publishedAt:null,bodyText:body,contentHash:createHash('sha256').update(body).digest('hex'),paragraphs:[body],quotes:[],textTrust:'untrusted-original-page',truncated:false,note:'Review fixture'};
const value={sourceUrl:url,quote:body};
const candidate={name:'Acme Washer ModelA',variant:'8kg',hardRequirements:[],mandatoryAccessories:[],comparisonClaims:[{text:'Washer failed twice after six months',kind:'anecdote',...value}],productPrice:{value:19990,...value},condition:{value:'new',...value},currentAvailability:{value:'in_stock',...value}};
const result=validateClaimAssessment({candidates:[candidate]},{brief:{condition:'New only',topN:3},referenceDate:'2026-10-10T10:01:00Z',sources:[source]}).candidates[0];
assert.equal(result.comparisonClaims[0].status,'supported');assert.equal(result.comparisonClaims[0].kind,'anecdote');assert.equal(result.productPrice,null,'Customer review text never proves a live price');assert.equal(result.condition,'unknown');
const generic={...source,url:'https://www.amazon.in/dp/B0FQG8R2XW',sourceKind:'retailer'};
assert.equal(mergeSourceSnapshots(Array.from({length:12},()=>generic),[source],1)[0].sourceKind,'owner','Readable customer review evidence is retained in the bounded assessment set');
console.log('PASS: exact review URL binding, unsafe URL rejection, review-first policy, owner anecdotes, price isolation and review retention');
// Verify that the reasoning stage, rather than only the retrieval adapter,
// receives literal customer text and the review-first policy.
const configured={NODE_ENV:'test',RESEARCH_PROVIDER:'vertex',RESEARCH_TOOLS_ENABLED:'true',GOOGLE_API_KEY:'fixture-key',GOOGLE_CLOUD_PROJECT:'fixture-project',GEMINI_RESEARCH_MODEL:'gemini-3.8-flash'};
const saved=Object.fromEntries(Object.keys(configured).map(key=>[key,process.env[key]]));const originalFetch=globalThis.fetch;let modelRequests=0;
try{
 Object.assign(process.env,configured);
 globalThis.fetch=async(target,init)=>{
  assert.equal(new URL(target).hostname,'aiplatform.googleapis.com');
  const payload=JSON.parse(init.body),serialized=JSON.stringify(payload);
  assert.ok(serialized.includes('My washer failed twice after six months'),'Gemini receives actual customer review text');
  assert.ok(serialized.includes('60% relevant customer'),'Gemini receives review-first ranking instructions');
  modelRequests++;
  return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({candidates:[candidate],gaps:[],followupQuestions:[],sufficient:false})}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:100}});
 };
 const {runResearchStage}=await import('../lib/research/iterative.ts');
 const assessed=await runResearchStage('assess',{purchase:{brand:'Acme',modelName:'Washer',requestText:'8kg washer',topN:3},outputs:{plan:{hardRequirements:[],requiredAccessories:[]},gather:{sources:[],notes:'review owner feedback'},read:[{sources:[source]}]},referenceDate:'2026-10-10T10:01:00Z',retrievalAllowance:0},new AbortController().signal);
 assert.equal(modelRequests,1);assert.equal(assessed.output.claimLedger.candidates[0].comparisonClaims[0].kind,'anecdote');
}finally{globalThis.fetch=originalFetch;for(const key of Object.keys(configured)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
console.log('PASS: actual Gemini assessment request contains customer-review bodies and review-first ranking policy');
