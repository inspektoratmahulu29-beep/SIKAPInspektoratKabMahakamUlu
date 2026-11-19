import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {onRequestGet as dashboard} from '../functions/api/public/dashboard.js';
import {onRequestGet as connection} from '../functions/api/public/connection.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const key=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
const env={GOOGLE_SHEETS_SPREADSHEET_ID:'source-v22-test',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'qa@stub.invalid',private_key:`-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`})};
const names=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
let mode='good', googleCalls=0;
const cachedBody=JSON.stringify({year:2026,period:'annual',updatedAt:'2026-11-19T10:00:00.000Z',kpi:{totalAnggaran:1}});
let cachedMode='none';
globalThis.caches={default:{
 async match(req){const s=String(req.url);if(cachedMode==='hit'&&s.includes('public-dashboard?'))return new Response(cachedBody,{headers:{etag:'W/"fixture"','cache-control':'public,max-age=120'}});if(cachedMode==='stale'&&s.includes('public-dashboard-stale?'))return new Response(cachedBody,{headers:{'cache-control':'public,max-age=120'}});return null;},
 async put(){return undefined;}
}};
globalThis.fetch=async uri=>{
 const u=String(uri);
 if(u.includes('oauth2'))return Response.json({access_token:'qa-token',expires_in:3600});
 googleCalls++;
 if(mode==='denied')return Response.json({error:{message:'Permission denied'}},{status:403});
 if(mode==='unavailable')return Response.json({error:{message:'Backend not available'}},{status:503});
 if(u.includes('values:batchGet'))return Response.json({valueRanges:new URL(u).searchParams.getAll('ranges').map(range=>({range,values:[]}))});
 return Response.json({sheets:names.map((n,i)=>({properties:{title:`2026__${n}`,sheetId:i+1,gridProperties:{columnCount:26}}})),namedRanges:[]});
};
const base='https://public.example.invalid/api/public/dashboard?year=2026&period=annual';
let r=await dashboard({request:new Request(base+'&refresh=1'),env});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).year,2026);
r=await connection({request:new Request('https://public.example.invalid/api/public/connection?year=2026'),env});assert.equal(r.status,200);assert.equal((await r.json()).code,'GOOGLE_READ_OK');
// Browser If-None-Match can never render a blank page on 304.
cachedMode='hit';r=await dashboard({request:new Request(base,{headers:{'If-None-Match':'W/"fixture"'}}),env});assert.equal(r.status,200);assert.equal(r.headers.get('x-dashboard-cache'),'HIT');assert.equal(r.headers.get('cache-control'),'no-store');
cachedMode='none';mode='denied';
r=await dashboard({request:new Request(base+'&refresh=1'),env});assert.equal(r.status,503);assert.equal((await r.json()).code,'GOOGLE_ACCESS_DENIED');
r=await connection({request:new Request('https://public.example.invalid/api/public/connection'),env});assert.equal(r.status,503);assert.equal((await r.json()).code,'GOOGLE_ACCESS_DENIED');
mode='unavailable';googleCalls=0;
r=await dashboard({request:new Request(base+'&refresh=1'),env});assert.equal(r.status,503);assert.equal((await r.json()).code,'GOOGLE_SHEETS_UNAVAILABLE');assert.equal(googleCalls,2,'retries capped at 2, not 3 or unbounded');
cachedMode='stale';r=await dashboard({request:new Request(base+'&refresh=1'),env});assert.equal(r.status,200);assert.equal(r.headers.get('x-dashboard-cache'),'STALE');assert.equal(r.headers.get('cache-control'),'no-store');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
assert.doesNotMatch(main,/VITE_KERTAS_KERJA_URL|WORKSHEET_URL|Buka Kertas Kerja|kkkinerjainspektoaratmahakamulu/);
assert.match(main,/ConnectionPanel/);assert.match(main,/Periksa koneksi sumber/);assert.match(main,/load\(true\)/);
assert.match(css,/\.official-monev-panel\{[^}]*padding:/);assert.match(css,/\.official-monev-values\{[^}]*grid-template-columns:/);
console.log('PASS V22: independent dashboard, no operator link, latest-data retry, ETag 200, 403 diagnostics, bounded Google 503 retries, stale mark, responsive Monev CSS.');
