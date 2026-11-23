/** Actual reporting periods available in the *same* spreadsheet used by SIKAP.
 * A calendar month is not a reporting snapshot unless its sheet prefix exists.
 */
const CORE = new Set([
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program',
  'Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)',
  'Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama',
  'Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu',
  'Rekap NON PKPT 2026','ST Belum Klasifikasi','Rekonsiliasi DPPA 2026',
  'Validasi Data 2026','Dasar Indikator DPA 2026','Jadwal PKPT dan Bukti 2026',
  'Register Bukti Capaian 2026','Audit Isian 12 Sheet 2026',
  'Capaian Detail Penunjang 2026','ST Perlu Pemetaan Okt 2026',
  'Ringkasan Anggaran PKPT Non','Rincian Anggaran PKPT 2026','TOTAL REKAP PKPT NON 2026'
]);
const allowed = (name,year) => CORE.has(name) || name===`Laporan_Monev_Renaksi_${year}`;
function keyFor(code) {
  if(!code)return 'annual';
  if(/^M(0[1-9]|1[0-2])$/.test(code))return `month-${code.slice(1)}`;
  if(/^Q[1-4]$/.test(code))return `quarter-${code.slice(1)}`;
  if(/^S[12]$/.test(code))return `semester-${code.slice(1)}`;
  return null;
}
const rank = period => period.startsWith('month-')?300+Number(period.slice(-2))
  :period.startsWith('quarter-')?200+Number(period.slice(-1))*3
  :period.startsWith('semester-')?100+Number(period.slice(-1))*6:0;
export function periodCatalog(titles=[]) {
  const grouped=new Map();
  const add=(year,period,name)=>{
    if(!allowed(name,year))return;
    const yearMap=grouped.get(year)||new Map();
    const names=yearMap.get(period)||new Set();names.add(name);yearMap.set(period,names);grouped.set(year,yearMap);
  };
  for(const title of titles){
    const name=String(title||'');
    const pref=name.match(/^(20\d{2})__(?:(M(?:0[1-9]|1[0-2])|Q[1-4]|S[12])__)?(.+)$/);
    if(pref){const period=keyFor(pref[2]);if(period)add(Number(pref[1]),period,pref[3]);continue;}
    // 2026 legacy names are the only accepted unprefixed data sources.
    add(2026,'annual',name);
  }
  const years=[...grouped.keys()].sort((a,b)=>b-a);
  const byYear={};
  for(const year of years){
    const entries=[...grouped.get(year)].map(([value,cols])=>({value,sourceCount:cols.size}));
    entries.sort((a,b)=>rank(b.value)-rank(a.value));
    byYear[year]={periods:entries,latestPeriod:entries[0]?.value||'annual'};
  }
  const latestYear=years[0]||null;
  return {years,byYear,latestYear,latestPeriod:latestYear?byYear[latestYear].latestPeriod:null};
}
export function hasPeriod(catalog,year,period){return !!catalog?.byYear?.[year]?.periods?.some(x=>x.value===period);}
