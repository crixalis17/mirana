import assert from 'node:assert/strict';
import {qualifies,nextCheck} from '../lib/deals.ts';
const offer={productId:'p',variant:'v',retailer:'store',checkedAt:'2026-10-07T04:30:00Z',total:800,verified:true,availability:'In stock',deliveryVerified:true,condition:'New',sellerReliable:true,mandatoryCostsVerified:true};
const history=Array.from({length:7},(_,i)=>({productId:'p',variant:'v',retailer:'store',checkedAt:`2026-09-${String(20+i).padStart(2,'0')}T04:30:00Z`,total:1000,totalVerified:true,condition:'New'}));
assert.equal(qualifies(offer,history,2000,{rule:'history'}).qualified,true);
for(const change of [{availability:'Out of stock'},{deliveryVerified:false},{sellerReliable:false},{mandatoryCostsVerified:false},{total:2200},{condition:'Refurbished'}])assert.equal(qualifies({...offer,...change},history,2000,{rule:'history'}).qualified,false);
assert.equal(qualifies(offer,history.slice(0,6),2000,{rule:'history'}).qualified,false);
assert.equal(qualifies(offer,history.map(h=>({...h,variant:'other'})),2000,{rule:'history'}).qualified,false);
assert.equal(qualifies(offer,history.map(h=>({...h,retailer:'other'})),2000,{rule:'history'}).qualified,false);
assert.equal(qualifies({...offer,total:980},history,2000,{rule:'history'}).qualified,false);
assert.equal(qualifies(offer,[],2000,{rule:'target',targetPrice:850}).qualified,true);
assert.equal(nextCheck({mode:'daily',dailyHour:10},'2026-10-07T05:30:00Z'),'2026-10-08T04:30:00.000Z');
console.log('PASS: offer eligibility, variant/store isolation, history baseline, target price, IST cadence');

for(const quoteExpiresAt of [new Date(Date.now()-1000).toISOString(),'invalid',null])assert.equal(qualifies({...offer,quoteExpiresAt},[],2000,{rule:'target',targetPrice:850}).qualified,false);
assert.equal(qualifies({...offer,quoteExpiresAt:new Date(Date.now()+60000).toISOString()},[],2000,{rule:'target',targetPrice:850}).qualified,true);
console.log('PASS: expired/invalid checkout receipts rejected; unexpired receipt eligible');
