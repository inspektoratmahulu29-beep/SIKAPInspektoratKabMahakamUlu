import React,{useEffect,useMemo,useState} from 'react';
import './finance-explorer.css';

const money = n => n===null||n===undefined||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n));
const compact = n => {
 if(n===null||n===undefined||!Number.isFinite(Number(n)))return '—';
 const x=Number(n);if(Math.abs(x)<1000)return money(x);
 const unit=Math.abs(x)>=1e12?'T':Math.abs(x)>=1e9?'M':Math.abs(x)>=1e6?'Jt':'Rb';
 const divisor={T:1e12,M:1e9,Jt:1e6,Rb:1e3}[unit];
 return `Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(x/divisor)} ${unit}`;
};
const pct=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':`${Number(n).toLocaleString('id-ID',{maximumFractionDigits:2})}%`;
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
const MODE={
 budget:{title:'Total Anggaran',subtitle:'Pagu berdasarkan program, kegiatan dan subkegiatan.',key:'anggaran'},
 financial:{title:'Realisasi Keuangan',subtitle:'Realisasi dana dan sisa anggaran pada masing-masing rincian.',key:'realisasiKeuangan'},
 serapan:{title:'Serapan Keuangan',subtitle:'Persentase realisasi keuangan terhadap pagu, bukan persentase fisik.',key:'serapanKeuangan'},
 physical:{title:'Realisasi Fisik',subtitle:'Capaian fisik (%) sesuai nilai resmi pada master Web 1.',key:'realisasiFisik'}
};
const modes=['budget','financial','serapan','physical'];
const isPercent=mode=>mode==='serapan'||mode==='physical';
const formatByMode=(record,mode)=>isPercent(mode)?pct(record?.[MODE[mode].key]):money(record?.[MODE[mode].key]);
const sourcePeriod = p=>p==='annual'?'Tahunan':p?.startsWith('month-')?`Bulan ${Number(p.slice(-2))}`:p?.startsWith('quarter-')?`Triwulan ${p.slice(-1)}`:p?.startsWith('semester-')?`Semester ${p.slice(-1)}`:p;
const rate=(a,b)=>a!=null&&b!=null&&Number(b)!==0?a/b*100:null;

function Icon({name,size=18}){
 const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'1.75',strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
 return <svg {...common}>{name==='close'?<><path d="m18 6-12 12M6 6l12 12"/></>:name==='arrow'?<><path d="M7 17 17 7M8 7h9v9"/></>:name==='chevron'?<path d="m6 9 6 6 6-6"/>:name==='search'?<><circle cx="10.7" cy="10.7" r="7.2"/><path d="m16 16 5 5"/></>:name==='layers'?<><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/></>:name==='chart'?<><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></>:name==='wallet'?<><rect x="2" y="5" width="20" height="16" rx="3"/><path d="M2 9V5a2 2 0 0 1 2-2h14"/><path d="M16 14h6"/></>:<><circle cx="12" cy="12" r="9"/><path d="m12 12 6-4"/></>}</svg>;
}

function Track({budget,financial,mode='budget'}){
 if(budget===null||budget===undefined||Number(budget)<=0)return <div className="fx-track-empty">Anggaran belum tersedia</div>;
 const r=financial!=null?Number(financial)/Number(budget)*100:0;
 return <div className={`fx-track fx-track-${mode}`} title={`Realisasi ${money(financial)} dari anggaran ${money(budget)}`}><span className="fx-track-fill" style={{width:`${clamp(r)}%`}}/>{financial!==null&&financial!==undefined&&r>100&&<b className="fx-overrun">{pct(r)}</b>}</div>;
}
function SummaryStat({title,value,hint,accent}){return <article className={`fx-stat fx-stat-${accent||'normal'}`}><small>{title}</small><strong title={value}>{value}</strong><span>{hint}</span></article>}

function DetailRow({item,mode}){
 const [open,setOpen]=useState(false);
 const tag=item.jenis==='kegiatan'?'Kegiatan':item.jenis==='subkegiatan'?'Subkegiatan':'Rincian kegiatan/subkegiatan';
 const label=item.jenisDariUrutan?'Subkegiatan (kelompok berdasarkan urutan, bukan kode)':' '+tag;
 return <article className={`fx-detail-row ${item.parentId?'fx-nested':''}`}>
  <button className="fx-detail-toggle" type="button" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>
    <span className="fx-detail-code">{item.no||String(item.row).padStart(2,'0')}</span>
    <span className="fx-detail-name"><b>{item.name}</b><small>{label.trim()} • Baris master {item.row}{item.parentName&&<> • Induk: {item.parentName}</>}</small></span>
    <span className="fx-detail-cost">{formatByMode(item,mode)}<small>{MODE[mode].title} • Klik detail</small></span>
    <span className={`fx-chevron ${open?'fx-rotate':''}`}><Icon name="chevron"/></span>
  </button>
  {open&&<div className="fx-detail-more">
    <div><small>Anggaran</small><strong>{money(item.anggaran)}</strong></div>
    <div><small>Realisasi keuangan</small><strong>{money(item.realisasiKeuangan)}</strong></div>
    <div><small>Sisa dana</small><strong>{money(item.sisaDana)}</strong>{item.sisaDihitung&&<small>Dihitung dari anggaran − realisasi</small>}</div>
    <div><small>Serapan keuangan</small><strong>{pct(item.serapanKeuangan)}</strong></div>
    <div className="fx-detail-physical"><small>Realisasi fisik</small><strong>{pct(item.realisasiFisik)}</strong><span className="fx-mini-track"><i style={{width:`${clamp(item.realisasiFisik)}%`}}/></span></div>
   </div>}
 </article>;
}
function Program({program,index,mode,expanded,onToggle}){
 const selected=MODE[mode].key;
 const isParent=program.jenis==='program';
 return <article className="fx-program-card">
  <button type="button" className="fx-program-main" aria-expanded={expanded} onClick={onToggle}>
    <span className="fx-program-rank">{String(index+1).padStart(2,'0')}</span>
    <span className="fx-program-info"><span className="fx-type">{isParent?'PROGRAM':'TANPA INDUK PROGRAM'} • {program.items?.length||0} rincian</span><strong>{program.name}</strong><small>Anggaran: {money(program.anggaran)} <span>•</span> Fisik: {pct(program.realisasiFisik)}</small></span>
    <span className="fx-program-value"><strong>{formatByMode(program,mode)}</strong><small>{MODE[mode].title}</small></span>
    <span className={`fx-chevron ${expanded?'fx-rotate':''}`}><Icon name="chevron"/></span>
  </button>
  {isParent&&<div className="fx-program-track"><Track budget={program.anggaran} financial={program.realisasiKeuangan}/><div><span>Serapan {pct(program.serapanKeuangan)}</span><span>Sisa {money(program.sisaDana)}</span></div></div>}
  {expanded&&<div className="fx-program-details"><div className="fx-program-totals">
    <span><small>Anggaran program</small><b>{money(program.anggaran)}</b></span><span><small>Keuangan</small><b>{money(program.realisasiKeuangan)}</b></span><span><small>Sisa dana</small><b>{money(program.sisaDana)}</b></span><span><small>Fisik</small><b>{pct(program.realisasiFisik)}</b></span>
    </div><div className="fx-program-list-title">RINCIAN DARI MASTER WEB 1 <small>(klik untuk melihat seluruh indikator)</small></div>
    {(program.items||[]).length?program.items.map(item=><DetailRow key={item.id} item={item} mode={mode}/>):<p className="fx-empty-details">Belum ada rincian kegiatan/subkegiatan pada program ini.</p>}
    <p className="fx-aggregation-note">Nilai program adalah baris induk pada master. Rincian di bawahnya tidak ditambahkan kembali ke nilai program.</p>
   </div>}
 </article>
}

export function FinancePreview({finance,onOpen}){
 const groups=(finance?.programs||[]).filter(x=>x.jenis==='program');
 if(!finance?.available||!groups.length)return null;
 const max=Math.max(1,...groups.map(x=>Number(x.anggaran)||0));
 return <section className="fx-preview panel">
    <div className="fx-preview-head"><div><span className="fx-eyebrow">MONITORING ANGGARAN • DATA WEB 1</span><h3>Perbandingan realisasi per program</h3><p>Grafik ringkas bersumber dari sheet Realisasi Fisik & Keu.</p></div><button type="button" onClick={()=>onOpen('budget')}>Lihat rincian lengkap <Icon name="arrow" size={16}/></button></div>
    <div className="fx-preview-list">{groups.slice(0,5).map(p=><button type="button" key={p.id} onClick={()=>onOpen('financial')} className="fx-preview-item" title={`Lihat rincian ${p.name}`}><span className="fx-preview-name">{p.name}</span><span className="fx-preview-visual"><span className="fx-preview-budget" style={{width:`${Math.max(0,Number(p.anggaran)||0)/max*100}%`}}/><span className="fx-preview-real" style={{width:`${Math.max(0,Number(p.realisasiKeuangan)||0)/max*100}%`}}/></span><b>{compact(p.realisasiKeuangan)}<small>{pct(p.serapanKeuangan)}</small></b></button>)}</div>
    <div className="fx-legend"><span><i className="fx-legend-budget"/> Pagu anggaran</span><span><i className="fx-legend-real"/> Realisasi keuangan</span><span className="fx-preview-foot">Menampilkan {Math.min(groups.length,5)} dari {groups.length} program • Tidak menjumlahkan rincian berulang</span></div>
  </section>;
}

export default function FinanceExplorer({finance,kpi,year,period,initialMode='budget',onClose}){
 const [mode,setMode]=useState(modes.includes(initialMode)?initialMode:'budget');
 const [search,setSearch]=useState('');
 const [programFilter,setProgramFilter]=useState('all');
 const [sort,setSort]=useState('source');
 const [expanded,setExpanded]=useState({});
 const programs=finance?.programs||[];
 const visible=useMemo(()=>{
   const term=search.trim().toLocaleLowerCase('id');
   const filtered=programs.filter(p=>(programFilter==='all'||p.id===programFilter)&&(!term||p.name.toLocaleLowerCase('id').includes(term)||(p.items||[]).some(x=>x.name.toLocaleLowerCase('id').includes(term))));
   if(sort==='source')return filtered;
   if(sort==='name')return [...filtered].sort((a,b)=>a.name.localeCompare(b.name,'id'));
   const fld=sort==='physical'?'realisasiFisik':sort==='remaining'?'sisaDana':sort==='realization'?'realisasiKeuangan':'anggaran';
   return [...filtered].sort((a,b)=>(Number(b[fld])||0)-(Number(a[fld])||0));
 },[programs,programFilter,search,sort]);
 const visibleCount=visible.reduce((a,p)=>a+(p.items||[]).filter(x=>!search.trim()||p.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))||x.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))).length,0);
 const summary=finance?.summary||{};
 useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 useEffect(()=>{const original=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=original;};},[]);
 useEffect(()=>setMode(modes.includes(initialMode)?initialMode:'budget'),[initialMode]);
 const changeMode=v=>setMode(v);
 const toggleAll=()=>{const allOpen=visible.length>0&&visible.every(p=>expanded[p.id]);setExpanded(Object.fromEntries(visible.map(p=>[p.id,!allOpen])));};
 const discrep=finance?.reconciliation&&['selisihAnggaran','selisihRealisasi'].some(x=>Math.abs(finance.reconciliation[x]||0)>1);
 const maxValue=Math.max(1,...programs.filter(p=>p.jenis==='program').map(p=>Number(p[MODE[mode].key])||0));
 return <div className="fx-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="fx-modal" role="dialog" aria-modal="true" aria-labelledby="fx-title">
  <header className="fx-top"><div className="fx-top-left"><span className="fx-eyebrow"><Icon name="layers" size={16}/> ANALISIS REALISASI • MASTER WEB 1 • TA {year} • {sourcePeriod(period)}</span><h2 id="fx-title">{MODE[mode].title} <span>/ Detail Program</span></h2><p>{MODE[mode].subtitle}</p></div><button className="fx-close" type="button" aria-label="Tutup rincian realisasi" onClick={onClose}><Icon name="close" size={21}/></button></header>
  <div className="fx-scroll">
   <div className="fx-tabs" role="group" aria-label="Pilih indikator realisasi">{modes.map(m=><button key={m} type="button" aria-pressed={m===mode} className={m===mode?'fx-selected':''} onClick={()=>changeMode(m)}>{m==='budget'?<Icon name="wallet"/>:m==='financial'?<Icon name="chart"/>:<Icon name="speed"/>}{MODE[m].title}</button>)}</div>
   {!finance?.available?<div className="fx-unavailable"><Icon name="wallet" size={34}/><h3>Rincian belum tersedia</h3><p>Sheet Realisasi Fisik & Keu belum bisa dibaca dengan aman pada tahun dan periode ini. Periksa master Web 1 lalu muat ulang SIKAP.</p></div>:<>
    <div className="fx-summary"><SummaryStat title="TOTAL ANGGARAN" value={money(kpi?.totalAnggaran??summary.anggaran)} hint="Pagu induk pada master" accent="amber"/><SummaryStat title="REALISASI KEUANGAN" value={money(kpi?.realisasiKeuangan??summary.realisasiKeuangan)} hint={`Serapan ${pct(kpi?.serapan??summary.serapanKeuangan)}`} accent="mint"/><SummaryStat title="SISA DANA" value={money(kpi?.sisaDana??summary.sisaDana)} hint="Anggaran dikurangi realisasi" accent="blue"/><SummaryStat title="REALISASI FISIK" value={pct(kpi?.realisasiFisik??summary.realisasiFisik)} hint="Nilai fisik sumber, bukan estimasi" accent="violet"/></div>
    <div className="fx-visual-grid"><section className="fx-visual-panel"><div className="fx-section-head"><div><span className="fx-eyebrow">KOMPOSISI PROGRAM</span><h3>{mode==='physical'?'Capaian fisik per program':mode==='serapan'?'Persentase serapan per program':'Perbandingan nilai per program'}</h3></div><small>{finance.counts?.program||0} program</small></div><div className="fx-chart-list">{programs.filter(p=>p.jenis==='program').slice(0,10).map(p=><button type="button" className="fx-chart-entry" key={p.id} onClick={()=>{setProgramFilter(p.id);setExpanded(old=>({...old,[p.id]:true}));}}><span className="fx-chart-head"><b title={p.name}>{p.name}</b><strong>{isPercent(mode)?pct(p[MODE[mode].key]):compact(p[MODE[mode].key])}</strong></span><span className="fx-chart-track"><i style={{width:isPercent(mode)?`${clamp(p[MODE[mode].key])}%`:`${Math.max(0,Number(p[MODE[mode].key])||0)/maxValue*100}%`}}/></span></button>)}{!programs.some(p=>p.jenis==='program')&&<span className="fx-muted">Belum ada program yang dapat divisualisasikan.</span>}</div></section>
    <section className="fx-visual-panel fx-budget-visual"><div className="fx-section-head"><div><span className="fx-eyebrow">POSISI ANGGARAN</span><h3>Pagu dan penyerapannya</h3></div><Icon name="wallet" size={23}/></div><div className="fx-big-rate">{pct(kpi?.serapan??summary.serapanKeuangan)}<span>Serapan keuangan</span></div><Track budget={summary.anggaran} financial={summary.realisasiKeuangan}/><div className="fx-budget-split"><span><i className="fx-dot-real"/> Terealisasi <b>{money(summary.realisasiKeuangan)}</b></span><span><i className="fx-dot-remain"/> Sisa dana <b>{money(summary.sisaDana)}</b></span></div><p>Realisasi fisik ditampilkan terpisah dari persentase serapan keuangan. Angka tidak tersedia tidak diganti menjadi nol.</p></section></div>
    {discrep&&<div className="fx-alert" role="status"><b>Perlu rekonsiliasi data induk</b><p>Jumlah anggaran atau realisasi pada baris program belum sama dengan total induk. Periksa rumus dan isian Web 1; rincian tidak digunakan untuk mengubah KPI resmi.</p></div>}
    <section className="fx-list"><div className="fx-section-head"><div><span className="fx-eyebrow">PENELUSURAN RINCIAN</span><h3>Program, kegiatan & subkegiatan</h3><p>Pilih program atau ketik nama rincian untuk melihat anggaran, realisasi keuangan, fisik, dan sisa dana.</p></div><div className="fx-counter"><strong>{visible.length}</strong> program <span>·</span> {visibleCount} rincian</div></div>
      <div className="fx-filters"><label className="fx-search"><Icon name="search"/><input type="search" placeholder="Cari program / kegiatan / subkegiatan…" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Cari rincian realisasi"/></label><label><span>PROGRAM</span><select value={programFilter} onChange={e=>setProgramFilter(e.target.value)} aria-label="Filter program"><option value="all">Semua program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>URUTKAN</span><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Urutkan program"><option value="source">Urutan master</option><option value="budget">Anggaran terbesar</option><option value="realization">Realisasi terbesar</option><option value="remaining">Sisa dana terbesar</option><option value="physical">Fisik tertinggi</option><option value="name">Nama A–Z</option></select></label><button type="button" className="fx-expand" onClick={toggleAll}>{visible.every(p=>expanded[p.id])&&visible.length?'Tutup semua':'Buka semua'}</button></div>
      <div className="fx-program-list">{visible.map((p,i)=><Program key={p.id} index={i} program={search?.trim()?{...p,items:p.items.filter(x=>x.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))||p.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id')))}:p} mode={mode} expanded={!!expanded[p.id] || !!search.trim()} onToggle={()=>setExpanded(old=>({...old,[p.id]:!old[p.id]}))}/>)}{!visible.length&&<div className="fx-empty"><h4>Tidak ada data yang cocok</h4><p>Ubah filter program atau kata pencarian.</p><button onClick={()=>{setSearch('');setProgramFilter('all');}} type="button">Tampilkan semua program</button></div>}</div>
    </section>
    <footer className="fx-foot"><b>SUMBER: REALISASI FISIK & KEU • WEB 1</b><p>Baris Inspektorat/Jumlah Belanja = total resmi; baris program = sub-total; rincian di dalam program = turunan (tidak dijumlah ulang). Klasifikasi kegiatan/subkegiatan menggunakan kode pada master; baris tanpa kode setelah kegiatan bernomor diberi label turunan berdasarkan urutan, bukan dianggap kode resmi.</p>{finance.notes?.length>0&&<p>{finance.notes.join(' ')}</p>}</footer>
   </>}
  </div>
 </section></div>;
}
