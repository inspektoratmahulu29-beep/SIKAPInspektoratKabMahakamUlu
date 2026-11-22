import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {extractPkptDetails} from '../functions/lib/pkpt-details.js';
import {onRequestGet} from '../functions/api/public/dashboard.js';
const src=[
 ['REKAPITULASI PENUGASAN PEMBINAAN DAN PENGAWASAN'],
 ['TAHUN ANGGARAN 2026'],[],
 ['No','Jenis Pengawasan','Rincian pelaksanaan pembinaan dan pengawan','','Pemantauan Realisasi','Irban Pengampu','Dasar Penugasan','Jenis Kegiatan','Pembebanan Biaya Penugasan','Target Output/Satuan Hasil','','Realisasi Output/Satuan Hasil','','Triwulan'],
 [],[1,2,3],
 [1,'Audit Kinerja',1,'Audit Kinerja Pelayanan Publik','Sudah','Irban I','PKPT','Audit','Pengawasan Kinerja',1,'Laporan',1,'Laporan','Jan','','',''],
 ['', '',2,'Reviu Dokumen Anggaran','Sedang Berjalan','Irban I, II & III','PKPT','Reviu','Reviu Laporan Keuangan',3,'Laporan','','Laporan','','Mei','',''],
 ['','','','Pemeriksaan Kampung','Belum','Irban II','PKPT','','Pengawasan Desa',1,'Laporan','','Laporan','','','',''],
 [],['','REALISASI OUTPUT PENUGASAN / SATUAN HASIL'],
 ['','','','Rekap bukan tugas','Sudah','Irban III'],
];
const data=extractPkptDetails({values:src});
assert.equal(data.available,true);assert.deepEqual(data.summary,{total:3,selesai:1,berjalan:1,belum:1,lainnya:0});
assert.equal(data.items[2].jenisPengawasan,'Audit Kinerja','must fill down group heading');
assert.equal(data.items[1].realisasi,null,'blank numeric output must not become zero');
assert.deepEqual(data.items[0].jadwal,['Jan','','','']);
assert.equal(data.irban.find(x=>x.label==='Irban I').total,2,'shared assignment counts every indicated Irban');
assert.equal(data.irban.find(x=>x.label==='Irban III').total,1);
assert.equal(data.items.find(x=>x.title==='Rekap bukan tugas'),undefined);
const shift=3;const shifted=src.map(row=>[...Array(shift).fill(''),...row]);
const mapped=shifted.map(row=>row);
const named=Array.from({length:18},(_,i)=>({original:i,current:i+shift}));
const moved=extractPkptDetails({values:mapped,schemaColumns:named});
assert.deepEqual(moved.items,data.items,'named-range mapping must preserve data after insertions');
const unmapped=extractPkptDetails({values:shifted});
assert.equal(unmapped.summary.total,3,'header lookup should handle inserted columns without namedRanges');
assert.equal(unmapped.items[0].title,'Audit Kinerja Pelayanan Publik');
assert.equal(extractPkptDetails({values:[]}).available,false);
assert.equal(extractPkptDetails(null).summary,null);
// Endpoint must expose the SAME status counts and rows, without disclosing notes or editable workbook.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const key=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const privateKey=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',key.privateKey)).toString('base64');
const env={GOOGLE_SHEETS_SPREADSHEET_ID:'test-pkpt',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'test@example.invalid',private_key:`-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`})};
const sources=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
globalThis.fetch=async u=>{
 const url=String(u);
 if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test-access-token',expires_in:3600});
 if(url.includes('values:batchGet'))return Response.json({valueRanges:new URL(url).searchParams.getAll('ranges').map(range=>({range,values:range.includes('Rekap%20realisasi')||range.includes('Rekap realisasi PKPT')?src:[['A','B'],['data']]}))});
 return Response.json({namedRanges:[],sheets:sources.map((name,index)=>({properties:{title:`2026__${name}`,sheetId:index+1,gridProperties:{rowCount:110,columnCount:26}}}))});
};
const res=await onRequestGet({request:new Request('https://pkpt.invalid/api/public/dashboard?year=2026&period=annual'),env});
assert.equal(res.status,200);
const snapshot=await res.json();
assert.deepEqual(snapshot.pkpt.summary,data.summary);assert.equal(snapshot.kpi.penugasan,3);assert.equal(snapshot.kpi.selesai,1);
assert.equal(snapshot.pkpt.items[1].status,'berjalan');
assert.ok(!('keterangan' in snapshot.pkpt.items[0]),'free-form remarks must not be disclosed');
console.log('PASS: PKPT master header, merged group, rows, status, Irban sharing, shifted columns, no mock data, API totals.');
