import {sheetsMeta} from '../../lib/google.js';
const CORE=['IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)','Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'];
export async function fingerprint(value){
  if(!value)return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value).trim()));
  return Array.from(new Uint8Array(digest)).slice(0,8).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function onRequestGet({env}){
  const id=String(env?.GOOGLE_SHEETS_SPREADSHEET_ID||'').trim(),raw=env?.GOOGLE_SERVICE_ACCOUNT_JSON;
  let email=null,validKey=false;
  try{const obj=typeof raw==='string'?JSON.parse(raw):raw;email=obj?.client_email||null;validKey=Boolean(obj?.private_key&&email);}catch{}
  const info={spreadsheetFingerprint:await fingerprint(id),serviceAccountFingerprint:await fingerprint(email),googleConfigPresent:Boolean(id&&raw),credentialStructureValid:validKey,year:2026};
  const headers={'cache-control':'no-store'};
  if(!id||!raw)return Response.json({ok:false,code:'GOOGLE_CONFIG_MISSING',message:'Lengkapi GOOGLE_SHEETS_SPREADSHEET_ID dan GOOGLE_SERVICE_ACCOUNT_JSON pada proyek Dashboard Production.',...info},{status:503,headers});
  if(!validKey)return Response.json({ok:false,code:'GOOGLE_CREDENTIAL_INVALID',message:'JSON service account tidak memiliki client_email/private_key yang valid.',...info},{status:503,headers});
  try{
    const meta=await sheetsMeta(env),titles=new Set((meta.sheets||[]).map(s=>s.properties.title));
    const found=CORE.filter(n=>titles.has(`2026__${n}`)||titles.has(n));
    return Response.json({ok:true,code:found.length===14?'GOOGLE_READ_OK':'GOOGLE_READ_PARTIAL',...info,sheetCount:meta.sheets?.length||0,coreSheetsFound:found.length,coreSheetsExpected:14,missingCore:CORE.filter(n=>!found.includes(n)),officialMonevPresent:titles.has('Laporan_Monev_Renaksi_2026')||titles.has('2026__Laporan_Monev_Renaksi_2026'),message:found.length===14?'Koneksi berhasil; 14 sumber inti ditemukan.':'Google Sheets dapat dibaca, tetapi beberapa sumber KPI belum tersedia.'},{headers});
  }catch(error){
    const msg=String(error?.message||'');const code=Number(error?.status)===403?'GOOGLE_ACCESS_DENIED':Number(error?.status)===404?'SPREADSHEET_NOT_FOUND':msg.includes('Google OAuth')?'GOOGLE_AUTH_FAILED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'dashboard_connection_failed',code,googleStatus:Number(error?.status||0)}));
    return Response.json({ok:false,code,message:'Dashboard tidak dapat membaca spreadsheet menggunakan Service Account yang dikonfigurasi.',...info},{status:503,headers});
  }
}
