import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url), exports={};
const compiled=ts.transpileModule(fs.readFileSync(new URL('../components/research-report.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled,{exports,require,URL,Date,Intl,Number,Array,Object,String,Set});
const {ResearchReport,PriceHistory,isCandidateProvisional}=exports;
const source={url:'https://example.com/tablet/exact',sourceId:'public-reference',quote:'PRIVATE-BODY-CANARY',bodyText:'PRIVATE-BODY-CANARY',contentHash:'PRIVATE-HASH-CANARY'};
const candidate={id:'candidate-1',name:'Exact tablet',variant:'128 GB',fit:'Potential fit',pros:['Compact'],cons:['Evidence missing'],sources:[{url:source.url,label:'Official model page',kind:'official',note:'Public evidence summary',bodyText:'PRIVATE-BODY-CANARY'}],offers:[{retailer:'Official',url:source.url,price:20000,total:null,availability:'Unverified'}],claimEvidence:{
  hardRequirements:[{requirement:'Pressure-sensitive stylus',status:'unknown',sourceRef:{...source,url:'https://example.com/pen-compatibility'}}],comparisonClaims:[{text:'Battery measured under a documented test',kind:'measurement',sourceRef:source},{text:'Reviewer prefers the pen',kind:'opinion',sourceRef:source},{text:'Owner reports comfortable notes',kind:'anecdote',sourceRef:source}],
  mandatoryAccessories:[{name:'Compatible stylus',required:true,compatibility:'unknown',price:null,compatibilityRef:source,priceRef:null}],condition:'new',currentAvailability:'in_stock',knownRequiredKitCost:null,provisional:false,checkoutVerified:false,privateReasoning:'PRIVATE-BODY-CANARY'}};
const report={status:'provisional',summary:'A source-backed provisional comparison',checkedAt:'2026-10-08T10:00:00Z',products:[candidate],topN:3,privateProviderOutput:'PRIVATE-BODY-CANARY'};
const render=data=>renderToStaticMarkup(React.createElement(ResearchReport,{report:data,budget:60000}));
const html=render(report);
assert.equal(isCandidateProvisional(candidate,60000),true);
assert.match(html,/#1 · Provisional/);assert.doesNotMatch(html,/#1 · Best fit/);assert.match(html,/Pressure-sensitive stylus/);assert.match(html,/Unknown/);
assert.match(html,/Required-kit cost unknown/);assert.match(html,/Compatibility: Unknown/);assert.match(html,/Cost unknown/);
for(const label of ['Measured results','Opinions','Owner anecdotes'])assert.equal(html.includes(label),true);
assert.match(html,/href="https:\/\/example.com\/tablet\/exact"/);assert.match(html,/href="https:\/\/example.com\/pen-compatibility"/);assert.doesNotMatch(html,/PRIVATE-BODY-CANARY|PRIVATE-HASH-CANARY/);
assert.equal((html.match(/class="product-card"/g)||[]).length,1,'Shortlist must not pad to requested top N');
const supported=structuredClone(report);supported.products[0].claimEvidence.hardRequirements[0].status='supported';supported.products[0].claimEvidence.mandatoryAccessories[0].compatibility='supported';supported.products[0].claimEvidence.mandatoryAccessories[0].price=5000;supported.products[0].claimEvidence.knownRequiredKitCost=25000;
assert.equal(isCandidateProvisional(supported.products[0],60000),false);
assert.equal(isCandidateProvisional(supported.products[0],24000),true);
assert.match(render(supported),/#1 · Best fit/);assert.match(render(supported),/Checkout remains unverified/);
const verified=structuredClone(supported);Object.assign(verified.products[0].offers[0],{total:25000,verified:true,deliveryVerified:true,sellerReliable:true,mandatoryCostsVerified:true,condition:'New',availability:'In stock',quoteExpiresAt:'2099-01-01T00:00:00Z'});assert.match(render(verified),/Verified checkout quote/);assert.match(render(verified),/Full cost:/);assert.doesNotMatch(render(verified),/Checkout remains unverified/);
const expired=structuredClone(verified);expired.products[0].offers[0].quoteExpiresAt='2000-01-01T00:00:00Z';assert.match(render(expired),/Checkout unverified/);
const contradicted=structuredClone(supported);contradicted.products[0].claimEvidence.hardRequirements[0].status='contradicted';assert.match(render(contradicted),/Contradicted/);assert.doesNotMatch(render(contradicted),/#1 · Best fit/);
const legacy=structuredClone(report);delete legacy.products[0].claimEvidence;assert.match(render(legacy),/#1 · Provisional/);
assert.match(render({products:[]}),/No supported shortlist yet/);assert.doesNotThrow(()=>render({products:[null,'malformed',{}],needsClarification:{private:'PRIVATE-BODY-CANARY'}}));
const malicious=structuredClone(report);malicious.products[0].sources[0].url='javascript:alert(1)';malicious.products[0].offers[0].url='http://127.0.0.1/private';malicious.products[0].claimEvidence.hardRequirements[0].sourceRef.url='javascript:alert(1)';
assert.doesNotMatch(render(malicious),/javascript:|href="http:\/\/127/);
const history=renderToStaticMarkup(React.createElement(PriceHistory,{observations:[{id:'observation',checkedAt:'2026-10-08T10:00:00Z',variant:'Exact 128 GB',price:20000,url:source.url,retailer:'Official',availability:'Unverified',rawBody:'PRIVATE-BODY-CANARY'}]}));
assert.match(history,/Exact 128 GB/);assert.doesNotMatch(history,/PRIVATE-BODY-CANARY/);
console.log('PASS: research report requirement states/citations, separated evidence types, unknown kit costs, honest provisional ranking, no private bodies or padded candidates, safe links and history');
