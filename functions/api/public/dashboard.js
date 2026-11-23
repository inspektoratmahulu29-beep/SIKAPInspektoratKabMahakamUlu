import {calculateMetrics} from '../../lib/metrics.js';
import {extractPkptDetails} from '../../lib/pkpt-details.js';
import {extractFinancialDetails} from '../../lib/financial-details.js';
import {buildIntegratedDetails} from '../../lib/integrated-details.js';
import {officialReportName,summarizeOfficialMonev} from '../../lib/report-schema.js';
import { getSheetTitles, sheetsMeta, batchGetSheets, quoteSheet, masterBridgeConfigured, masterBridgeIncomplete, masterSourceMode } from '../../lib/google.js';

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
const EXTRA_SHEETS = [
  'Rekap NON PKPT 2026','ST Belum Klasifikasi','Rekonsiliasi DPPA 2026',
  'Validasi Data 2026','Dasar Indikator DPA 2026','Jadwal PKPT dan Bukti 2026',
  'Register Bukti Capaian 2026','Audit Isian 12 Sheet 2026',
  'Capaian Detail Penunjang 2026','ST Perlu Pemetaan Okt 2026',
  'Ringkasan Anggaran PKPT Non','Rincian Anggaran PKPT 2026','TOTAL REKAP PKPT NON 2026'
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
  let meta;try{meta=await sheetsMeta(env);}catch(e){e.stage='metadata';throw e;}
  const titles=meta.sheets.map(s=>s.properties.title);
  const report=officialReportName(year);
  const sourceNames=[...SHEETS,report,...EXTRA_SHEETS];
  const resolved=sourceNames.map(c=>({canonical:c,title:resolveYearTitle(year,c,titles,period)})).filter(x=>x.title);
  if(!resolved.length) throw Object.assign(new Error(period==='annual'?'YEAR_NOT_INITIALIZED':'PERIOD_NOT_INITIALIZED'),{code:period==='annual'?'YEAR_NOT_INITIALIZED':'PERIOD_NOT_INITIALIZED'});
  const missing=sourceNames.filter(c=>!resolved.some(x=>x.canonical===c));
  // A partially initialized workbook may still have useful independent KPIs.
  // Return its verified indicators, never silently represent missing data as 0.
  const reportTitle=resolveYearTitle(year,report,titles,period);
  const sourceEntries=resolved;
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
  let upstream;try{upstream=await batchGetSheets(env,ranges);}catch(e){e.stage='values';throw e;}
  const byName={};
  const failedReadEntries=(upstream.failedRanges||[]).map(x=>({sheet:sourceEntries[x.index]?.canonical||'',code:x.code})).filter(x=>x.sheet);
  const readFailureSet=new Set(failedReadEntries.map(x=>x.sheet));
  for(let i=0;i<sourceEntries.length;i++) byName[sourceEntries[i].canonical]=upstream.valueRanges?.[i]?.values||[];
  // A sheet title can exist while its cells are still entirely blank.
  // Distinguish "empty source" from a verified numerical zero.
  const emptySheets=resolved.filter(x=>!readFailureSet.has(x.canonical)&&!(byName[x.canonical]||[]).some(rowHasText)).map(x=>x.canonical);
  const metricSheets={};for(const x of resolved){const id=meta.sheets.find(s=>s.properties.title===x.title).properties.sheetId;metricSheets[x.canonical]={values:byName[x.canonical],schemaColumns:(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${id}_`)).map(n=>({original:Number(n.name.split('_').at(-1)),current:n.range.startColumnIndex||0}))};}
  if(reportTitle){const p=meta.sheets.find(s=>s.properties.title===reportTitle).properties;metricSheets[report]={values:byName[report],schemaColumns:(meta.namedRanges||[]).filter(n=>n.name.startsWith(`KKCOL_${year}_${p.sheetId}_`)).map(n=>({original:Number(n.name.split('_').at(-1)),current:n.range.startColumnIndex||0}))};}
  const formulaErrors=[];let formulaErrorCount=0;const invalidSourceSheets=new Set();
  const errorToken=/^#(?:REF!|ERROR!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)(?:.*)?$/i;
  for(const entry of sourceEntries){
    const cells=byName[entry.canonical]||[];
    for(let row=0;row<cells.length;row++)for(let col=0;col<(cells[row]||[]).length;col++){
      const value=cells[row][col];
      if(typeof value==='string'&&errorToken.test(value.trim())){
        formulaErrorCount++;invalidSourceSheets.add(entry.canonical);if(formulaErrors.length<20)formulaErrors.push({sheet:entry.canonical,row:row+1,column:col+1,error:value.trim()});
      }
    }
  }
  const kpi=calculateMetrics(metricSheets);
  const pkpt=extractPkptDetails(metricSheets['Rekap realisasi PKPT']);
  const financialDetails=extractFinancialDetails(metricSheets['Realisasi Fisik & Keu']);
  // Dependent KPIs must be explicitly unknown when their source does not exist.
  const absent=new Set([...missing,...emptySheets,...failedReadEntries.map(x=>x.sheet)]);
  if(absent.has('Realisasi Fisik & Keu')||invalidSourceSheets.has('Realisasi Fisik & Keu')){
    for(const field of ['totalAnggaran','realisasiKeuangan','realisasiFisik','serapan','sisaDana'])kpi[field]=null;
    financialDetails.available=false;financialDetails.summary=null;financialDetails.programs=[];
    financialDetails.notes=['Data keuangan dan fisik belum valid; periksa kelengkapan sheet dan rumus sumber.'];
  }
  if(absent.has('Rekap realisasi PKPT')||invalidSourceSheets.has('Rekap realisasi PKPT')){
    for(const field of ['penugasan','selesai','berjalan','belum','lainnya'])kpi[field]=null;
    pkpt.available=false;pkpt.items=[];pkpt.summary=null;pkpt.irban=[];pkpt.kegiatan=[];pkpt.pengawasan=[];
  }else{
    // Summary and detail must always describe the exact same PKPT rows.
    for(const [target,field] of [['penugasan','total'],['selesai','selesai'],['berjalan','berjalan'],['belum','belum'],['lainnya','lainnya']])kpi[target]=pkpt.summary[field];
  }
  if(absent.has('Monev output Subkegiatan Utama')||invalidSourceSheets.has('Monev output Subkegiatan Utama'))kpi.outputUtama=null;
  if(absent.has('Monev Subkegiatan Penunjang')||invalidSourceSheets.has('Monev Subkegiatan Penunjang'))kpi.outputPenunjang=null;
  const monevResmi=kpi.monevResmi||summarizeOfficialMonev(null);
  let integrated=null,insightsError=null;
  try{integrated=buildIntegratedDetails(metricSheets,sourceNames);}
  catch(error){
    // A new/shifted workbook column must not take down the 14 core KPIs.
    insightsError='DETAIL_PARSING_FAILED';
    console.error(JSON.stringify({event:'dashboard_detail_parse_failed',code:insightsError,error:String(error?.message||'').slice(0,120)}));
  }
  // Public drilldowns must not show empty/zero when a source could not be read.
  if(integrated&&failedReadEntries.length){
    integrated.sheetList=(integrated.sheetList||[]).map(item=>readFailureSet.has(item.name)?{...item,available:false,rows:null,error:'READ_FAILED'}:item);
    if(readFailureSet.has('Rekap realisasi PKPT')){integrated.agendaSourceAvailable=false;integrated.agenda=[];integrated.pkptFundingGroups=[];integrated.pkptExecution=[];}
    if(readFailureSet.has('Rekap NON PKPT 2026')){integrated.nonPkptSourceAvailable=false;integrated.nonPkptCount=null;integrated.nonPkpt=[];integrated.nonPkptFundingGroups=[];}
    if(readFailureSet.has('Rincian Anggaran PKPT 2026')){integrated.pkptPackageBudgetTotal=null;integrated.budgetPackages=[];}
    if(readFailureSet.has('TOTAL REKAP PKPT NON 2026'))integrated.unique=null;
    if(readFailureSet.has('Rekonsiliasi DPPA 2026')){integrated.dppaDifference=null;integrated.dppaSourceAvailable=false;integrated.dppaDifferences=[];}
    if(readFailureSet.has('Jadwal PKPT dan Bukti 2026')) integrated.scheduleCount=null;
  }
  if(integrated&&(absent.has('Realisasi Fisik & Keu')||invalidSourceSheets.has('Realisasi Fisik & Keu'))){
    integrated.financialLedger={available:false,total:null,programs:[],difference:null,reason:'Laporan Realisasi Fisik & Keu tidak dapat digunakan atau masih gagal dibaca'};
    integrated.financialAuthority=null;
    for(const group of [...(integrated.pkptFundingGroups||[]),...(integrated.nonPkptFundingGroups||[])]){
      group.financeMatched=false;
      group.financeWarning='Laporan realisasi tidak dapat dibaca; nilai dari ringkasan belum diverifikasi ke master.';
    }
  }
  const sheets=sourceNames.map(c=>{if(absent.has(c))return {name:c,percent:null,rows:null,available:false,status:missing.includes(c)?'missing':readFailureSet.has(c)?'read-failed':'empty'};const rows=byName[c]||[];return {name:c,percent:completeness(rows),rows:rows.filter(rowHasText).length,available:true};});
  const available=sheets.filter(s=>s.available);
  const overall=available.length?percentAverage(available.map(s=>s.percent)):null;

  return {pkpt,financialDetails,integrated,insightsError,failedReadSheets:failedReadEntries,sourceMode:masterSourceMode(env),formulaHealth:{errorsFound:formulaErrorCount,examples:formulaErrors},partial:missing.length>0||emptySheets.length>0||failedReadEntries.length>0||!!insightsError,missingSheets:missing,emptySheets,availableSheetCount:available.length,expectedSheetCount:sourceNames.length,officialReport:{name:report,available:!!reportTitle,...monevResmi},dataCoverageNote:'Persentase sheet utama adalah baris berisi teks (indikatif), bukan pemeriksaan seluruh kolom wajib.',year,period,updatedAt:new Date().toISOString(),source:masterBridgeConfigured(env)?'Kertas Kerja Master via backend aman':'Google Sheets via Cloudflare Backend',version:'26.1-resilient-snapshot',kpi,sheets,overallCompleteness:overall,formulas:{
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
  const sourceId=masterBridgeConfigured(env)?`bridge:${String(env.KKK_MASTER_URL||'').trim()}`:String(env?.GOOGLE_SHEETS_SPREADSHEET_ID||'');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sourceId));
  const sourceKey=Array.from(new Uint8Array(digest)).slice(0,8).map(v=>v.toString(16).padStart(2,'0')).join('');
  const forceRefresh=url.searchParams.get('refresh')==='1';
  const cache=globalThis.caches?.default;
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&sid=${sourceKey}&v=27.0`);
  const cached=cache&&!forceRefresh?await cache.match(key).catch(()=>null):null;
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    out.headers.set('cache-control','no-store');
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&sid=${sourceKey}&v=27.0`);
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
    const response=new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','etag':etag,'x-data-source':'google-sheets','x-dashboard-cache':'MISS','x-physical-kpi-source':physicalKpiSource,'x-physical-kpi-rule':'official-E-value-only-no-estimation'}});
    if(cache){
      const backgroundCache=Promise.allSettled([
        cache.put(key,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=4'}})),
        cache.put(staleKey,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=90'}}))
      ]);
      // Request work stays independent of optional Cloudflare edge-cache writes.
      if(context?.waitUntil)context.waitUntil(backgroundCache);
      else await backgroundCache;
    }
    // An edge-cache failure must never turn a successful Sheets read into 503.
    return response;
  }catch(error){
    const stale=cache?await cache.match(staleKey).catch(()=>null):null;
    if(stale){const out=new Response(stale.body,stale);out.headers.set('x-dashboard-cache','STALE');out.headers.set('x-dashboard-warning','upstream-unavailable');out.headers.set('cache-control','no-store');return out;}
    const message=String(error?.message||'');
    const code=masterBridgeIncomplete(env)?'MASTER_SYNC_CONFIG_INCOMPLETE':(!masterBridgeConfigured(env)&&(!sourceId||!env?.GOOGLE_SERVICE_ACCOUNT_JSON))?'GOOGLE_CONFIG_MISSING'
      :error?.code?.startsWith('MASTER_')||error?.code==='SYNC_UNAUTHORIZED'?error.code
      :error?.code==='PERIOD_NOT_INITIALIZED'?'PERIOD_NOT_INITIALIZED'
      :error?.code==='YEAR_NOT_INITIALIZED'?'YEAR_NOT_INITIALIZED'
      :message.includes('GOOGLE_SERVICE_ACCOUNT_JSON')||message.includes('atob')||message.includes('pkcs8')||message.includes('InvalidCharacter')?'GOOGLE_CREDENTIAL_INVALID'
      :Number(error?.status)===401||Number(error?.status)===400&&message.includes('Google OAuth')?'GOOGLE_AUTH_FAILED'
      :message.includes('Google OAuth')&&Number(error?.status)!==504?'GOOGLE_AUTH_FAILED'
      :message.includes('SERVICE_DISABLED')?'GOOGLE_SHEETS_API_DISABLED'
      :Number(error?.status)===403?'GOOGLE_ACCESS_DENIED'
      :Number(error?.status)===404?'SPREADSHEET_NOT_FOUND'
      :Number(error?.status)===400?'GOOGLE_RANGE_INVALID'
      :Number(error?.status)===504||message.toLowerCase().includes('timeout')?'GOOGLE_TIMEOUT'
      :Number(error?.status)===429?'GOOGLE_RATE_LIMITED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'public_dashboard_error',code,stage:error?.stage||'unknown',httpStatus:Number(error?.status||0),message:String(error?.message||''),year,period,at:new Date().toISOString()}));
    return new Response(JSON.stringify({error:code==='PERIOD_NOT_INITIALIZED'?'Data periode ini belum dibuat di kertas kerja.':code==='YEAR_NOT_INITIALIZED'?'Data tahun ini belum tersedia di database pusat.':code==='GOOGLE_CONFIG_MISSING'?'Konfigurasi Google Sheets Dashboard belum lengkap. Periksa Variables & Secrets pada proyek SIKAP (Production).':code==='GOOGLE_ACCESS_DENIED'?'Service account Dashboard tidak memiliki izin membaca Google Spreadsheet pusat.':code==='SPREADSHEET_NOT_FOUND'?'ID Spreadsheet Dashboard salah atau file belum dibagikan kepada service account.':code==='GOOGLE_CREDENTIAL_INVALID'?'Kredensial JSON service account Dashboard tidak valid.':code==='GOOGLE_AUTH_FAILED'?'Autentikasi Service Account Google gagal.':code==='GOOGLE_TIMEOUT'?'Pembacaan Google Sheets melampaui batas waktu. Coba lagi setelah beberapa saat.':code==='GOOGLE_RATE_LIMITED'?'Batas permintaan Google Sheets sementara tercapai; dashboard akan mencoba lagi secara berkala.':code==='MASTER_SYNC_CONFIG_INCOMPLETE'?'Konfigurasi jembatan master belum lengkap. Isi KKK_MASTER_URL dan SIKAP_SYNC_SECRET di SIKAP.':code==='MASTER_SYNC_UNAUTHORIZED'||code==='SYNC_UNAUTHORIZED'?'Secret sinkronisasi SIKAP dan Kertas Kerja berbeda atau belum diatur.':code==='MASTER_GOOGLE_UNAVAILABLE'||code==='MASTER_SYNC_UNAVAILABLE'?'Backend Kertas Kerja belum dapat melayani pembacaan. Periksa endpoint sinkronisasi dan log KKK.':code==='MASTER_SYNC_TIMEOUT'?'Pembacaan melalui Web Kertas Kerja melampaui batas waktu.':code==='GOOGLE_RANGE_INVALID'?'Google Sheets menolak range data. Jalankan diagnostik sumber untuk memeriksa perubahan nama sheet.':'Dashboard belum dapat membaca Google Sheets. Jalankan pemeriksaan sumber pada halaman Dashboard untuk mengetahui penyebab koneksi.',code,stage:error?.stage||'unknown',year,period,sourceMode:masterSourceMode(env)}),{status:code.includes('NOT_INITIALIZED')?404:(code==='GOOGLE_RATE_LIMITED'?429:503),headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','retry-after':code==='GOOGLE_RATE_LIMITED'?'15':'5'}});
  }
}
