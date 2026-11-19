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

function periodKey(value='annual'){
 const p=String(value||'annual').toLowerCase();
 if(p==='annual')return '';
 if(/^month-(0[1-9]|1[0-2])$/.test(p))return `M${p.slice(-2)}__`;
 if(/^quarter-[1-4]$/.test(p))return `Q${p.slice(-1)}__`;
 if(/^semester-[1-2]$/.test(p))return `S${p.slice(-1)}__`;
 throw Object.assign(new Error('INVALID_PERIOD'),{code:'INVALID_PERIOD'});
}
function resolveYearTitle(year, canonical, titles, period='annual') {
  const code=periodKey(period);
  if(code)return titles.find(t=>t.toLowerCase()===`${Number(year)}__${code}${canonical}`.toLowerCase())||null;

  const pref = `${Number(year)}__${canonical}`;
  return titles.includes(pref) ? pref : (Number(year)===2026 && titles.includes(canonical) ? canonical : null);
}

function completeness(rows){return rows.length?pct(rows.filter(rowHasText).length/rows.length*100):0;}

async function buildSnapshot(env, year, period='annual') {
  const meta=await sheetsMeta(env);const titles=meta.sheets.map(s=>s.properties.title);
  const resolved=SHEETS.map(c=>({canonical:c,title:resolveYearTitle(year,c,titles,period)})).filter(x=>x.title);
  if(!resolved.length) throw Object.assign(new Error(period==='annual'?'YEAR_NOT_INITIALIZED':'PERIOD_NOT_INITIALIZED'),{code:period==='annual'?'YEAR_NOT_INITIALIZED':'PERIOD_NOT_INITIALIZED'});
  const missing=SHEETS.filter(c=>!resolved.some(x=>x.canonical===c));
  if(missing.length) throw Object.assign(new Error('SHEETS_INCOMPLETE'),{code:'SHEETS_INCOMPLETE',missing});
  const ranges=resolved.map(x=>`${quoteSheet(x.title)}!A:ZZ`);
  const upstream=await batchGetSheets(env,ranges);
  const byName={};
  for(let i=0;i<resolved.length;i++) byName[resolved[i].canonical]=upstream.valueRanges?.[i]?.values||[];
  const metricSheets={};for(const x of resolved){const id=meta.sheets.find(s=>s.properties.title===x.title).properties.sheetId;metricSheets[x.canonical]={values:byName[x.canonical],schemaColumns:(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${id}_`)).map(n=>({original:Number(n.name.split('_').at(-1)),current:n.range.startColumnIndex||0}))};}
  const kpi=calculateMetrics(metricSheets);
  const sheets=SHEETS.map(c=>{const rows=byName[c]||[];return {name:c,percent:completeness(rows),rows:rows.filter(rowHasText).length};});
  const overall=sheets.length?percentAverage(sheets.map(s=>s.percent)):0;
  return {year,period,updatedAt:new Date().toISOString(),source:'Google Sheets via Cloudflare Backend',version:'16.0-pkpt-canonical-web1',kpi,sheets,overallCompleteness:overall,formulas:{
    totalAnggaran:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    realisasiKeuangan:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    serapan:'Realisasi Keuangan ÷ Anggaran × 100', realisasiFisik:'Nilai fisik resmi/tertimbang dari sumber',
    outputUtama:'Jumlah Output pada Monev output Subkegiatan Utama', outputPenunjang:'Jumlah Output pada Monev Subkegiatan Penunjang'
  }};
}

export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  const year=Number(url.searchParams.get('year')||2026);
  if(!Number.isInteger(year)||year<2000||year>2100) return Response.json({code:'INVALID_YEAR',error:'Tahun tidak valid'}, {status:400,headers:{'cache-control':'no-store'}});
  let period='annual';
  try {period=url.searchParams.get('period')||'annual';periodKey(period);}
  catch {return Response.json({error:'Periode tidak valid',code:'INVALID_PERIOD'},{status:400,headers:{'cache-control':'no-store'}});}
  const cache=caches.default;
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&v=17.0`);
  const cached=await cache.match(key);
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    const tag=out.headers.get('etag');
    if(tag && request.headers.get('if-none-match')===tag) return new Response(null,{status:304,headers:{etag:tag,'cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20'}});
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&v=17.0`);
  const cacheId=`${year}:${period}`;
  let build=inflight.get(cacheId);
  if(!build){
    build=(async()=>{
      const data=await buildSnapshot(env,year,period);
      const body=JSON.stringify(data);
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
      const etag=`W/"${Array.from(new Uint8Array(hash)).slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('')}"`;
      return {body,etag};
    })().finally(()=>inflight.delete(cacheId));
    inflight.set(cacheId,build);
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
    const code=error?.code==='SHEETS_INCOMPLETE'?'SHEETS_INCOMPLETE':error?.code==='PERIOD_NOT_INITIALIZED'?'PERIOD_NOT_INITIALIZED':error?.code==='YEAR_NOT_INITIALIZED'?'YEAR_NOT_INITIALIZED':String(error?.message||'').includes('SERVICE_DISABLED')?'GOOGLE_SHEETS_API_DISABLED':String(error?.message||'').includes('Google OAuth')?'GOOGLE_AUTH_FAILED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'public_dashboard_error',code,message:String(error?.message||''),year,at:new Date().toISOString()}));
    return new Response(JSON.stringify({error:code==='PERIOD_NOT_INITIALIZED'?'Data periode ini belum dibuat di kertas kerja.':code==='YEAR_NOT_INITIALIZED'?'Data tahun ini belum tersedia di database pusat.':code==='SHEETS_INCOMPLETE'?'Sebagian sheet sumber belum tersedia. Rekap belum dapat dipercaya.':'Dashboard belum dapat mengambil data pusat.',code,missingSheets:error?.code==='SHEETS_INCOMPLETE'?error.missing:undefined,year,period}),{status:code.includes('NOT_INITIALIZED')?404:code==='SHEETS_INCOMPLETE'?409:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
}
