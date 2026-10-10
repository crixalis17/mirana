import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(error){if(s.startsWith('.'))return next(`${s}.ts`,c);throw error;}}});
const {ledgerResearchDraft}=await import('../lib/research/ledger-report.ts');
const {validateClaimAssessment,applyClaimLedger}=await import('../lib/research/claims.ts');
const {normalizeResearch,RESEARCH_SCHEMA}=await import('../lib/research.ts');
const date='2026-10-10T14:00:00Z',url='https://www.amazon.in/dp/watch40';
const title='Acme Watch1 40mm Black GPS',quote=`${title}. New condition. In stock. Item price INR 30000. GPS only.`;
const source=(link,name,body)=>({url:link,title:name,bodyText:body,sourceKind:'retailer',accessStatus:'read',retrievedAt:date,publishedAt:null,contentHash:createHash('sha256').update(body).digest('hex'),textTrust:'untrusted-original-page'});
const proof=(sourceUrl,text)=>({sourceUrl,quote:text});
const rawCandidate=(link=url,name='Acme Watch1',variant='40mm Black GPS',text=quote)=>({name,variant,
  hardRequirements:[{requirement:'GPS only',status:'supported',...proof(link,text)}],
  comparisonClaims:[{text:'GPS only',kind:'specification',...proof(link,text)}],mandatoryAccessories:[],
  productPrice:{value:30000,...proof(link,text)},condition:{value:'new',...proof(link,text)},currentAvailability:{value:'in_stock',...proof(link,text)}});
const brief={brand:'Acme',modelName:'Watch',requestText:'GPS only, black; prefer smallest size.',budget:40000,topN:3,country:'India',condition:'New only'};
const plan={category:'Watch',hardRequirements:['GPS only'],softPreferences:['Smallest available case'],requiredAccessories:[]};
const ledgerFor=(candidates,sources=[source(url,title,quote)])=>validateClaimAssessment({candidates},{brief,plan,referenceDate:date,sources});
const ledger=ledgerFor([rawCandidate()]);
function strictValue(value,schema){
  if(schema.type==='object'){assert.deepEqual(Object.keys(value).sort(),Object.keys(schema.properties).sort());for(const [name,child]of Object.entries(schema.properties))strictValue(value[name],child);}
  else if(schema.type==='array'){assert.ok(Array.isArray(value));value.forEach(item=>strictValue(item,schema.items));}
  else if(Array.isArray(schema.type)){assert.ok(value===null&&schema.type.includes('null')||typeof value==='number'&&schema.type.includes('number'));}
  else assert.equal(typeof value,schema.type);
}
function publish(draft,validated=ledger){const urls=new Set(draft.products.flatMap(product=>product.sources.map(item=>item.url)));return applyClaimLedger(normalizeResearch(draft,urls,brief,date),validated,brief);}
const draft=ledgerResearchDraft(ledger,brief,plan);strictValue(draft,RESEARCH_SCHEMA);
assert.equal(draft.products.length,1,'Do not pad topN');assert.equal(draft.products[0].offers[0].price,30000);
assert.deepEqual(draft.products[0].pros,['GPS only']);assert.equal(JSON.stringify(draft).includes(quote),false,'Quote bodies remain private');
const report=publish(draft);assert.equal(report.products.length,1);assert.equal(report.products[0].offers[0].price,30000);
assert.equal(report.products[0].offers[0].verified,false);assert.equal(report.products[0].claimEvidence.checkoutVerified,false);

const unknown=ledgerFor([{...rawCandidate(),productPrice:{value:null,sourceUrl:'',quote:''},condition:{value:'unknown',sourceUrl:'',quote:''}}]);
const provisional=ledgerResearchDraft(unknown,brief,plan);strictValue(provisional,RESEARCH_SCHEMA);
assert.equal(provisional.products[0].offers.length,0,'Missing price proof cannot produce an offer URL or guessed price');
assert.match(provisional.products[0].verdict,/provisional/);const unknownReport=publish(provisional,unknown);
assert.equal(unknownReport.products[0].claimEvidence.provisional,true);assert.equal(unknownReport.products[0].claimEvidence.knownRequiredKitCost,null);
assert.ok(unknownReport.researchGaps.some(gap=>gap.includes('cost is unknown')));

const unsupported=ledgerFor([{...rawCandidate(),hardRequirements:[],comparisonClaims:[]}]);
assert.equal(ledgerResearchDraft(unsupported,brief,plan).products.length,0,'Price alone cannot become a recommendation');
const empty=ledgerResearchDraft(ledgerFor([rawCandidate()],[]),brief,plan);strictValue(empty,RESEARCH_SCHEMA);
assert.equal(empty.products.length,0);assert.equal(publish(empty,ledgerFor([rawCandidate()],[])).products.length,0);
const out='Acme Watch1 40mm Black GPS. New condition. Out of stock. Item price INR 30000. GPS only.';
const contradicted=ledgerFor([{...rawCandidate(url,'Acme Watch1','40mm Black GPS',out),currentAvailability:{value:'in_stock',...proof(url,out)}}],[source(url,title,out)]);
assert.equal(ledgerResearchDraft(contradicted,brief,plan).products.length,0,'Contradicted stock is excluded, even if model labeled it in stock');
const hardContradiction=structuredClone(ledger);hardContradiction.candidates[0].hardRequirements[0].status='contradicted';
assert.equal(ledgerResearchDraft(hardContradiction,brief,plan).products.length,0,'A contradicted requirement is excluded even with a stale blocked flag');
const unsupportedClaim=structuredClone(ledger);unsupportedClaim.candidates[0].comparisonClaims.push({text:'Measured battery 48 hours',kind:'measurement',status:'unknown',evidence:null});
assert.equal(JSON.stringify(ledgerResearchDraft(unsupportedClaim,brief,plan)).includes('48 hours'),false,'Unknown comparison claims must not enter rendered statements');
const overBudget=structuredClone(ledger);overBudget.candidates[0].productPrice=45000;
assert.equal(ledgerResearchDraft(overBudget,brief,plan).products.length,0,'Known over-budget prices cannot slip through a stale eligibility flag');

const largerUrl='https://www.amazon.in/dp/watch44',largerTitle='Acme Watch1 44mm Black GPS',largerQuote=quote.replace('40mm','44mm');
const sizes=ledgerFor([rawCandidate(largerUrl,'Acme Watch1','44mm Black GPS',largerQuote),rawCandidate()],
 [source(largerUrl,largerTitle,largerQuote),source(url,title,quote)]);
assert.equal(ledgerResearchDraft(sizes,brief,plan).products[0].variant,'40mm Black GPS','Explicit smaller preference resolves otherwise equal evidence coverage');
assert.equal(ledgerResearchDraft(sizes,{...brief,requestText:'GPS only, black'},plan).products[0].variant,'44mm Black GPS','A plan cannot invent a size preference absent from the user brief');
const moreEvidence=structuredClone(sizes);moreEvidence.candidates[0].hardRequirements.push({...moreEvidence.candidates[0].hardRequirements[0],requirement:'Black colour'});
assert.equal(ledgerResearchDraft(moreEvidence,brief,plan).products[0].variant,'44mm Black GPS','Hard requirement coverage takes priority over soft size');
assert.equal(ledgerResearchDraft(sizes,{...brief,topN:1},plan).products.length,1);
const duplicate=structuredClone(ledger);duplicate.candidates.push(structuredClone(duplicate.candidates[0]));
assert.equal(ledgerResearchDraft(duplicate,brief,plan).products.length,1,'Duplicate SKU rows must not pad a shortlist');
console.log('PASS: deterministic ledger rendering, strict report schema, quote-free sources, no invented offers, provisional unknowns, contradiction/budget exclusion, explicit size ranking and normalizer/ledger compatibility');
