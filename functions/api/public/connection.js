import {sheetsMeta,batchGetSheets,quoteSheet} from '../../lib/google.js';
const CORE=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
const EXTRA=['Rekap NON PKPT 2026','ST Belum Klasifikasi','Rekonsiliasi DPPA 2026','Validasi Data 2026','Dasar Indikator DPA 2026','Jadwal PKPT dan Bukti 2026','Register Bukti Capaian 2026','Audit Isian 12 Sheet 2026','Capaian Detail Penunjang 2026','ST Perlu Pemetaan Okt 2026','Ringkasan Anggaran PKPT Non','Rincian Anggaran PKPT 2026','PKPT 76 Penugasan 2026','TOTAL REKAP PKPT NON 2026'];
export async function fingerprint(value){
  if(!value)return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value).trim()));
  return Array.from(new Uint8Array(digest)).slice(0,8).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function onRequestGet({env,request}){
  const url=new URL(request?.url||'https://example.com');
  const year=Number(url.searchParams.get('year')||2026);
  const id=String(env?.GOOGLE_SHEETS_SPREADSHEET_ID||'').trim(),raw=env?.GOOGLE_SERVICE_ACCOUNT_JSON;
  let email=null,validKey=false;
  try{const obj=typeof raw==='string'?JSON.parse(raw):raw;email=obj?.client_email||null;validKey=Boolean(obj?.private_key&&email);}catch{}
  const info={spreadsheetFingerprint:await fingerprint(id),serviceAccountFingerprint:await fingerprint(email),googleConfigPresent:Boolean(id&&raw),credentialStructureValid:validKey,year};
  const headers={'cache-control':'no-store'};
  if(!id||!raw)return Response.json({ok:false,code:'GOOGLE_CONFIG_MISSING',message:'Lengkapi GOOGLE_SHEETS_SPREADSHEET_ID dan GOOGLE_SERVICE_ACCOUNT_JSON pada proyek Dashboard Production.',...info},{status:503,headers});
  if(!validKey)return Response.json({ok:false,code:'GOOGLE_CREDENTIAL_INVALID',message:'JSON service account tidak memiliki client_email/private_key yang valid.',...info},{status:503,headers});
  try{
    const meta=await sheetsMeta(env),titles=new Set((meta.sheets||[]).map(s=>s.properties.title));
    const found=CORE.filter(n=>titles.has(`${year}__${n}`)||(year===2026&&titles.has(n)));
    const required=[...CORE,`Laporan_Monev_Renaksi_${year}`,...EXTRA];
    const present=required.filter(n=>titles.has(`${year}__${n}`)||(year===2026&&titles.has(n)));
    // Validate the values endpoint too: metadata alone is not proof that KPI cells can be fetched.
    if(found.length){const first=found[0];const title=titles.has(`${year}__${first}`)?`${year}__${first}`:first;await batchGetSheets(env,[`${quoteSheet(title)}!A1:A1`]);}
    return Response.json({ok:true,code:found.length===14?'GOOGLE_READ_OK':'GOOGLE_READ_PARTIAL',...info,sheetCount:meta.sheets?.length||0,coreSheetsFound:found.length,coreSheetsExpected:14,missingCore:CORE.filter(n=>!found.includes(n)),totalSourcesFound:present.length,totalSourcesExpected:required.length,missingSources:required.filter(n=>!present.includes(n)),revisionMarkerPresent:titles.has('_KK_SYNC'),officialMonevPresent:titles.has(`${year}__Laporan_Monev_Renaksi_${year}`)||(year===2026&&titles.has('Laporan_Monev_Renaksi_2026')),message:found.length===14?'Koneksi berhasil; 14 sumber inti ditemukan.':'Google Sheets dapat dibaca, tetapi beberapa sumber KPI belum tersedia.'},{headers});
  }catch(error){
    const msg=String(error?.message||'');const status=Number(error?.status||0);const code=status===403?'GOOGLE_ACCESS_DENIED':status===404?'SPREADSHEET_NOT_FOUND':status===429?'GOOGLE_RATE_LIMITED':status===504||msg.toLowerCase().includes('timeout')?'GOOGLE_TIMEOUT':msg.includes('Google OAuth')?'GOOGLE_AUTH_FAILED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'dashboard_connection_failed',code,googleStatus:Number(error?.status||0)}));
    return Response.json({ok:false,code,message:({GOOGLE_ACCESS_DENIED:'Service account Dashboard belum diberi izin Viewer ke spreadsheet pusat.',SPREADSHEET_NOT_FOUND:'Spreadsheet ID tidak ditemukan atau tidak dapat diakses oleh akun layanan Dashboard.',GOOGLE_AUTH_FAILED:'Autentikasi service account Dashboard gagal. Periksa Secret JSON.',GOOGLE_TIMEOUT:'Google Sheets melewati batas waktu. Periksa status layanan dan coba lagi.',GOOGLE_RATE_LIMITED:'Permintaan ke Google Sheets sementara dibatasi.'})[code]||'Dashboard belum berhasil membaca Google Sheets. Periksa konfigurasi dan log Pages Functions.',...info},{status:503,headers});
  }
}
