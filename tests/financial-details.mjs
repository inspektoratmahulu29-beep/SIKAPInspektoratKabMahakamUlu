import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {extractFinancialDetails,financeNumber} from '../functions/lib/financial-details.js';
import {onRequestGet} from '../functions/api/public/dashboard.js';

const rows=[
 ['LAPORAN REALISASI FISIK DAN KEUANGAN'],['INSPEKTORAT KABUPATEN MAHAKAM ULU'],['TA 2026'],[],
 ['NO','PROGRAM/KEGIATAN/SUB KEGIATAN','ANGGARAN','BOBOT','REALISASI FISIK','','REALISASI KEUANGAN','','','SISA DANA','PERMASALAHAN'],
 ['','','','','FISIK','TERTIMBANG','KEUANGAN','KEUANGAN','TERTIMBANG','(Rp)'],
 ['','','','','(%)','','(Rp)','(%)'],
 ['1','2','3','4','5','6','7','8','9','10','11'],
 [],
 ['I','INSPEKTORAT',3000,100,66,66,1800,60,60,1200,'catatan privat'],
 ['1','PROGRAM PENGAWASAN',1800,60,60,36,900,50,30,900],
 ['', 'Pengawasan Layanan',1000,55.56,40,22.22,300,30,16.67,700],
 ['', 'Sub Kegiatan Audit Sekolah',800,44.44,80,35.55,600,75,33.33,200],
 [],
 ['2','PROGRAM PEMBINAAN',1200,40,70,28,900,75,30,300],
 ['', 'Pendampingan Kampung',1200,100,70,70,900,75,75,300],
 ['JUMLAH BELANJA','',3000,100,66,66,1800,60,60,1200],
 ['', 'Bendahara Pengeluaran'],
];
const extracted=extractFinancialDetails({values:rows});
assert.equal(extracted.available,true);
assert.equal(extracted.counts.program,2);assert.equal(extracted.counts.rincian,3);
assert.equal(extracted.summary.anggaran,3000);
assert.equal(extracted.summary.realisasiKeuangan,1800);
assert.equal(extracted.summary.realisasiFisik,66,'must use original E, not G/C or average row');
assert.equal(extracted.summary.sisaDana,1200);
assert.equal(extracted.programs[0].items[1].jenis,'subkegiatan');
assert.equal(extracted.programs[0].items[0].jenis,'rincian','do not invent activity level');
assert.equal(extracted.programs[0].items[0].realisasiKeuangan,300);
assert.equal(extracted.programs[1].items.length,1);
assert.equal(extracted.reconciliation.selisihAnggaran,0);
assert.equal(extracted.reconciliation.selisihRealisasi,0);
assert.ok(!JSON.stringify(extracted).includes('catatan privat'),'do not disclose K free-form problems');
assert.equal(extracted.programs.find(x=>x.name==='Bendahara Pengeluaran'),undefined);
assert.equal(financeNumber('Rp 28.172.392.109'),28172392109);
assert.equal(financeNumber('81,192%'),81.192);
assert.equal(financeNumber('81.192',true),81.192);
assert.equal(financeNumber('1.234,55'),1234.55);
assert.equal(financeNumber('#REF!'),null);
const shifted=rows.map(r=>['','','',...r]);
const mapping=Array.from({length:11},(_,original)=>({original,current:original+3}));
assert.deepEqual(extractFinancialDetails({values:shifted,schemaColumns:mapping}).programs,extracted.programs,'named-range column mapping');
assert.equal(extractFinancialDetails({values:shifted}).summary.anggaran,3000,'header autodetection on inserted columns');
const midInsert=rows.map(r=>[...r.slice(0,5),'',...r.slice(5)]);
assert.equal(extractFinancialDetails({values:midInsert}).summary.serapanKeuangan,60,'shifted adjacent percent column must not read rupiah as percentage');
const extra=rows.map(x=>[...x]);
extra.splice(16,0,['','Tambahan Kegiatan',300,null,0,null,0,0,0,300]);
const extraData=extractFinancialDetails({values:extra});
assert.equal(extraData.counts.rincian,4,'inserted new rows must be reflected');
assert.equal(extraData.programs[1].items.length,2);
const blank=rows.map(x=>[...x]);blank[12][6]='';blank[12][9]='';
const missing=extractFinancialDetails({values:blank});
assert.equal(missing.programs[0].items[1].realisasiKeuangan,null,'blank financial must not become Rp0');
assert.equal(missing.programs[0].items[1].sisaDana,null,'do not calculate remaining without a number');
const broken=rows.map(x=>[...x]);broken[14][2]=1600;
const diff=extractFinancialDetails({values:broken});
assert.equal(diff.reconciliation.selisihAnggaran,-400);
assert.ok(diff.notes.some(n=>n.includes('berbeda')));
// The actual editor layout can contain hierarchical codes (1.1, 1.2),
// followed by uncoded children. Reflect source sequence without inventing codes.
const structured=rows.map(x=>[...x]);
structured[11][0]='1.1';
structured[12][0]='';
structured[12][1]='Audit Sekolah';
const grouped=extractFinancialDetails({values:structured});
assert.equal(grouped.programs[0].items[0].jenis,'kegiatan');
assert.equal(grouped.programs[0].items[1].jenis,'subkegiatan');
assert.equal(grouped.programs[0].items[1].jenisDariUrutan,true);
assert.equal(grouped.programs[0].items[1].parentId,grouped.programs[0].items[0].id);
assert.equal(grouped.programs[0].items[1].parentName,'Pengawasan Layanan');
assert.equal(grouped.counts.kegiatan,1);
assert.equal(grouped.counts.subkegiatan,1);
assert.ok(grouped.notes.some(x=>x.includes('dikelompokkan')));
assert.equal(grouped.summary.anggaran,3000,'hierarchical grouping must not change official KPI');
assert.equal(extractFinancialDetails({values:[]}).available,false);
assert.equal(extractFinancialDetails({values:[['NO','something']]}).available,false);

// Snapshot integration with real API shape. Test that totals and details agree,
// with no duplicate additions of the summary/program/detail rows.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pk=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
const env={GOOGLE_SHEETS_SPREADSHEET_ID:'financial-explorer-test',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'test@example.invalid',private_key:`-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----`})};
const sources=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
globalThis.fetch=async url=>{
 const path=String(url);
 if(path.includes('oauth2'))return Response.json({access_token:'financial-test',expires_in:3600});
 if(path.includes('values:batchGet'))return Response.json({valueRanges:new URL(path).searchParams.getAll('ranges').map(range=>({range,values:range.includes('Realisasi%20Fisik')||range.includes('Realisasi Fisik')?rows:[['Dummy header'],['test']]}))});
 return Response.json({namedRanges:[],sheets:sources.map((name,i)=>({properties:{title:`2026__${name}`,sheetId:i+1,gridProperties:{rowCount:110,columnCount:26}}}))});
};
const result=await onRequestGet({request:new Request('https://financial-test.invalid/api/public/dashboard?year=2026&period=annual'),env});
assert.equal(result.status,200);
const json=await result.json();
assert.equal(json.financialDetails.counts.program,2);
assert.equal(json.financialDetails.summary.anggaran,json.kpi.totalAnggaran);
assert.equal(json.financialDetails.summary.realisasiKeuangan,json.kpi.realisasiKeuangan);
assert.equal(json.financialDetails.summary.realisasiFisik,json.kpi.realisasiFisik);
assert.equal(json.financialDetails.programs[0].items.length,2);
assert.ok(!JSON.stringify(json.financialDetails).includes('catatan privat'));
console.log('PASS: finance master rows, currencies, physical source, program-child aggregation, inserted rows/columns, missing values, API integration, private notes.');
