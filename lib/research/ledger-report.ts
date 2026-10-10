import {requiredPlanCriteria, type validateClaimAssessment, type QuoteProof} from './claims';

type Ledger = ReturnType<typeof validateClaimAssessment>;
type Brief = Record<string, unknown>;
type Plan = Record<string, unknown>;
type Candidate = Ledger['candidates'][number];
type Claim = {text:string;kind:string;status:string;evidence:QuoteProof|null};
type Requirement = {requirement:string;status:string;evidence:QuoteProof|null};

function strings(value:unknown,max=40):string[] {
  return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).map(item=>item.trim()).slice(0,max):[];
}
function proofUrl(proof:QuoteProof|null|undefined):string|null {
  if(!proof||!Number.isInteger(proof.start)||!Number.isInteger(proof.end)||proof.start<0||proof.end<=proof.start||!/^[a-f0-9]{64}$/i.test(proof.contentHash))return null;
  try {const url=new URL(proof.url);if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)||url.hostname.endsWith('.local'))return null;url.hash='';return url.href;}catch{return null;}
}
function supportedClaims(candidate:Candidate):Claim[] {
  return candidate.comparisonClaims.filter((claim:Claim)=>claim.status==='supported'&&!!claim.text&&!!proofUrl(claim.evidence));
}
function supportedRequirements(candidate:Candidate):Requirement[] {
  return candidate.hardRequirements.filter((claim:Requirement)=>claim.status==='supported'&&!!proofUrl(claim.evidence)&&
    !/^New product only$|^India-market product listing$|^Required item and accessory subtotal at most INR /i.test(claim.requirement)&&
    !/(?:condition.*new|brand new|complete kit price|base price|bank|credit|debit|emi)/i.test(claim.requirement));
}
function blocked(candidate:Candidate,brief:Brief) {
  const budget=brief.budget;
  return candidate.eligibility.blocked||candidate.hardRequirements.some((claim:Requirement)=>claim.status==='contradicted')||candidate.currentAvailability==='out_of_stock'||
    (/new/i.test(String(brief.condition||''))&&['used','refurbished'].includes(candidate.condition))||
    (typeof budget==='number'&&budget>0&&[candidate.productPrice,candidate.eligibility.completeKitCost].some(value=>typeof value==='number'&&value>budget));
}
function candidateProofs(candidate:Candidate):QuoteProof[] {
  return [...candidate.hardRequirements.filter((claim:Requirement)=>claim.status==='supported').map((claim:Requirement)=>claim.evidence),
    ...supportedClaims(candidate).map(claim=>claim.evidence),candidate.productPriceEvidence,candidate.conditionEvidence,candidate.availabilityEvidence,
    ...candidate.mandatoryAccessories.flatMap((accessory:{compatibilityEvidence:QuoteProof|null;priceEvidence:QuoteProof|null})=>[accessory.compatibilityEvidence,accessory.priceEvidence])]
    .filter((proof):proof is QuoteProof=>!!proofUrl(proof));
}
function prefersSmallSize(brief:Brief,plan:Plan) {
  const explicit=[String(brief.requestText||''),...strings(brief.priorities),...strings(brief.customTags)].join(' ');
  // The plan may interpret an expressed preference, but cannot create one.
  return /\b(?:smallest|compact|small(?:er)?\s+(?:size|case|screen|watch|tablet))\b/i.test(explicit)&&
    (strings(plan.softPreferences).some(value=>/\b(?:small|compact|portable)/i.test(value))||/\b(?:smallest|compact|small(?:er)?\s+(?:size|case|screen|watch|tablet))\b/i.test(explicit));
}
function supportedSize(candidate:Candidate) {
  const sizes=[...String(candidate.variant).matchAll(/\b(\d+(?:\.\d+)?)\s*(mm|inch(?:es)?)\b/gi)];
  if(sizes.length!==1)return null;
  const size=sizes[0],unit=size[2].toLowerCase()==='mm'?'mm':'inch';
  const proofs=candidateProofs(candidate);
  const found=proofs.some(proof=>[...proof.quote.matchAll(/\b(\d+(?:\.\d+)?)\s*(mm|inch(?:es)?)\b/gi)]
    .some(match=>Number(match[1])===Number(size[1])&&(match[2].toLowerCase()==='mm'?'mm':'inch')===unit));
  return found?{value:Number(size[1]),unit}:null;
}

/** Render already validated evidence without spending another model call.
 * Ranking is an explicit evidence-coverage heuristic, not an inferred review score.
 * Callers still normalize the report and applyClaimLedger before publication.
 */
export function ledgerResearchDraft(ledger:Ledger,brief:Brief,plan:Plan={}) {
  const excluded:{name:string;reason:string}[]=[],eligible:Candidate[]=[];
  for(const candidate of ledger.candidates){
    if(blocked(candidate,brief)){
      excluded.push({name:candidate.name,reason:strings(candidate.eligibility.reasons).join(' ')||'The validated assessment contradicts a required constraint, availability or budget.'});continue;
    }
    if(!supportedRequirements(candidate).length&&!supportedClaims(candidate).length){
      excluded.push({name:candidate.name,reason:'Only research leads or market/price evidence are available; there is no supported suitability or comparison claim.'});continue;
    }
    if(!candidateProofs(candidate).length){excluded.push({name:candidate.name,reason:'No retained source proof supports the candidate.'});continue;}
    if(!eligible.some(item=>item.name.toLowerCase()===candidate.name.toLowerCase()&&item.variant.toLowerCase()===candidate.variant.toLowerCase()))eligible.push(candidate);
  }
  const small=prefersSmallSize(brief,plan);
  eligible.sort((a,b)=>{
    const coverage=supportedRequirements(b).length-supportedRequirements(a).length;if(coverage)return coverage;
    const provisional=Number(!!a.eligibility.provisional)-Number(!!b.eligibility.provisional);if(provisional)return provisional;
    const condition=Number(b.condition==='new')-Number(a.condition==='new');if(condition)return condition;
    const stock=Number(b.currentAvailability==='in_stock')-Number(a.currentAvailability==='in_stock');if(stock)return stock;
    if(small){const first=supportedSize(a),second=supportedSize(b);if(first&&second&&first.unit===second.unit)return first.value-second.value;}
    return 0;
  });
  const topN=Math.max(1,Math.min(20,typeof brief.topN==='number'&&Number.isFinite(brief.topN)?Math.trunc(brief.topN):3));
  const products=eligible.slice(0,topN).map((candidate,index)=>{
    const claims=supportedClaims(candidate),requirements=supportedRequirements(candidate);
    const proofs=candidateProofs(candidate),urls=[...new Set(proofs.map(proof=>proofUrl(proof)!))];
    const priceUrl=proofUrl(candidate.productPriceEvidence);
    const price=priceUrl&&typeof candidate.productPrice==='number'&&Number.isFinite(candidate.productPrice)&&candidate.productPrice>0?candidate.productPrice:null;
    const provisional=!!candidate.eligibility.provisional;
    const fit=requirements.length?`Supported requirements: ${requirements.map(claim=>claim.requirement).join('; ')}.`:'The comparison below contains supported source statements; requirement coverage remains limited.';
    return {name:candidate.name,variant:candidate.variant,
      verdict:`${index===0?'First by supported requirement coverage':'Shortlisted by supported requirement coverage'}${provisional?'; provisional because evidence is incomplete':''}.`,
      fit:`${fit} Ranking also considers known condition and availability${small?', then an evidenced smaller size when coverage is equal':''}. Checkout remains unverified.`,
      pros:claims.map(claim=>claim.text).slice(0,8),cons:[],
      sources:urls.map(url=>({url,label:new URL(url).hostname,kind:'evidence',note:'Retained source proof from the validated claim ledger. Specification, opinion and anecdote labels are preserved in claim evidence; checkout is unverified.'})),
      offers:priceUrl?[{retailer:new URL(priceUrl).hostname.replace(/^www\./,''),url:priceUrl,price,accessories:'Required accessories, seller, delivery and complete checkout costs require verification.'}]:[],
      dealAssessment:'No qualifying deal is established by the claim ledger; comparable price history and checkout must be verified.'};
  });
  const provisional=products.some(product=>product.verdict.includes('; provisional'));
  const gaps=strings(ledger.gaps);
  return {summary:products.length?
    `${products.length} candidate${products.length===1?'':'s'} have supported suitability or comparison evidence. The first candidate is ranked by supported requirement coverage, then known eligibility${small?' and an evidenced smaller-size preference':''}. ${provisional?'The shortlist is provisional. ':''}${gaps.length?`${gaps.length} evidence gaps remain. `:''}No checkout or qualifying deal is verified.`:
    'No candidate has enough supported suitability or comparison evidence for a recommendation. Unresolved leads remain in exclusions; no product or price has been invented.',
    category:typeof plan.category==='string'?plan.category:typeof brief.category==='string'?brief.category:'Product',uses:[],
    mustHave:requiredPlanCriteria(brief,plan),budget:typeof brief.budget==='number'&&Number.isFinite(brief.budget)&&brief.budget>0?brief.budget:null,
    needsClarification:strings(ledger.needsClarification,30),products,excluded:excluded.slice(0,40)};
}
