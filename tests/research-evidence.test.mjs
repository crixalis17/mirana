import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('@/'))return next(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
 try{return next(specifier,context);}catch(error){if(specifier.startsWith('.'))return next(`${specifier}.ts`,context);throw error;}
}});
const {researchEvidenceView}=await import('../lib/research/evidence-view.ts');
const date='2026-10-10T10:00:00Z',secret='evidence-key-canary',url='https://www.amazon.in/dp/B0F3GWXLTS';
const body=`Acme Watch 40mm Black GPS. Price INR 30000. New condition. In stock. Accidental token: ${secret}`;
const contentHash=createHash('sha256').update(body).digest('hex');
const payload={purchase:{email:'private-profile@example.invalid'},token:'private-lease-token',thoughts:'private-thought-canary',outputs:{
 gather:{round:0,notes:'private-model-notes',sources:[{url:`${url}?pid=ABC123&api_key=${secret}`,title:`Acme Watch ${secret}`,excerpts:['private-snippet-canary']},
  {url:'https://127.0.0.1/private',title:'Private target'}],
  toolCalls:[{tool:'fetch_product_listing',provider:'product-api',status:'ok',sourceCount:1,offerCount:1,elapsedMs:100,rawError:'private-error-canary',errorCode:'PRIVATE_bad'},
   {tool:'unknown-secret-tool',provider:'private-provider',status:'ok'}],
  toolObservations:[{kind:'listing-api',provider:'brightdata',requestedUrl:url,url,exactId:'B0F3GWXLTS',title:'Acme Watch',retrievedAt:date,providerUpdatedAt:null,
   freshness:{retrieval:'on-demand-scraper',cacheStatus:'unknown',verifiedFresh:true},
   offer:{url,title:'Acme Watch',retailer:'Amazon India',variant:'40mm Black GPS',seller:'Acme Retail',price:30000,currency:'INR',condition:'New',availability:'In stock',providerCollectedAt:date,checkoutVerified:true,evidenceKind:'listing-extraction',raw:'private-offer-canary'},
   source:{url:`https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_fixture&token=${secret}`,retailerUrl:url,bodyText:'private-raw-api-canary',contentHash:'a'.repeat(64),responseHash:'b'.repeat(64),retrievedAt:date,textTrust:'untrusted-provider-api-json',evidenceKind:'listing-extraction',truncated:false}}]},
 read:[{sources:[{url,title:'Acme Watch',sourceKind:'retailer',accessStatus:'read',retrievedAt:date,publishedAt:null,contentHash,bodyText:body,textTrust:'untrusted-original-page',truncated:false},
  {url:'https://www.flipkart.com/acme-watch/p/itm123',title:'Provider projection',accessStatus:'read',retrievedAt:date,contentHash:'c'.repeat(64),bodyText:'private-provider-projection',textTrust:'untrusted-provider-api-json'},
  {url:'https://evil.example/private',title:'Unapproved original',accessStatus:'read',retrievedAt:date,contentHash,bodyText:body,textTrust:'untrusted-original-page'}]}]}};
const metadata=researchEvidenceView(payload,{env:{GOOGLE_API_KEY:secret}}),full=researchEvidenceView(payload,{env:{GOOGLE_API_KEY:secret},includeOriginalText:true});
assert.equal(metadata.sources.length,1);assert.equal(metadata.sources[0].url,`${url}?pid=ABC123`);assert.equal(metadata.sources[0].title,'Acme Watch [redacted]');
assert.equal(metadata.listingObservations[0].offer.price,30000);assert.equal(metadata.listingObservations[0].offer.variant,'40mm Black GPS');
assert.equal(metadata.listingObservations[0].offer.checkoutVerified,false);assert.equal(metadata.listingObservations[0].freshness.verifiedFresh,false);
assert.equal(new URL(metadata.listingObservations[0].source.url).searchParams.has('token'),false);
assert.equal(metadata.toolCalls.length,1);assert.equal(metadata.toolCalls[0].errorCode,undefined);
assert.equal(metadata.originalSnapshots.length,2);assert.ok(metadata.originalSnapshots.every(snapshot=>snapshot.bodyText===undefined));
assert.equal(full.originalSnapshots[0].bodyText,body.replace(secret,'[redacted]'));assert.equal(full.originalSnapshots[0].bodyRedacted,true);
assert.equal(full.originalSnapshots[0].hashValid,true);assert.equal(full.originalSnapshots[1].bodyText,undefined,'API field projections are not independently read original body text');
for(const canary of [secret,'private-profile@example.invalid','private-lease-token','private-thought-canary','private-model-notes','private-snippet-canary','private-error-canary','private-offer-canary','private-raw-api-canary','private-provider-projection'])
 assert.equal(JSON.stringify(full).includes(canary),false,`Whitelisted evidence must exclude ${canary}`);
const invalid=structuredClone(payload);invalid.outputs.read[0].sources[0].contentHash='d'.repeat(64);
assert.equal(researchEvidenceView(invalid,{includeOriginalText:true}).originalSnapshots[0].bodyText,undefined,'Invalid snapshot hashes cannot expose text');
const noPrice=structuredClone(payload);noPrice.outputs.gather.toolObservations[0].offer.price='30000';
assert.equal(researchEvidenceView(noPrice).listingObservations[0].offer.price,null,'Do not invent or coerce absent normalized prices');
const hashCanary=researchEvidenceView(payload,{env:{HASH_API_KEY:'a'.repeat(64)}});
assert.equal(hashCanary.listingObservations[0].source.contentHash,null,'Even whitelisted hash-shaped fields cannot expose a configured credential');

const directory=await mkdtemp(join(tmpdir(),'mirana-evidence-'));
const names=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','NODE_ENV','VERCEL','AUTH_PREVIEW_MODE','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_API_KEY'];
const saved=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch;let client;
try{
 process.env.TURSO_DATABASE_URL=`file:${join(directory,'test.db')}`;delete process.env.TURSO_AUTH_TOKEN;delete process.env.VERCEL;
 process.env.NODE_ENV='test';process.env.AUTH_PREVIEW_MODE='true';delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;process.env.GOOGLE_API_KEY=secret;
 globalThis.fetch=async()=>{throw new Error('Evidence reads must not call providers.');};
 const {databaseClient}=await import('../lib/database.ts');client=databaseClient();
 const schema=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');await client.batch(schema.split(';').map(sql=>sql.trim()).filter(Boolean),'write');
 const {ensureResearchJob}=await import('../lib/research-jobs.ts');const {hash}=await import('../lib/auth.ts');const {GET}=await import('../app/api/research/evidence/route.ts');
 const brief={brand:'Acme',modelName:'Watch',requestText:'Black GPS watch',topN:3,budget:40000,briefRevision:0};
 await client.execute({sql:'INSERT INTO purchases (id,user_id,brief,report,status,updated_at) VALUES (?,?,?,?,?,?)',args:['evidence-item','owner',JSON.stringify(brief),null,'queued',date]});
 for(const [id,token]of [['owner','owner-session'],['other','other-session']])await client.execute({sql:'INSERT INTO sessions (id,user,expires) VALUES (?,?,?)',
  args:[await hash(token),JSON.stringify({id,email:`${id}@example.invalid`,provider:'google',emailVerified:true,preview:false}),Date.now()+600000]});
 const job=await ensureResearchJob('evidence-item','owner');const stored=JSON.parse((await client.execute({sql:'SELECT payload FROM research_jobs WHERE id=?',args:[job.id]})).rows[0].payload);
 stored.outputs=payload.outputs;await client.execute({sql:'UPDATE research_jobs SET payload=? WHERE id=?',args:[JSON.stringify(stored),job.id]});
 const request=(token='owner-session',suffix='')=>new Request(`http://localhost/api/research/evidence?purchaseId=evidence-item${suffix}`,{headers:token?{cookie:`mirana_session=${token}`}:{}});
 assert.equal((await GET(request(''))).status,401,'Local preview fallback is rejected for private evidence');
 assert.equal((await GET(request('other-session'))).status,404,'Another signed-in user cannot read the item evidence');
 const response=await GET(request('owner-session','&includeOriginalText=true'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('vary'),'Cookie');
 const data=await response.json();assert.equal(data.listingObservations[0].offer.price,30000);assert.ok(data.originalSnapshots[0].bodyText.includes('INR 30000'));
 assert.equal(JSON.stringify(data).includes(secret),false);assert.equal(JSON.stringify(data).includes(job.id),false,'No raw durable identifiers or lease data are exposed');
 assert.equal((await GET(request('owner-session','&includeOriginalText=anything'))).status,400);
 assert.equal((await GET(request('owner-session','&userId=owner'))).status,400,'Caller cannot override ownership');
 await client.execute({sql:'UPDATE purchases SET brief=? WHERE id=?',args:[JSON.stringify({...brief,briefRevision:1}),'evidence-item']});
 assert.equal((await GET(request())).status,404,'An older brief checkpoint cannot be read as current evidence');
}finally{globalThis.fetch=originalFetch;client?.close();for(const [name,value]of Object.entries(saved))if(value===undefined)delete process.env[name];else process.env[name]=value;await rm(directory,{recursive:true,force:true});}
console.log('PASS: owned current-brief evidence reads, Google-session enforcement, no provider calls, strict field whitelist, secret/query redaction, no raw receipts/thoughts, hash-checked opt-in original text and private no-store responses');
