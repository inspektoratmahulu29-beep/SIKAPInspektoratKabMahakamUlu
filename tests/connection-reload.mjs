import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestGet as getDashboard} from '../functions/api/public/dashboard.js';
import {onRequestGet as getConnection} from '../functions/api/public/connection.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const privateKey=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
const env={GOOGLE_SHEETS_SPREADSHEET_ID:'faux-google-sheet',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'testing@example.invalid',private_key:`-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`})};
const names=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
let titles=names.map((name,i)=>({properties:{sheetId:i+1,title:`2026__${name}`,gridProperties:{rowCount:1000,columnCount:26}}}));
let reads=0;
globalThis.caches={default:{match:async()=>{throw new Error('Cloudflare Cache unavailable');},put:async()=>{throw new Error('Cloudflare Cache write failed');}}};
globalThis.fetch=async uri=>{
  const url=String(uri);
  if(url.includes('oauth2'))return Response.json({access_token:'test-token',expires_in:3600});
  if(url.includes('values:batchGet')){reads++;return Response.json({valueRanges:new URL(url).searchParams.getAll('ranges').map(range=>({range,values:[]}))});}
  return Response.json({sheets:titles,namedRanges:[]});
};
const url='https://test.invalid/api/public/dashboard?year=2026&period=annual&refresh=1';
let r=await getDashboard({request:new Request(url),env});assert.equal(r.status,200,'Google data must survive Cloudflare cache failure');
const body=await r.json();assert.equal(body.partial,true,'All 14 Google sheet tabs can exist but be blank');assert.equal(body.emptySheets.length,14);assert.equal(body.sheets.length,28);assert.equal(body.kpi.penugasan,null);
assert.equal(reads,1);
r=await getConnection({env});assert.equal(r.status,200);const details=await r.json();assert.equal(details.code,'GOOGLE_READ_OK');assert.equal(details.coreSheetsFound,14);assert.ok(details.spreadsheetFingerprint);
r=await getDashboard({request:new Request(url),env:{}});assert.equal(r.status,503);assert.equal((await r.json()).code,'GOOGLE_CONFIG_MISSING');
titles=titles.slice(0,1);
r=await getDashboard({request:new Request(url),env});assert.equal(r.status,200,'One valid sheet should still show partial dashboard');const part=await r.json();assert.equal(part.partial,true);assert.equal(part.availableSheetCount,0);assert.deepEqual(part.emptySheets,['IKU']);assert.equal(part.kpi.totalAnggaran,null);assert.ok(part.missingSheets.includes('Realisasi Fisik & Keu'));
console.log('PASS: force reload bypasses cache, Cloudflare cache failure is nonfatal, missing Google config is explicit, partial data never masquerades as 0, and connection diagnostics verify source presence.');
