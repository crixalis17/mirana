'use client';
import {ExternalLink,Check,AlertCircle} from 'lucide-react';

type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const records = (value: unknown): Data[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(record) : [];
const text = (value: unknown, maximum = 1000): string => typeof value === 'string' ? value.slice(0,maximum) : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0,40).map(item=>item.slice(0,1000)) : [];
const price = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const money = (value: number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
const checked = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : 'Time unavailable';
function publicLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {const url = new URL(value);return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname.includes('.') &&
    !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) && !url.hostname.endsWith('.local') ? url.href : null;} catch {return null;}
}
function hasCheckoutQuote(offer: Data): boolean {
  const total = price(offer.total);
  return offer.verified === true && offer.deliveryVerified === true && offer.sellerReliable === true && offer.mandatoryCostsVerified === true &&
    offer.condition === 'New' && offer.availability === 'In stock' && total !== null && total > 0 &&
    (offer.quoteExpiresAt === undefined || typeof offer.quoteExpiresAt === 'string' && Date.parse(offer.quoteExpiresAt) > Date.now());
}
const claimStatus = (value: unknown) => value === 'supported' ? 'Supported' : value === 'contradicted' ? 'Contradicted' : 'Unknown';
function Citation({reference,label = 'Source'}: {reference: unknown;label?: string}) {
  const url = publicLink(record(reference).url);
  return url ? <> · <a className="text-link" href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={12}/></a></> : null;
}
function ClaimEvidence({evidence,checkoutVerified}: {evidence: Data;checkoutVerified: boolean}) {
  const requirements = records(evidence.hardRequirements);
  const comparisons = records(evidence.comparisonClaims);
  const accessories = records(evidence.mandatoryAccessories);
  const kitCost = price(evidence.knownRequiredKitCost);
  const groups = [{kind:'specification',label:'Specifications'}, {kind:'measurement',label:'Measured results'},
    {kind:'opinion',label:'Opinions'}, {kind:'anecdote',label:'Owner anecdotes'}];
  return <section aria-label="Requirement evidence">
    <h3>Requirements</h3>
    {requirements.length ? <ul>{requirements.map((claim,index)=><li key={index}><strong>{text(claim.requirement,500)}</strong> · <span className="badge">{claimStatus(claim.status)}</span><Citation reference={claim.sourceRef}/></li>)}</ul> : <p className="field-note">Hard requirements have not been fully assessed.</p>}
    <h3>Required kit and costs</h3>
    <p>{kitCost === null ? 'Required-kit cost unknown.' : `Known product and required accessories: ${money(kitCost)}.`} {checkoutVerified ? 'See the verified checkout quote below for complete delivery costs.' : 'Checkout total, taxes, shipping and postcode delivery remain unverified.'}</p>
    {accessories.length ? <ul>{accessories.map((accessory,index)=><li key={index}>
      <strong>{text(accessory.name,150)}</strong>{accessory.required === true ? ' · Required' : ' · Optional'} · Compatibility: {claimStatus(accessory.compatibility)}
      <Citation reference={accessory.compatibilityRef} label="Compatibility source"/> · {price(accessory.price) === null ? 'Cost unknown' : money(price(accessory.price)!)}
      <Citation reference={accessory.priceRef} label="Price source"/>
    </li>)}</ul> : null}
    <p className="field-note">Condition: {evidence.condition === 'new' ? 'New' : evidence.condition === 'used' ? 'Used' : evidence.condition === 'refurbished' ? 'Refurbished' : 'Unknown'} · Current stock: {evidence.currentAvailability === 'in_stock' ? 'Listed in stock' : evidence.currentAvailability === 'out_of_stock' ? 'Out of stock' : 'Unknown'}.</p>
    {comparisons.length ? <details><summary>Comparison evidence by type</summary>{groups.map(group=> {
      const claims = comparisons.filter(claim=>claim.kind === group.kind);
      return claims.length ? <div key={group.kind}><h3>{group.label}</h3>{claims.map((claim,index)=><p key={index}>{text(claim.text,500)}<Citation reference={claim.sourceRef}/></p>)}</div> : null;
    })}<p className="field-note">Opinions and owner anecdotes are separate from measured results. A source reference establishes attribution; it does not independently prove every claim.</p></details> : null}
  </section>;
}
export function isCandidateProvisional(candidate: unknown,budget: number): boolean {
  const evidence = record(record(candidate).claimEvidence), requirements = records(evidence.hardRequirements), accessories = records(evidence.mandatoryAccessories);
  const knownKit = price(evidence.knownRequiredKitCost);
  return evidence.provisional !== false || !requirements.length || requirements.some(claim=>claim.status !== 'supported' || !publicLink(record(claim.sourceRef).url)) ||
    evidence.condition !== 'new' || evidence.currentAvailability !== 'in_stock' || knownKit === null || knownKit > budget ||
    accessories.some(accessory=>accessory.required === true && (accessory.compatibility !== 'supported' || price(accessory.price) === null));
}
export function ResearchReport({report,budget}: {report: unknown;budget: number}) {
  const data = record(report), products = records(data.products).filter(product=>text(product.name,150).trim() && text(product.variant,200).trim()).slice(0,20), clarifications = strings(data.needsClarification), excluded = records(data.excluded).slice(0,40);
  return <div className="report"><div className="report-intro"><span className="badge">{text(data.status,100)||'Research update'}</span><p>{text(data.summary,4000)}</p><small>Checked {checked(data.checkedAt)} IST · Prices may change at checkout.</small>{clarifications.length ? <p className="setup-needed">Please clarify: {clarifications.join(' · ')}. Edit your request to refine the research.</p> : null}</div>
    {products.map((product,index)=> {
      const evidence = record(product.claimEvidence), provisional = isCandidateProvisional(product,budget);
      const sources = records(product.sources), offers = records(product.offers), checkoutVerified = offers.some(hasCheckoutQuote);
      return <article className="product-card" key={text(product.id,150)||`candidate-${index}`}><div className="product-heading"><span className="rank">{String(index+1).padStart(2,'0')}</span><div><h2>{text(product.name,150)}</h2><p>{text(product.variant,200)}</p></div><span className="badge">{index === 0 ? provisional ? '#1 · Provisional' : '#1 · Best fit' : provisional ? 'Provisional candidate' : text(product.verdict,200)||'Evidence supported'}</span></div>
        <p className="fit">{text(product.fit,2000)}</p><p className="field-note">{provisional ? 'Some requirements or required-kit costs remain unknown.' : 'Hard requirements have supporting source references.'} {checkoutVerified ? 'A verified checkout quote is available below.' : 'Checkout remains unverified.'}</p>
        <div className="source-links" aria-label="Research sources">{sources.map((source,sourceIndex)=> {const url=publicLink(source.url);return url ? <a href={url} target="_blank" rel="noreferrer" key={`${url}-${sourceIndex}`}>{text(source.label,200)||'Source'} <ExternalLink size={12}/></a> : null;})}</div>
        <ClaimEvidence evidence={evidence} checkoutVerified={checkoutVerified}/>
        <div className="tradeoffs"><div><h3>Why it fits</h3>{strings(product.pros).map((claim,claimIndex)=><p key={claimIndex}><Check size={15}/>{claim}</p>)}</div><div><h3>Tradeoffs</h3>{strings(product.cons).map((claim,claimIndex)=><p key={claimIndex}><AlertCircle size={15}/>{claim}</p>)}</div></div>
        <div className="offers">{offers.map((offer,offerIndex)=> {const url=publicLink(offer.url),base=price(offer.price),total=price(offer.total), verified=hasCheckoutQuote(offer);return <div className="offer" key={`${url||'offer'}-${offerIndex}`}><div><strong>{text(offer.retailer,150)}</strong><small>{text(offer.availability,200)||'Availability unverified'} · {text(offer.delivery,200)||'Postcode availability unverified'}</small><small>{text(offer.accessories,500)}</small><small>{verified ? 'Verified checkout quote' : 'Checkout unverified'}</small></div><div className="offer-price"><strong>{base === null ? 'Not verified' : money(base)}</strong><small>{total === null ? 'Full cost not verified' : `${verified ? 'Full cost' : 'Provisional full cost'}: ${money(total)}`}</small>{total !== null && total > budget ? <small className="error">Over your budget</small> : null}{url ? <a target="_blank" rel="noreferrer" href={url}>View listing <ExternalLink size={13}/></a> : null}</div></div>;})}</div>
        <p className="deal-note">{text(product.dealAssessment,2000)}</p><details><summary>Review evidence &amp; owner feedback</summary>{sources.map((source,sourceIndex)=> {const url=publicLink(source.url);return <div className="evidence-source" key={`${url||'source'}-${sourceIndex}`}>{url ? <a href={url} target="_blank" rel="noreferrer">{text(source.label,200)||'Source'} <ExternalLink size={13}/></a> : null}<small>{text(source.kind,100)}</small><p>{text(source.note,2000)}</p></div>;})}</details>
      </article>;
    })}
    {!products.length ? <div className="comparison-empty"><h2>No supported shortlist yet</h2><p>More evidence or clarification is needed before recommending a product.</p></div> : null}
    {excluded.length ? <div className="report-intro"><h3>Also considered</h3>{excluded.map((product,index)=><p key={index}><strong>{text(product.name,150)}:</strong> {text(product.reason,1000)}</p>)}</div> : null}
  </div>;
}
export function PriceHistory({observations}: {observations: unknown}) {
  const items = records(observations).filter(item=>price(item.price)!==null).sort((a,b)=>text(b.checkedAt).localeCompare(text(a.checkedAt)));
  if (!items.length) return <div className="comparison-empty"><h2>Building your price history</h2><p>Each verified check adds a dated observation. Historical trackers are cited separately in the shortlist.</p></div>;
  return <div className="history-card"><p>Only observed listing prices appear here. Bank offers and checkout totals remain separate.</p><div className="table-scroll"><table><thead><tr><th>Checked (IST)</th><th>Exact model / variant</th><th>Store</th><th>Price</th><th>Availability</th></tr></thead><tbody>{items.map((item,index)=> {const url=publicLink(item.url);return <tr key={text(item.id,150)||index}><td>{checked(item.checkedAt)}</td><td>{text(item.variant,200)}</td><td>{url ? <a href={url} target="_blank" rel="noreferrer">{text(item.retailer,150)}</a> : text(item.retailer,150)}</td><td>{money(price(item.price)!)}</td><td>{text(item.availability,200)}</td></tr>;})}</tbody></table></div></div>;
}
