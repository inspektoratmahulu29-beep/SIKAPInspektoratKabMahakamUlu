import {calculateMetrics} from '../../lib/metrics.js';
import { getSheetTitles, sheetsMeta, batchGetSheets, quoteSheet } from '../../lib/google.js';

const inflight = new Map();
const RANGE_END = {
  'IKU':'L','Rencana Aksi':'M','Capaian Sasaran Strategis':'K','Capaian Sasaran Program':'L',
  'Capaian Sasaran Kegiatan Utama':'M','Capaian Sasaran Kegiatan(Penun)':'N','Capaian Sasaran SUBKegiatan(U)':'N',
  'Capaian Sasaran SUBKegiatan (P)':'O','Monev Renaksi IKU':'M','Monev Program':'O',
  'Monev output Subkegiatan Utama':'L','Monev Subkegiatan Penunjang':'K','Rekap realisasi PKPT':'E','Realisasi Fisik & Keu':'K'
};

const SHEETS = [
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program',
  'Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)',
  'Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama',
  'Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'
];
const num = v => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim().replace(/\s/g,'');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) return Number(s.replace(/\./g,'').replace(',','.'));
  if ((s.match(/\./g)||[]).length > 1) return Number(s.replace(/\./g,''));
  return Number(s.replace(',','.'));
};
const text = v => String(v ?? '').replace(/\s+/g,' ').trim();
const validNum = v => Number.isFinite(v);
const pct = v => Number.isFinite(v) ? Math.max(0, Math.min(v,100)) : 0;
const rowHasText = r => (r||[]).some(v => text(v));
const percentAverage = vals => vals.length ? pct(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;

function resolveYearTitle(year, canonical, titles) {
  const pref = `${Number(year)}__${canonical}`;
  return titles.includes(pref) ? pref : (Number(year)===2026 && titles.includes(canonical) ? canonical : null);
}

function completeness(rows){return rows.length?pct(rows.filter(rowHasText).length/rows.length*100):0;}

async function buildSnapshot(env, year) {
  const meta=await sheetsMeta(env);const titles=meta.sheets.map(s=>s.properties.title);
  const resolved=SHEETS.map(c=>({canonical:c,title:resolveYearTitle(year,c,titles)})).filter(x=>x.title);
  if(!resolved.length) throw Object.assign(new Error('YEAR_NOT_INITIALIZED'),{code:'YEAR_NOT_INITIALIZED'});
  const ranges=resolved.map(x=>`${quoteSheet(x.title)}!A:ZZ`);
  const upstream=await batchGetSheets(env,ranges);
  const byName={};
  for(let i=0;i<resolved.length;i++) byName[resolved[i].canonical]=upstream.valueRanges?.[i]?.values||[];
  const metricSheets={};for(const x of resolved){const id=meta.sheets.find(s=>s.properties.title===x.title).properties.sheetId;metricSheets[x.canonical]={values:byName[x.canonical],schemaColumns:(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${id}_`)).map(n=>({original:Number(n.name.split('_').at(-1)),current:n.range.startColumnIndex||0}))};}
  const kpi=calculateMetrics(metricSheets);
  const sheets=SHEETS.map(c=>{const rows=byName[c]||[];return {name:c,percent:completeness(rows),rows:rows.filter(rowHasText).length};});
  const overall=sheets.length?percentAverage(sheets.map(s=>s.percent)):0;
  return {year,updatedAt:new Date().toISOString(),source:'Google Sheets via Cloudflare Backend',version:'16.0-pkpt-canonical-web1',kpi,sheets,overallCompleteness:overall,formulas:{
    totalAnggaran:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    realisasiKeuangan:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    serapan:'Realisasi Keuangan ÷ Anggaran × 100', realisasiFisik:'Nilai fisik resmi/tertimbang dari sumber',
    outputUtama:'Jumlah Output pada Monev output Subkegiatan Utama', outputPenunjang:'Jumlah Output pada Monev Subkegiatan Penunjang'
  }};
}

export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  const year=Math.min(2100,Math.max(2000,Number(url.searchParams.get('year')||2026)));
  const cache=caches.default;
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&v=16.0`);
  const cached=await cache.match(key);
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    const tag=out.headers.get('etag');
    if(tag && request.headers.get('if-none-match')===tag) return new Response(null,{status:304,headers:{etag:tag,'cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20'}});
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&v=16.0`);
  let build=inflight.get(year);
  if(!build){
    build=(async()=>{
      const data=await buildSnapshot(env,year);
      const body=JSON.stringify(data);
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
      const etag=`W/"${Array.from(new Uint8Array(hash)).slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('')}"`;
      return {body,etag};
    })().finally(()=>inflight.delete(year));
    inflight.set(year,build);
  }
  try{
    const {body,etag}=await build;
    const physicalKpiSource = (() => { try { return JSON.parse(body)?.kpi?.realisasiFisik != null ? (JSON.parse(body)?.kpi?.physicalSource || 'same-snapshot') : 'missing'; } catch { return 'unknown'; } })();
    const response=new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20','cdn-cache-control':'public,s-maxage=8,stale-while-revalidate=20','etag':etag,'x-data-source':'google-sheets','x-dashboard-cache':'MISS','x-physical-kpi-source':physicalKpiSource,'x-physical-kpi-rule':'E-primary-H-fallback-GC-recovery'}});
    await Promise.all([
      cache.put(key,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=8'}})),
      cache.put(staleKey,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=120'}}))
    ]);
    if(request.headers.get('if-none-match')===etag) return new Response(null,{status:304,headers:{etag,'cache-control':'public,max-age=2,s-maxage=8'}});
    return response;
  }catch(error){
    const stale=await cache.match(staleKey);
    if(stale){const out=new Response(stale.body,stale);out.headers.set('x-dashboard-cache','STALE');out.headers.set('x-dashboard-warning','upstream-unavailable');return out;}
    const code=error?.code==='YEAR_NOT_INITIALIZED'?'YEAR_NOT_INITIALIZED':String(error?.message||'').includes('SERVICE_DISABLED')?'GOOGLE_SHEETS_API_DISABLED':String(error?.message||'').includes('Google OAuth')?'GOOGLE_AUTH_FAILED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'public_dashboard_error',code,message:String(error?.message||''),year,at:new Date().toISOString()}));
    return new Response(JSON.stringify({error:code==='YEAR_NOT_INITIALIZED'?'Data tahun ini belum tersedia di database pusat.':'Dashboard belum dapat mengambil data pusat.',code,year}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
}
