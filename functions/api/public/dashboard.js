import {calculateMetrics} from '../../lib/metrics.js';
import {officialReportName,summarizeOfficialMonev} from '../../lib/report-schema.js';
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
  // A partially initialized workbook may still have useful independent KPIs.
  // Return its verified indicators, never silently represent missing data as 0.
  const report=officialReportName(year);const reportTitle=resolveYearTitle(year,report,titles,period);
  const sourceEntries=reportTitle?[...resolved,{canonical:report,title:reportTitle}]:resolved;
  const colName=(index)=>{let n=index+1,s='';while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;};
  // Read enough columns for native column insertion, while avoiding a huge
  // read of many blank grid columns on every dashboard refresh.
  const ranges=sourceEntries.map(x=>{
    const sp=meta.sheets.find(s=>s.properties.title===x.title)?.properties;
    const gridColumns=sp?.gridProperties?.columnCount||26;
    const mapped=(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${sp.sheetId}_`));
    const schemaMax=mapped.length?Math.max(...mapped.map(n=>(n.range?.startColumnIndex||0)+1)):0;
    const columns=Math.max(26,Math.min(gridColumns,64),schemaMax);
    return `${quoteSheet(x.title)}!A:${colName(columns-1)}`;
  });
  const upstream=await batchGetSheets(env,ranges);
  const byName={};
  for(let i=0;i<sourceEntries.length;i++) byName[sourceEntries[i].canonical]=upstream.valueRanges?.[i]?.values||[];
  // A sheet title can exist while its cells are still entirely blank.
  // Distinguish "empty source" from a verified numerical zero.
  const emptySheets=resolved.filter(x=>!(byName[x.canonical]||[]).some(rowHasText)).map(x=>x.canonical);
  const metricSheets={};for(const x of resolved){const id=meta.sheets.find(s=>s.properties.title===x.title).properties.sheetId;metricSheets[x.canonical]={values:byName[x.canonical],schemaColumns:(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${id}_`)).map(n=>({original:Number(n.name.split('_').at(-1)),current:n.range.startColumnIndex||0}))};}
  if(reportTitle){const p=meta.sheets.find(s=>s.properties.title===reportTitle).properties;metricSheets[report]={values:byName[report],schemaColumns:(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${p.sheetId}_`)).map(n=>({original:Number(n.name.split('_').at(-1)),current:n.range.startColumnIndex||0}))};}
  const kpi=calculateMetrics(metricSheets);
  // Dependent KPIs must be explicitly unknown when their source does not exist.
  const absent=new Set([...missing,...emptySheets]);
  if(absent.has('Realisasi Fisik & Keu')) for(const field of ['totalAnggaran','realisasiKeuangan','realisasiFisik','serapan','sisaDana'])kpi[field]=null;
  if(absent.has('Rekap realisasi PKPT'))for(const field of ['penugasan','selesai','berjalan','belum','lainnya'])kpi[field]=null;
  if(absent.has('Monev output Subkegiatan Utama'))kpi.outputUtama=null;
  if(absent.has('Monev Subkegiatan Penunjang'))kpi.outputPenunjang=null;
  const monevResmi=kpi.monevResmi||summarizeOfficialMonev(null);
  const sheets=SHEETS.map(c=>{if(absent.has(c))return {name:c,percent:null,rows:null,available:false,status:missing.includes(c)?'missing':'empty'};const rows=byName[c]||[];return {name:c,percent:completeness(rows),rows:rows.filter(rowHasText).length,available:true};});
  const available=sheets.filter(s=>s.available);
  const overall=available.length?percentAverage(available.map(s=>s.percent)):null;
  if(reportTitle)sheets.push({name:report,percent:monevResmi.activities?monevResmi.reportedRealizations/monevResmi.activities*100:0,rows:byName[report]?.length||0,measure:'Realisasi kegiatan terisi'});
  return {partial:missing.length>0||emptySheets.length>0,missingSheets:missing,emptySheets,availableSheetCount:available.length,expectedSheetCount:SHEETS.length,officialReport:{name:report,available:!!reportTitle,...monevResmi},dataCoverageNote:'Persentase sheet utama adalah baris berisi teks (indikatif), bukan pemeriksaan seluruh kolom wajib.',year,period,updatedAt:new Date().toISOString(),source:'Google Sheets via Cloudflare Backend',version:'20.0-excel-monev-reload-safe',kpi,sheets,overallCompleteness:overall,formulas:{
    totalAnggaran:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    realisasiKeuangan:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    serapan:'Realisasi Keuangan ÷ Anggaran × 100', realisasiFisik:'Nilai fisik resmi/tertimbang dari sumber',
    outputUtama:'Jumlah Output pada Monev output Subkegiatan Utama', outputPenunjang:'Jumlah Output pada Monev Subkegiatan Penunjang'
  }};
}

export async function onRequestGet({request,env,context}){
  const url=new URL(request.url);
  const year=Number(url.searchParams.get('year')||2026);
  if(!Number.isInteger(year)||year<2000||year>2100) return Response.json({code:'INVALID_YEAR',error:'Tahun tidak valid'}, {status:400,headers:{'cache-control':'no-store'}});
  let period='annual';
  try {period=url.searchParams.get('period')||'annual';periodKey(period);}
  catch {return Response.json({error:'Periode tidak valid',code:'INVALID_PERIOD'},{status:400,headers:{'cache-control':'no-store'}});}
  // Include the configured spreadsheet in the cache identity so changing the
  // Google Spreadsheet ID cannot accidentally reuse old dashboard numbers.
  const sourceId=String(env?.GOOGLE_SHEETS_SPREADSHEET_ID||'');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sourceId));
  const sourceKey=Array.from(new Uint8Array(digest)).slice(0,8).map(v=>v.toString(16).padStart(2,'0')).join('');
  const forceRefresh=url.searchParams.get('refresh')==='1';
  const cache=globalThis.caches?.default;
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&sid=${sourceKey}&v=20.0`);
  const cached=cache&&!forceRefresh?await cache.match(key).catch(()=>null):null;
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    const tag=out.headers.get('etag');
    if(tag && request.headers.get('if-none-match')===tag) return new Response(null,{status:304,headers:{etag:tag,'cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20'}});
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&sid=${sourceKey}&v=20.0`);
  const cacheId=`${sourceKey}:${year}:${period}`;
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
    if(cache){
      const backgroundCache=Promise.allSettled([
        cache.put(key,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=8'}})),
        cache.put(staleKey,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=120'}}))
      ]);
      // Request work stays independent of optional Cloudflare edge-cache writes.
      if(context?.waitUntil)context.waitUntil(backgroundCache);
      else await backgroundCache;
    }
    // An edge-cache failure must never turn a successful Sheets read into 503.
    if(request.headers.get('if-none-match')===etag) return new Response(null,{status:304,headers:{etag,'cache-control':'public,max-age=2,s-maxage=8'}});
    return response;
  }catch(error){
    const stale=cache?await cache.match(staleKey).catch(()=>null):null;
    if(stale){const out=new Response(stale.body,stale);out.headers.set('x-dashboard-cache','STALE');out.headers.set('x-dashboard-warning','upstream-unavailable');return out;}
    const message=String(error?.message||'');
    const code=!sourceId||!env?.GOOGLE_SERVICE_ACCOUNT_JSON?'GOOGLE_CONFIG_MISSING'
      :error?.code==='PERIOD_NOT_INITIALIZED'?'PERIOD_NOT_INITIALIZED'
      :error?.code==='YEAR_NOT_INITIALIZED'?'YEAR_NOT_INITIALIZED'
      :message.includes('GOOGLE_SERVICE_ACCOUNT_JSON')?'GOOGLE_CREDENTIAL_INVALID'
      :message.includes('Google OAuth')?'GOOGLE_AUTH_FAILED'
      :Number(error?.status)===403?'GOOGLE_ACCESS_DENIED'
      :Number(error?.status)===404?'SPREADSHEET_NOT_FOUND'
      :message.includes('SERVICE_DISABLED')?'GOOGLE_SHEETS_API_DISABLED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'public_dashboard_error',code,message:String(error?.message||''),year,at:new Date().toISOString()}));
    return new Response(JSON.stringify({error:code==='PERIOD_NOT_INITIALIZED'?'Data periode ini belum dibuat di kertas kerja.':code==='YEAR_NOT_INITIALIZED'?'Data tahun ini belum tersedia di database pusat.':code==='GOOGLE_CONFIG_MISSING'?'Konfigurasi Google Sheets Dashboard belum lengkap. Periksa Variables & Secrets pada proyek SIKAP (Production).':code==='GOOGLE_ACCESS_DENIED'?'Service account Dashboard tidak memiliki izin membaca Google Spreadsheet pusat.':code==='SPREADSHEET_NOT_FOUND'?'ID Spreadsheet Dashboard salah atau file belum dibagikan kepada service account.':code==='GOOGLE_CREDENTIAL_INVALID'?'Kredensial JSON service account Dashboard tidak valid.':code==='GOOGLE_AUTH_FAILED'?'Autentikasi Service Account Google gagal.': 'Dashboard belum dapat mengambil data pusat.',code,missingSheets:undefined,year,period}),{status:code.includes('NOT_INITIALIZED')?404:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
}
