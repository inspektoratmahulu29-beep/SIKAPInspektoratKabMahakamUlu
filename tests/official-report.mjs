import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestGet} from '../functions/api/public/dashboard.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const privateKey=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
const env={GOOGLE_SHEETS_SPREADSHEET_ID:'report-api-test',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'test@example.invalid',private_key:`-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`})};
const originals=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
let titles=originals.map(n=>`2026__${n}`);
const cache=new Map();globalThis.caches={default:{match:async k=>cache.get(k.url)?.clone()||undefined,put:async(k,r)=>cache.set(k.url,r.clone())}};
let requested=[];
globalThis.fetch=async url=>{
 const uri=String(url);
 if(uri.includes('oauth2'))return Response.json({access_token:'mock',expires_in:3600});
 if(uri.includes('values:batchGet')){
  const ranges=new URL(uri).searchParams.getAll('ranges');requested=ranges;
  return Response.json({valueRanges:ranges.map(r=>{
   const rows=Array.from({length:22},()=>[]);
   if(r.includes('Laporan_Monev_Renaksi_2026')){
    rows[8][14]='Audit Internal';rows[8][19]=10000000;rows[8][20]=5000000;
    rows[9][14]='Monitoring';rows[9][19]=20000000;
   }
   return {range:r,values:rows};
  })});
 }
 return Response.json({namedRanges:[],sheets:titles.map((title,i)=>({properties:{title,sheetId:i+1,gridProperties:{rowCount:1000,columnCount:30}}}))});
};
const req=()=>new Request('https://test.invalid/api/public/dashboard?year=2026&period=annual');
let result=await onRequestGet({request:req(),env});assert.equal(result.status,200);
let data=await result.json();assert.equal(data.officialReport.available,false);assert.equal(data.sheets.length,14);
cache.clear();titles.push('2026__Laporan_Monev_Renaksi_2026');
result=await onRequestGet({request:req(),env});assert.equal(result.status,200);
data=await result.json();assert.equal(data.sheets.length,15);assert.equal(data.officialReport.activities,2);
assert.equal(data.officialReport.plannedBudget,30000000);assert.equal(data.officialReport.realizedBudget,5000000);
assert.equal(data.officialReport.missingRealizations,1);assert.equal(data.kpi.totalAnggaran,null,'Official report must not modify main financial KPI');
assert.ok(requested.at(-1).includes('Laporan_Monev_Renaksi_2026'));
assert.ok(requested.at(-1).includes('A:AD'),'Use actual Google Sheets dimensions when user adds columns');
console.log('PASS official dashboard: optional 15th sheet, no false annual fallback, report budget and realized values correct, no double count, adaptive read width.');
