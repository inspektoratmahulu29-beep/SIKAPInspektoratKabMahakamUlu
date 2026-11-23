import { getSheetTitles, masterBridgeConfigured, masterBridgeIncomplete } from '../../lib/google.js';
import {fingerprint} from './connection.js';
const CANONICAL = [
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama',
  'Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang',
  'Rekap realisasi PKPT','Realisasi Fisik & Keu','Laporan_Monev_Renaksi_2026'
];
export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  const refresh=url.searchParams.get('refresh')==='1';
  const cache=globalThis.caches?.default;const sid=await fingerprint(masterBridgeConfigured(env)?`master:${env.KKK_MASTER_URL}`:env?.GOOGLE_SHEETS_SPREADSHEET_ID||'none');const key=new Request(`${url.origin}/__cache/public-years?v=21&sid=${sid}`);
  const cached=!refresh&&cache?await cache.match(key).catch(()=>null):null; if(cached) return new Response(cached.body,cached);
  try{
    const titles=await getSheetTitles(env);
    const years=new Set();
    for(const t of titles){
      const m=String(t).match(/^(20\d{2})__/);
      if(m) years.add(Number(m[1]));
      else if(CANONICAL.includes(t)) years.add(2026);
    }
    const response=Response.json({ok:true,years:[...years].sort((a,b)=>b-a)},{headers:{'cache-control':'public,max-age=5,s-maxage=15','x-years-cache':'MISS'}}); if(cache)await cache.put(key,response.clone()).catch(()=>{}); return response;
  }catch(e){
    const raw=String(e?.message||'');
    const code=masterBridgeIncomplete(env)?'MASTER_SYNC_CONFIG_INCOMPLETE':!masterBridgeConfigured(env)&&(!env?.GOOGLE_SHEETS_SPREADSHEET_ID||!env?.GOOGLE_SERVICE_ACCOUNT_JSON)?'GOOGLE_CONFIG_MISSING'
      :e?.code?.startsWith('MASTER_')||e?.code==='SYNC_UNAUTHORIZED'?e.code
      :Number(e?.status)===403?'GOOGLE_ACCESS_DENIED'
      :Number(e?.status)===404?'SPREADSHEET_NOT_FOUND'
      :raw.includes('OAuth')?'GOOGLE_AUTH_FAILED'
      :raw.includes('timeout')?'GOOGLE_TIMEOUT':'GOOGLE_SHEETS_UNAVAILABLE';
    return Response.json({ok:false,code,message:'Tidak dapat mengambil daftar tahun dari spreadsheet pusat.'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
