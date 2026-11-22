import React,{useEffect,useMemo,useRef,useState} from 'react';
import './pkpt-explorer.css';

const statuses=[
  {id:'selesai',label:'Sudah',color:'#77dfbd'},
  {id:'berjalan',label:'Sedang berjalan',color:'#f3d38a'},
  {id:'belum',label:'Belum berjalan',color:'#aaa8f6'},
  {id:'lainnya',label:'Lainnya',color:'#bdcbd7'}
];
const format=n=>n==null?'—':Number(n).toLocaleString('id-ID',{maximumFractionDigits:2});
const pct=(a,b)=>b?`${(a/b*100).toLocaleString('id-ID',{maximumFractionDigits:1})}%`:'—';
const text=s=>String(s||'').toLocaleLowerCase('id-ID');
const irbanMatches=(value,label)=>{
  if(label==='Belum ditentukan')return !value||value==='Belum ditentukan';
  const names=[...String(value).toUpperCase().matchAll(/\b(?:IRBAN\s*)?(III|II|IV|I|V)\b/g)].map(m=>`Irban ${m[1]}`);
  return names.length?names.includes(label):value===label;
};

function StatusBar({summary,small=false}){
  const total=summary?.total||0;
  return <div className={`pkpt-stack ${small?'pkpt-stack-small':''}`} role="img" aria-label={total?`Sudah ${summary.selesai}, sedang berjalan ${summary.berjalan}, belum ${summary.belum}, lainnya ${summary.lainnya}`:'Belum tersedia data penugasan'}>
    {statuses.map(s=><span key={s.id} title={`${s.label}: ${format(summary?.[s.id]||0)}`} className={`pkpt-segment pkpt-segment-${s.id}`} style={{width:`${total?summary[s.id]/total*100:0}%`}}/>)}
  </div>;
}
function Breakdown({title,subtitle,rows=[],onSelect,compact=false}){
  const max=Math.max(1,...rows.map(r=>r.total));
  return <section className={`pkpt-breakdown ${compact?'is-compact':''}`}>
    <div className="pkpt-section-heading"><div><span className="pkpt-eyebrow">ANALISIS PENUGASAN</span><h3>{title}</h3><p>{subtitle}</p></div></div>
    {rows.length?<div className="pkpt-breakdown-list">{rows.slice(0,compact?5:18).map(r=><button className="pkpt-breakdown-row" key={r.label} type="button" onClick={()=>onSelect?.(r.label)} title={`Tampilkan daftar ${r.label}`}>
      <span className="pkpt-bar-label"><strong>{r.label}</strong><b>{format(r.total)}</b></span>
      <span className="pkpt-bar-bg"><span className="pkpt-bar-amount" style={{width:`${r.total/max*100}%`}}><span className="pkpt-bar-group pkpt-bar-done" style={{width:`${r.selesai/r.total*100}%`}}/><span className="pkpt-bar-group pkpt-bar-run" style={{width:`${r.berjalan/r.total*100}%`}}/><span className="pkpt-bar-group pkpt-bar-pending" style={{width:`${r.belum/r.total*100}%`}}/><span className="pkpt-bar-group pkpt-bar-other" style={{width:`${r.lainnya/r.total*100}%`}}/></span></span>
    </button>)}</div>:<p className="pkpt-no-data">Kelompok belum tersedia pada master data.</p>}
  </section>;
}
function StatusBadge({value,raw}){
  const s=statuses.find(x=>x.id===value);
  return <span title={raw||s?.label||'Status tidak tersedia'} className={`pkpt-status-tag pkpt-tag-${value||'lainnya'}`}><i/>{s?.label||'Lainnya'}</span>;
}
function ActivityCard({item}){
  const [open,setOpen]=useState(false);
  const hasProgress=item.target!==null&&item.realisasi!==null&&item.target>0;
  const progress=hasProgress?item.realisasi/item.target*100:null;
  return <article className="pkpt-task">
    <button className="pkpt-task-main" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
      <span className="pkpt-task-number">{String(item.row).padStart(3,'0')}</span>
      <span className="pkpt-task-text"><strong>{item.title}</strong><span>{item.jenisPengawasan} <b aria-hidden="true">·</b> {item.irban} <b aria-hidden="true">·</b> {item.jenisKegiatan}</span></span>
      <span className="pkpt-task-right"><StatusBadge value={item.status} raw={item.rawStatus}/><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={open?'expanded':''}><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    {open&&<div className="pkpt-task-extra">
      <div className="pkpt-field"><small>Rincian pelaksanaan</small><b>{item.title}</b></div>
      <div className="pkpt-field"><small>Pemantauan realisasi</small><StatusBadge value={item.status} raw={item.rawStatus}/></div>
      <div className="pkpt-field"><small>Irban pengampu</small><b>{item.irban}</b></div>
      <div className="pkpt-field"><small>Jenis pengawasan</small><b>{item.jenisPengawasan}</b></div>
      <div className="pkpt-field"><small>Jenis kegiatan</small><b>{item.jenisKegiatan}</b></div>
      <div className="pkpt-field"><small>Dasar penugasan</small><b>{item.dasarPenugasan||'Belum diisi'}</b></div>
      <div className="pkpt-field pkpt-wide"><small>Pembebanan biaya penugasan / subkegiatan</small><b>{item.subKegiatan||'Belum diisi'}</b></div>
      <div className="pkpt-field"><small>Target output</small><b>{format(item.target)} {item.satuanTarget}</b></div>
      <div className="pkpt-field"><small>Realisasi output</small><b>{format(item.realisasi)} {item.satuanRealisasi}</b></div>
      <div className="pkpt-field pkpt-wide"><small>Perbandingan realisasi / target</small>{progress===null?<b>Belum dapat dihitung (target atau realisasi belum lengkap)</b>:<><b>{progress.toLocaleString('id-ID',{maximumFractionDigits:1})}%</b><div className="pkpt-activity-track"><i style={{width:`${Math.max(0,Math.min(100,progress))}%`}}/></div></>}</div>
      <div className="pkpt-field pkpt-wide"><small>Jadwal pada master (Triwulan I–IV)</small><div className="pkpt-quarter-row">{item.jadwal.map((v,i)=><span key={i} className={v?'has-value':''}>TW {i+1}<b>{v||'—'}</b></span>)}</div></div>
      <small className="pkpt-row-source">Sumber: Rekap realisasi PKPT • baris {item.row} • ditampilkan sesuai isi master</small>
    </div>}
  </article>;
}

export function PkptPreview({pkpt,onOpen}){
  if(!pkpt?.available)return <section className="panel pkpt-preview"><div className="pkpt-preview-head"><div><span className="pkpt-eyebrow">MASTER DATA WEB 1</span><h3>Distribusi Penugasan</h3></div></div><p className="pkpt-no-data">Sheet Rekap realisasi PKPT belum tersedia atau belum valid pada periode ini.</p></section>;
  return <section className="panel pkpt-preview"><div className="pkpt-preview-head"><div><span className="pkpt-eyebrow">TERHUBUNG DENGAN KERTAS KERJA</span><h3>Peta Penugasan Pembinaan & Pengawasan</h3><p>Distribusi berdasarkan Irban pengampu dan jenis kegiatan dari master data.</p></div><button type="button" className="pkpt-open-button" onClick={()=>onOpen({})}>Lihat rincian lengkap <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div>
    <div className="pkpt-preview-graphs"><Breakdown compact title="Irban Pengampu" subtitle="Penugasan lintas Irban dihitung pada setiap Irban terkait." rows={pkpt.irban} onSelect={label=>onOpen({irban:label})}/><Breakdown compact title="Jenis Kegiatan" subtitle="Dikelompokkan sesuai label jenis kegiatan pada master." rows={pkpt.kegiatan} onSelect={label=>onOpen({jenisKegiatan:label})}/></div>
    <div className="pkpt-legend">{statuses.map(s=><span key={s.id}><i style={{background:s.color}}/>{s.label}</span>)}</div>
  </section>;
}

function PkptContent({pkpt,initial={}}){
  const [status,setStatus]=useState(initial.status||'all');
  const [irban,setIrban]=useState(initial.irban||'all');
  const [kegiatan,setKegiatan]=useState(initial.jenisKegiatan||'all');
  const [pengawasan,setPengawasan]=useState(initial.jenisPengawasan||'all');
  const [query,setQuery]=useState('');
  const [visible,setVisible]=useState(12);
  const summary=pkpt?.summary;
  const items=pkpt?.items||[];
  const matches=useMemo(()=>items.filter(item=>{
    if(status!=='all'&&item.status!==status)return false;
    if(irban!=='all'&&!irbanMatches(item.irban,irban))return false;
    if(kegiatan!=='all'&&item.jenisKegiatan!==kegiatan)return false;
    if(pengawasan!=='all'&&item.jenisPengawasan!==pengawasan)return false;
    const q=text(query.trim());
    return !q||[item.title,item.jenisPengawasan,item.irban,item.jenisKegiatan,item.dasarPenugasan,item.subKegiatan].some(v=>text(v).includes(q));
  }),[items,status,irban,kegiatan,pengawasan,query]);
  const resetPage=()=>setVisible(12);
  const selectStatus=s=>{setStatus(s);resetPage();};
  const selectIrban=v=>{setIrban(v);resetPage();};
  const selectKegiatan=v=>{setKegiatan(v);resetPage();};
  const clear=()=>{setStatus('all');setIrban('all');setKegiatan('all');setPengawasan('all');setQuery('');resetPage();};
  if(!pkpt?.available)return <div className="pkpt-unavailable"><h3>Rincian penugasan belum tersedia</h3><p>Sheet Rekap realisasi PKPT belum ditemukan, masih kosong, atau memiliki kesalahan rumus. Data tidak diganti dengan angka perkiraan. Periksa master pada Web Kertas Kerja.</p></div>;
  return <>
    <div className="pkpt-summary-cards">
      <button type="button" className={`pkpt-summary-card ${status==='all'?'active':''}`} onClick={()=>selectStatus('all')}><span>Total penugasan</span><strong>{format(summary.total)}</strong><small>Seluruh kegiatan</small></button>
      {statuses.map(s=><button type="button" className={`pkpt-summary-card pkpt-summary-${s.id} ${status===s.id?'active':''}`} key={s.id} onClick={()=>selectStatus(s.id)}><span>{s.label}</span><strong>{format(summary[s.id])}</strong><small>{pct(summary[s.id],summary.total)} dari total</small></button>)}
    </div>
    <div className="pkpt-insights"><section className="pkpt-insight-ring"><div className="pkpt-section-heading"><div><span className="pkpt-eyebrow">PEMANTAUAN REALISASI</span><h3>Komposisi Status</h3><p>Status dibaca dari kolom Pemantauan Realisasi, bukan perkiraan berdasarkan jadwal.</p></div></div><div className="pkpt-ring-row"><div className="pkpt-donut" style={{'--done':`${summary.total?summary.selesai/summary.total*100:0}%`,'--running':`${summary.total?(summary.selesai+summary.berjalan)/summary.total*100:0}%`,'--pending':`${summary.total?(summary.selesai+summary.berjalan+summary.belum)/summary.total*100:0}%`}}><div><strong>{format(summary.total)}</strong><small>PENUGASAN</small></div></div><div className="pkpt-donut-legend">{statuses.map(s=><button type="button" onClick={()=>selectStatus(s.id)} key={s.id}><i style={{background:s.color}}/><span>{s.label}</span><b>{format(summary[s.id])}</b></button>)}</div></div></section>
      <Breakdown title="Sebaran Irban Pengampu" subtitle="Penugasan bersama dapat muncul pada lebih dari satu Irban; total keterlibatan bisa melampaui jumlah penugasan." rows={pkpt.irban} onSelect={selectIrban}/>
      <Breakdown title="Jenis Kegiatan" subtitle="Mengikuti jenis kegiatan yang diisi pada master (termasuk kolom kosong)." rows={pkpt.kegiatan} onSelect={selectKegiatan}/>
      <Breakdown title="Kelompok Pengawasan" subtitle="Kategori induk diteruskan ke rincian kegiatan di bawahnya sesuai struktur Excel." rows={pkpt.pengawasan} onSelect={v=>{setPengawasan(v);resetPage();}}/>
    </div>
    <section className="pkpt-list-panel">
      <div className="pkpt-list-header"><div><span className="pkpt-eyebrow">DAFTAR KEGIATAN DARI MASTER</span><h3>Rincian Pelaksanaan Pembinaan dan Pengawasan</h3><p>{format(matches.length)} dari {format(items.length)} kegiatan sesuai filter • setiap baris dapat dibuka untuk melihat target, realisasi, dan jadwal</p></div><button type="button" onClick={clear} className="pkpt-clear">Reset filter</button></div>
      <div className="pkpt-filters"><label className="pkpt-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" aria-label="Cari penugasan" placeholder="Cari nama penugasan, Irban, atau subkegiatan..." value={query} onChange={e=>{setQuery(e.target.value);resetPage();}}/></label>
        <label>Status<select aria-label="Filter status" value={status} onChange={e=>selectStatus(e.target.value)}><option value="all">Semua status</option>{statuses.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>
        <label>Irban<select aria-label="Filter Irban pengampu" value={irban} onChange={e=>selectIrban(e.target.value)}><option value="all">Semua Irban</option>{(pkpt.irban||[]).map(g=><option value={g.label} key={g.label}>{g.label}</option>)}</select></label>
        <label>Jenis kegiatan<select aria-label="Filter jenis kegiatan" value={kegiatan} onChange={e=>selectKegiatan(e.target.value)}><option value="all">Semua jenis kegiatan</option>{(pkpt.kegiatan||[]).map(g=><option value={g.label} key={g.label}>{g.label}</option>)}</select></label>
        <label>Jenis pengawasan<select aria-label="Filter jenis pengawasan" value={pengawasan} onChange={e=>{setPengawasan(e.target.value);resetPage();}}><option value="all">Semua pengawasan</option>{(pkpt.pengawasan||[]).map(g=><option value={g.label} key={g.label}>{g.label}</option>)}</select></label>
      </div>
      <div className="pkpt-task-list">{matches.slice(0,visible).map(item=><ActivityCard key={item.id} item={item}/>)}</div>
      {!matches.length&&<div className="pkpt-no-results">Tidak ada kegiatan yang sesuai dengan filter saat ini. <button type="button" onClick={clear}>Lihat semua kegiatan</button></div>}
      {matches.length>visible&&<button className="pkpt-load-more" type="button" onClick={()=>setVisible(n=>n+12)}>Tampilkan 12 kegiatan berikutnya ({format(matches.length-visible)} tersisa)</button>}
      <p className="pkpt-integrity-note">Sumber: sheet <b>Rekap realisasi PKPT</b> pada Google Sheets Web 1. Nama kegiatan, status, pengampu dan output mengikuti data yang disimpan; kolom kosong tetap ditandai belum diisi. Halaman ini bersifat baca saja.</p>
    </section>
  </>;
}

export default function PkptExplorer({pkpt,year,period,initial={},onClose}){
  const closeRef=useRef(null);
  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    const key=e=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('keydown',key);document.body.style.overflow=previous;};
  },[onClose]);
  const periodNames={annual:'Tahunan'};
  const periodTitle=periodNames[period]||(/month-(\d+)/.test(period)?`Bulan ${period.slice(-2)}`:/quarter-(\d)/.test(period)?`Triwulan ${period.slice(-1)}`:`Semester ${period.slice(-1)}`);
  return <div className="pkpt-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="pkpt-explorer" role="dialog" aria-modal="true" aria-labelledby="pkpt-explorer-title">
      <header className="pkpt-modal-top"><div><span className="pkpt-eyebrow">SIKAP • MONITORING PKPT • TA {year} / {periodTitle}</span><h2 id="pkpt-explorer-title">Pusat Kendali Penugasan</h2><p>Rincian pelaksanaan pembinaan dan pengawasan • Pemantauan realisasi • Irban pengampu • Jenis kegiatan</p></div><button type="button" className="pkpt-modal-close" aria-label="Tutup rincian PKPT" title="Tutup" onClick={onClose} ref={closeRef}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></header>
      <div className="pkpt-modal-scroll"><PkptContent pkpt={pkpt} initial={initial}/></div>
    </section>
  </div>;
}
