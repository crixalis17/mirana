import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.'))return next(`${s}.ts`,c);throw e;}}});
const {providerPageProvenanceValid,humanVerification}=await import('../lib/research/source-reader.ts');
const {validateClaimAssessment}=await import('../lib/research/claims.ts');
const hash=text=>createHash('sha256').update(text).digest('hex');
const date='2026-10-10T10:00:00Z',url='https://www.apple.com/in/shop/buy-ipad/acme-fixture';
const title='Acme Tab11 128GB WiFi';
const body=`${title}\n\nPrice INR 45000. New condition. In stock.\n\nAcme Tab11 128GB WiFi supports palm rejection. Acme Pencil is compatible with Acme Tab11 128GB WiFi and is included at no extra cost.\n\nAcme Tab11 128GB WiFi battery lasted 8 hours in our measured lab workload.`;
const source=(provider='firecrawl')=>({url,title,sourceKind:'official',accessStatus:'read',retrievedAt:date,publishedAt:null,
  bodyText:body,contentHash:hash(body),paragraphs:body.split('\n\n'),quotes:[],textTrust:'untrusted-provider-page',truncated:false,note:'Provider extraction fixture.',
  provenance:{kind:'provider-page-extraction',provider,tool:`read_source_${provider}`,endpoint:provider==='firecrawl'?'https://api.firecrawl.dev/v2/scrape':'https://api.tavily.com/extract',
    payloadHash:hash(JSON.stringify({raw_content:body})),requestedUrl:url,retrieval:'on-demand-extraction',representation:provider==='firecrawl'?'markdown':'text',cacheStatus:'unknown'}});
for(const provider of ['firecrawl','tavily'])assert.equal(providerPageProvenanceValid(source(provider)),true);
assert.equal(providerPageProvenanceValid({...source(),provenance:{...source().provenance,endpoint:'https://mcp.firecrawl.dev/v2/mcp'}}),true);
const invalids=[{textTrust:'untrusted-provider-mcp'},{textTrust:'search-result'},{bodyText:body+' altered'},
  {contentHash:'0'.repeat(64)},{sourceKind:'review'},{accessStatus:'blocked'},{retrievedAt:'not-a-date'},
  {url:'https://evil.example/p',provenance:{...source().provenance,requestedUrl:'https://evil.example/p'}},
  ...[{tool:'firecrawl_search'},{provider:'brightdata'},{endpoint:'https://api.firecrawl.dev/v2/search'},
    {endpoint:'https://api.tavily.com/research'},{endpoint:'https://mcp.firecrawl.dev/v2/mcp?token=hidden'},
    {requestedUrl:'https://www.apple.com/in/other'},{retrieval:'search-cache-bypassed'},{representation:'summary'},
    {cacheStatus:'fresh'},{payloadHash:'x'.repeat(64)}].map(provenance=>({provenance:{...source().provenance,...provenance}}))];
for(const invalid of invalids)assert.equal(providerPageProvenanceValid({...source(),...invalid}),false,JSON.stringify(invalid));
const secretUrl=url+'?access_token=secret';assert.equal(providerPageProvenanceValid({...source(),url:secretUrl,provenance:{...source().provenance,requestedUrl:secretUrl}}),false);
const gateText='Verify you are human. '.repeat(8);assert.equal(humanVerification('Robot Check',gateText),true);
assert.equal(providerPageProvenanceValid({...source(),title:'Robot Check',bodyText:gateText,contentHash:hash(gateText)}),false);
const proof=quote=>({sourceUrl:url,quote});
const priceQuote=`${title}\n\nPrice INR 45000. New condition. In stock.`;
const accessoryQuote='Acme Tab11 128GB WiFi supports palm rejection. Acme Pencil is compatible with Acme Tab11 128GB WiFi and is included at no extra cost.';
const candidate={name:'Acme Tab11',variant:'128GB WiFi',
  hardRequirements:[{requirement:'Palm rejection',status:'supported',...proof(accessoryQuote)}],
  comparisonClaims:[{text:'Battery lasted 8 hours',kind:'measurement',...proof('Acme Tab11 128GB WiFi battery lasted 8 hours in our measured lab workload.')},
    {text:'Supports palm rejection',kind:'specification',...proof(accessoryQuote)}],
  mandatoryAccessories:[{name:'Acme Pencil',requirement:'Compatible stylus',required:true,compatibility:{status:'supported',...proof(accessoryQuote)},price:{value:0,...proof(accessoryQuote)}}],
  productPrice:{value:45000,...proof(priceQuote)},condition:{value:'new',...proof(priceQuote)},currentAvailability:{value:'in_stock',...proof(priceQuote)}};
const context={brief:{requestText:'Tablet with palm rejection',country:'India',condition:'New only',budget:55000,topN:3},
  plan:{hardRequirements:['Palm rejection'],requiredAccessories:['Compatible stylus']},referenceDate:date};
const validate=(input=source(),item=candidate,sources=[input])=>validateClaimAssessment({candidates:[item]}, {...context,sources}).candidates[0];
for(const provider of ['firecrawl','tavily']){
  const accepted=validate(source(provider));
  assert.equal(accepted.productPrice,45000);assert.equal(accepted.condition,'new');assert.equal(accepted.currentAvailability,'in_stock');
  assert.equal(accepted.hardRequirements.find(c=>c.requirement==='Palm rejection').status,'supported');
  assert.equal(accepted.mandatoryAccessories[0].price,0);assert.equal(accepted.mandatoryAccessories[0].compatibility,'supported');
  assert.equal(accepted.productPriceEvidence.provenance.provider,provider);assert.equal(accepted.comparisonClaims[1].evidence.provenance.provider,provider);
  assert.equal(accepted.comparisonClaims[0].status,'unknown','Provider extraction must not establish independently read measurement');
  assert.equal(accepted.eligibility.provisional,true);assert.equal(accepted.eligibility.checkoutVerified,false);
  assert.ok(accepted.eligibility.evidenceGaps.some(gap=>gap.includes('Third-party page extractions')));
}
for(const invalid of invalids)assert.equal(validate({...source(),...invalid}).productPrice,null);
assert.equal(validate(source(),{...candidate,productPrice:{value:45000,...proof('Acme Tab11 128GB WiFi price INR 45000 is a good deal.')}}).productPrice,null,'Invented summaries cannot satisfy literal quote checks');
const direct={...source(),textTrust:'untrusted-original-page',provenance:undefined};
const extraUrl='https://www.notebookcheck.net/Acme-Tab11-review.123456.html';
const extra={...source('tavily'),url:extraUrl,sourceKind:'review',provenance:{...source('tavily').provenance,requestedUrl:extraUrl}};
const directCandidate={...candidate,comparisonClaims:[],mandatoryAccessories:[],hardRequirements:[{requirement:'Palm rejection',status:'supported',sourceUrl:extraUrl,quote:accessoryQuote}]};
const derivedRequirement=validate(direct,directCandidate,[direct,extra]);
assert.equal(derivedRequirement.hardRequirements[0].evidence.provenance.provider,'tavily');
assert.ok(derivedRequirement.eligibility.evidenceGaps.some(gap=>gap.includes('Third-party page extractions')),'A provider-derived requirement remains provisional even with direct merchant prices');
console.log('PASS: registered Firecrawl/Tavily literal page provenance, endpoint/identity/hash guards, summary exclusion, provisional requirements/accessories/prices, independent measurement and checkout boundaries');
