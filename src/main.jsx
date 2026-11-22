import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const PERIOD_OPTIONS=[{value:'annual',label:'Tahunan'},
 ...Array.from({length:12},(_,i)=>({value:`month-${String(i+1).padStart(2,'0')}`,label:new Intl.DateTimeFormat('id-ID',{month:'long'}).format(new Date(2026,i,1))})),
 ...Array.from({length:4},(_,i)=>({value:`quarter-${i+1}`,label:`Triwulan ${i+1}`})),
 ...Array.from({length:2},(_,i)=>({value:`semester-${i+1}`,label:`Semester ${i+1}`}))];
const initialQuery=new URLSearchParams(window.location.search);
const initialPeriod=PERIOD_OPTIONS.some(x=>x.value===initialQuery.get('period'))?initialQuery.get('period'):'annual';
const initialYear=/^20\d{2}$/.test(initialQuery.get('year')||'')?Number(initialQuery.get('year')):2026;

const money=n=>(n==null||n==='')?'—':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0).replace(/\u00a0/g,' ');
const num=n=>(n==null||n==='')?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n)||0);
const pct=n=>(n==null||n==='')?'—':`${(Number(n)||0).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
const outputTotal=k=>(k.outputUtama==null||k.outputPenunjang==null)?null:Number(k.outputUtama)+Number(k.outputPenunjang);

function App(){
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[errorCode,setErrorCode]=useState(''),[errorStage,setErrorStage]=useState('');
  const [loading,setLoading]=useState(true),[loadProgress,setLoadProgress]=useState(8);
  const [year,setYear]=useState(initialYear),[period,setPeriod]=useState(initialPeriod);
  const [years,setYears]=useState([...new Set([2026,initialYear])].sort((a,b)=>b-a));
  const [tab,setTab]=useState('dashboard'),[activeKpi,setActiveKpi]=useState(null),[pulse,setPulse]=useState(0);
  const [lastSync,setLastSync]=useState(null),[lastAttempt,setLastAttempt]=useState(null),[syncState,setSyncState]=useState('connecting');
  const [attemptCount,setAttemptCount]=useState(0),[diagnostic,setDiagnostic]=useState(null),[checking,setChecking]=useState(false);
  // A snapshot from another year/period must never appear under the newly selected heading.
  const data=snapshot?.year===year&&(snapshot?.period||'annual')===period?snapshot:null;
  const requestRef=useRef(null),requestNumberRef=useRef(0),retryRef=useRef({failures:0,nextAt:0});
  const load=useCallback(async(force=false)=>{
    // Automatic polling never interrupts a request. Manual reload can supersede a stalled one.
    if(!force&&(requestRef.current||Date.now()<retryRef.current.nextAt))return;
    if(requestRef.current)requestRef.current.abort();
    const controller=new AbortController();requestRef.current=controller;
    const requestId=++requestNumberRef.current;
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},25000);
    setLoading(true);setLoadProgress(20);setLastAttempt(new Date());setAttemptCount(requestId);
    setError('');setErrorCode('');setErrorStage('');setDiagnostic(null);setSyncState(s=>s==='live'?'live':'connecting');
    try{
      const params=new URLSearchParams({year:String(year),period,v:'23.0'});
      if(force)params.set('refresh','1');
      const r=await fetch(`/api/public/dashboard?${params}`,{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
      const raw=await r.text();let j={};try{j=JSON.parse(raw);}catch{}
      if(!r.ok||r.status===304){const exception=new Error(j.error||j.message||`Server mengembalikan HTTP ${r.status}`);exception.code=j.code||(r.status===304?'EMPTY_CACHE':`HTTP_${r.status}`);exception.stage=j.stage||'';throw exception;}
      if(!j||typeof j!=='object'||!j.kpi||j.year!==year||(j.period||'annual')!==period){const exception=new Error('Respons server tidak sesuai tahun, periode, atau format data yang dipilih.');exception.code='SOURCE_MISMATCH';throw exception;}
      if(requestRef.current!==controller)return;
      setLoadProgress(100);setSnapshot(j);setError('');setErrorCode('');setLastSync(r.headers.get('x-dashboard-cache')==='STALE'&&j.updatedAt?new Date(j.updatedAt):new Date());
      const state=r.headers.get('x-dashboard-cache')==='STALE'?'stale':'live';setSyncState(state);
      retryRef.current={failures:0,nextAt:Date.now()+(state==='stale'?12000:7000)};
    }catch(e){
      if(requestRef.current!==controller)return;
      if(controller.signal.aborted&&!timedOut)return;
      const code=timedOut?'CLIENT_TIMEOUT':e.code||(e.name==='AbortError'?'CLIENT_TIMEOUT':'NETWORK_ERROR');
      const friendly={CLIENT_TIMEOUT:'Server belum merespons dalam 25 detik. Periksa status sumber lalu coba lagi.',NETWORK_ERROR:'Koneksi ke server Dashboard gagal. Periksa jaringan dan status server.',GOOGLE_CONFIG_MISSING:'Konfigurasi Google Sheets pada proyek Dashboard belum lengkap.',GOOGLE_ACCESS_DENIED:'Akun layanan Dashboard belum diberi akses membaca spreadsheet pusat.',GOOGLE_AUTH_FAILED:'Autentikasi Google pada proyek Dashboard gagal.',GOOGLE_CREDENTIAL_INVALID:'Kredensial Google pada proyek Dashboard tidak valid.',GOOGLE_TIMEOUT:'Google Sheets terlalu lama merespons. Silakan coba lagi.',GOOGLE_RATE_LIMITED:'Permintaan Google Sheets sedang dibatasi. Sistem akan mencoba kembali secara bertahap.',YEAR_NOT_INITIALIZED:'Data tahun yang dipilih belum ditemukan pada sumber pusat.',PERIOD_NOT_INITIALIZED:'Data periode yang dipilih belum ditemukan pada sumber pusat.'};
      setError(friendly[code]||e.message||'Data sumber tidak berhasil dibaca.');setErrorCode(code);setErrorStage(e.stage||'');setSyncState('offline');
      const failures=retryRef.current.failures+1;
      retryRef.current={failures,nextAt:Date.now()+Math.min(60000,8000*(2**Math.min(failures-1,3)))};
    }finally{
      clearTimeout(timer);
      if(requestRef.current===controller){requestRef.current=null;setLoading(false);setLoadProgress(100);}
    }
  },[year,period]);

  const checkConnection=useCallback(async()=>{
    setChecking(true);setDiagnostic(null);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch(`/api/public/connection?year=${year}`,{cache:'no-store',signal:controller.signal});
      const j=await r.json();
      setDiagnostic({ok:!!j.ok,code:j.code||`HTTP_${r.status}`,message:j.message||'Pemeriksaan koneksi selesai.',present:j.googleConfigPresent,valid:j.credentialStructureValid,found:j.coreSheetsFound,expected:j.coreSheetsExpected,missing:j.missingCore||[],fingerprint:j.spreadsheetFingerprint});
    }catch(e){setDiagnostic({ok:false,code:e.name==='AbortError'?'DIAGNOSTIC_TIMEOUT':'NETWORK_ERROR',message:'Pemeriksaan sumber tidak dapat diselesaikan. Periksa koneksi jaringan atau log Pages Functions.'});}
    finally{clearTimeout(timer);setChecking(false);}
  },[year]);

  useEffect(()=>{
    let cancelled=false;
    async function updateYears(){
      try{const r=await fetch('/api/public/years',{cache:'no-store'});if(!r.ok)return;
        const j=await r.json();if(!cancelled&&j.ok&&Array.isArray(j.years))setYears(old=>[...new Set([...old,...j.years])].sort((a,b)=>b-a));
      }catch{}
    }
    updateYears();const timer=setInterval(()=>{if(document.visibilityState==='visible')updateYears();},60000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[]);

  useEffect(()=>{
    retryRef.current={failures:0,nextAt:0};setLoading(true);setError('');setErrorCode('');setErrorStage('');setDiagnostic(null);setLoadProgress(12);
    load(false);
    const tick=()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)load(false);};
    const poll=setInterval(tick,2500);
    const anim=setInterval(()=>setPulse(v=>v+1),1800);
    const onVisible=()=>{if(document.visibilityState==='visible')load(false);};
    const onOnline=()=>load(true);
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',onVisible);window.addEventListener('online',onOnline);
    const url=new URL(window.location.href);url.searchParams.set('year',String(year));url.searchParams.set('period',period);history.replaceState(null,'',url);
    return()=>{clearInterval(poll);clearInterval(anim);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible);window.removeEventListener('online',onOnline);requestRef.current?.abort();requestRef.current=null;};
  },[load,year,period]);

  const k=data?.kpi||{};
  const cards=useMemo(()=>[
    {id:'budget',label:'Total Anggaran',value:money(k.totalAnggaran),note:'Pagu anggaran pada sumber realisasi fisik & keuangan',icon:'Rp',tone:'gold'},
    {id:'financial',label:'Realisasi Keuangan',value:money(k.realisasiKeuangan),note:'Akumulasi realisasi keuangan terhimpun',icon:'↗',tone:'teal'},
    {id:'serapan',label:'Serapan Keuangan',value:pct(k.serapan),note:'Realisasi dibandingkan total anggaran',icon:'%',tone:'mint',progress:clamp(k.serapan)},
    {id:'physical',label:'Realisasi Fisik',value:pct(k.realisasiFisik),note:'Capaian fisik resmi/tertimbang dari sumber',icon:'◌',tone:'blue',progress:clamp(k.realisasiFisik)},
    {id:'pkpt',label:'Penugasan PKPT',value:num(k.penugasan),note:`${num(k.selesai)} selesai • ${num(k.berjalan)} berjalan • ${num(k.belum)} belum`,icon:'◎',tone:'violet'},
    {id:'output',label:'Total Output',value:num(outputTotal(k)),note:`Utama ${num(k.outputUtama)} • Penunjang ${num(k.outputPenunjang)}`,icon:'▦',tone:'rose'}
  ],[k]);

  const sourceTitle=tab==='dashboard'?'SISTEM INFORMASI KINERJA DAN PENGAWASAN':tab==='realisasi'?'Realisasi Fisik & Keuangan':tab==='kinerja'?'Kinerja & Monitoring':'Penugasan & Output';

  return <div className="app">
    <header className="topbar">
      <div className="brand-wrap">
        <div className="logo-pair logo-pair-with-sikap">
          <div className="logo-frame"><img src="/assets/logo-mahakam-ulu.png" alt="Lambang Kabupaten Mahakam Ulu" /></div>
          <div className="logo-frame logo-ins"><img src="/assets/logo-inspektorat.png" alt="Logo Inspektorat Kabupaten Mahakam Ulu" /></div>
          <span className="logo-pair-sikap">SIKAP</span>
        </div>
        <div className="brand-copy">
          <div className="brand-kicker">PEMERINTAH KABUPATEN MAHAKAM ULU</div>
          <b>INSPEKTORAT DAERAH</b>
          <span className="brand-sikap-animated">(SIKAP) SISTEM INFORMASI KINERJA DAN PENGAWASAN</span>
        </div>
      </div>
      <div className="top-actions">
        <div className={`realtime status-${syncState}`} role="status"><span className="live-dot"/> {syncState==='live'?'DATA TERBARU':syncState==='stale'?'DATA CADANGAN':syncState==='offline'?'KONEKSI TERPUTUS':'MEMERIKSA SUMBER'} <small>{lastSync?`• ${lastSync.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:''}</small></div>
        <button type="button" className={`manual-refresh ${loading?'refresh-busy':''}`} onClick={()=>load(true)} title="Ambil data terbaru dari Google Sheets" aria-busy={loading}><span className="refresh-symbol" aria-hidden="true">↻</span> {loading?'Memeriksa…':'Muat ulang'}</button>
        <label className="year-select"><span>TA</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
        <label className="period-public-select"><span>PERIODE</span><select value={period} aria-label="Periode laporan" onChange={e=>setPeriod(e.target.value)}>{PERIOD_OPTIONS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
      </div>
    </header>

    <div className="shell">
      <aside className="side">
        <div className="side-heading"><span>MONITORING</span><b>Realisasi Kinerja</b></div>
        {[
          ['dashboard','⌂','Dashboard'],['realisasi','◒','Realisasi'],['kinerja','◫','Kinerja'],['penugasan','◎','Penugasan']
        ].map(([id,ic,t])=><button key={id} className={tab===id?'nav active':'nav'} onClick={()=>setTab(id)}><span>{ic}</span>{t}<i>›</i></button>)}
        <div className="side-card">
          <div className="orbit-mini"><span className="orbit-dot"/></div>
          <small>DATA INSPEKTORAT</small>
          <b>Kabupaten Mahakam Ulu</b>
          <span>TA {year}</span>
        </div>
        <div className="side-foot">Pemantauan kinerja terintegrasi dalam satu tampilan publik.</div>
      </aside>

      <main className="main">
        <div className="ambient a1"/><div className="ambient a2"/><div className="grid-glow"/>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">INSPEKTORAT DAERAH • TA {year} • {PERIOD_OPTIONS.find(p=>p.value===period)?.label}</span>
            <h1 className="hero-title-animated"><span>{sourceTitle.split(' ')[0]}</span> <em>{sourceTitle.split(' ').slice(1).join(' ')}</em></h1>
            <p>Pusat visualisasi capaian anggaran, realisasi fisik, penugasan PKPT, output, dan kelengkapan kertas kerja Inspektorat Kabupaten Mahakam Ulu.</p>
            <div className="hero-line"><span/><span/><span/><span/><span/></div>
          </div>
          <div className={`hero-orb p${pulse%4}`} aria-hidden="true">
            <div className="orb-ring r1"/><div className="orb-ring r2"/><div className="orb-ring r3"/>
            <div className="orb-core-with-label">
              <div className="orb-core"><img src="/assets/logo-mahakam-ulu.png" alt=""/></div>
              <span className="orb-label-sikap orb-label-sikap-animated">SIKAP</span>
            </div>
            <i className="orbit-point d1"/><i className="orbit-point d2"/><i className="orbit-point d3"/>
          </div>
        </section>

        {loading&&!data?<LoadingScreen progress={loadProgress} year={year}/>:error&&!data?<ConnectionPanel error={error} code={errorCode} stage={errorStage} year={year} period={period} lastAttempt={lastAttempt} attemptCount={attemptCount} loading={loading} diagnostic={diagnostic} checking={checking} onRetry={()=>load(true)} onCheck={checkConnection}/>:<>
          {data&&syncState==='stale'&&<div className="sources-warning" role="status"><b>Data cadangan — sinkronisasi langsung sedang terganggu</b><p>Indikator di bawah berasal dari pembacaan Google Sheets terakhir yang berhasil. Waktu data: {data.updatedAt?new Date(data.updatedAt).toLocaleString('id-ID'):'tidak diketahui'}. Gunakan Muat ulang atau diagnostik untuk memeriksa koneksi terbaru.</p><div className="retry-actions"><button type="button" onClick={()=>load(true)}>Muat ulang sekarang</button><button type="button" onClick={checkConnection} disabled={checking}>{checking?'Memeriksa…':'Periksa koneksi'}</button></div><DiagnosticDetails diagnostic={diagnostic}/></div>}
          {data?.formulaHealth?.errorsFound>0&&<div className="sources-warning" role="alert"><b>Perlu pemeriksaan rumus sumber: {data.formulaHealth.errorsFound} sel error terdeteksi</b><p>{(data.formulaHealth.examples||[]).slice(0,5).map(x=>`${x.sheet} (baris ${x.row}, kolom ${x.column}): ${x.error}`).join(' • ')}. Perbaiki melalui Web Kertas Kerja, kemudian muat ulang Dashboard. Angka yang tidak valid tidak dipaksakan menjadi nol.</p><button onClick={()=>load(true)} type="button">Periksa ulang hasil perbaikan</button></div>}
          {data?.partial&&<div className="sources-warning" role="status"><b>Data belum lengkap ({data.availableSheetCount}/{data.expectedSheetCount} sheet utama)</b><p>{data.missingSheets?.length>0?`Sheet belum ditemukan: ${data.missingSheets.join(', ')}. `:''}{data.emptySheets?.length>0?`Sheet masih kosong: ${data.emptySheets.join(', ')}. `:''}Indikator tanpa data valid ditampilkan sebagai —, bukan 0.</p><button onClick={checkConnection} type="button">Periksa sumber data</button></div>}
          {error&&data&&<div className="sources-warning" role="status"><b>Menampilkan data terakhir yang tersedia — belum tersinkron</b><p>{error} {errorCode&&<code>{errorCode}</code>}</p><div className="retry-actions"><button onClick={()=>load(true)} type="button">{loading?'Memeriksa…':'Coba sinkronkan lagi'}</button><button onClick={checkConnection} type="button" disabled={checking}>{checking?'Memeriksa sumber…':'Diagnostik koneksi'}</button></div><DiagnosticDetails diagnostic={diagnostic}/></div>}
          {tab==='dashboard'&&<Dashboard cards={cards} k={k} data={data} onKpi={setActiveKpi}/>} 
          {tab==='realisasi'&&<Realisasi k={k} onKpi={setActiveKpi}/>} 
          {tab==='kinerja'&&<Kinerja k={k} onKpi={setActiveKpi}/>} 
          {tab==='penugasan'&&<Penugasan k={k} onKpi={setActiveKpi}/>} 
        </>}
        <footer>© {year} Inspektorat Daerah Kabupaten Mahakam Ulu • (SIKAP) Sistem Informasi Kinerja dan Pengawasan</footer>
      </main>
    </div>
    {activeKpi&&<KpiModal kpi={activeKpi} k={k} data={data} year={year} period={period} onClose={()=>setActiveKpi(null)}/>} 
  </div>
}


function DiagnosticDetails({diagnostic}){
  if(!diagnostic)return null;
  return <div className={`connection-diagnostics ${diagnostic.ok?'diag-ok':'diag-bad'}`} role="status">
    <b>{diagnostic.ok?'Pemeriksaan sumber berhasil':'Sumber data belum siap'} <code>{diagnostic.code}</code></b>
    <p>{diagnostic.message}</p>
    {diagnostic.present===false&&<p>Minimal salah satu variable Google Sheets belum ditemukan di lingkungan Production Dashboard SIKAP.</p>}
    {diagnostic.valid===false&&diagnostic.present!==false&&<p>Periksa format JSON service account Dashboard pada Secret Cloudflare.</p>}
    {Number.isFinite(diagnostic.found)&&<p>Sheet utama ditemukan: {diagnostic.found}/{diagnostic.expected||14}{diagnostic.missing?.length?`. Belum tersedia: ${diagnostic.missing.join(', ')}`:''}.</p>}
    {diagnostic.fingerprint&&<small>Fingerprint spreadsheet: <code>{diagnostic.fingerprint}</code> (bandingkan dengan diagnostik operator bila perlu)</small>}
  </div>;
}
function ConnectionPanel({error,code,stage,year,period,lastAttempt,attemptCount,loading,diagnostic,checking,onRetry,onCheck}){
  const label=PERIOD_OPTIONS.find(x=>x.value===period)?.label||period;
  return <section className="error panel connection-panel" role="alert">
    <div className="error-icon" aria-hidden="true">!</div>
    <div className="connection-content"><span className="eyebrow">SUMBER DATA • TA {year} • {label}</span>
      <h2>Data belum dapat ditampilkan</h2>
      <p>{error}</p>
      <div className="connection-meta"><code>{code||'CONNECTION_FAILED'}</code><span>Percobaan: {attemptCount}</span>{stage&&stage!=='unknown'&&<span>Tahap: {stage==='metadata'?'pemeriksaan sumber':stage==='values'?'pengambilan nilai':stage}</span>}{lastAttempt&&<span>Terakhir diperiksa {lastAttempt.toLocaleTimeString('id-ID')}</span>}</div>
      <p className="connection-help">Dashboard membaca Google Sheets secara mandiri. Tombol di bawah mencoba koneksi baru; bila tetap gagal, gunakan diagnostik untuk mengetahui jenis masalahnya.</p>
      <div className="retry-actions"><button className="retry-primary" type="button" onClick={onRetry} aria-busy={loading}><span className="refresh-symbol">↻</span>{loading?' Memeriksa…':' Muat ulang data'}</button><button className="retry-secondary" type="button" onClick={onCheck} disabled={checking}>{checking?'Memeriksa sumber…':'Periksa koneksi sumber'}</button></div>
      <DiagnosticDetails diagnostic={diagnostic}/>
    </div>
  </section>;
}

function LoadingScreen({progress=0,year=2026}){
  const p=Math.max(0,Math.min(100,Math.round(progress)));
  const status=p<25?'Menyiapkan dashboard…':p<55?'Menghubungkan sumber data…':p<85?'Memuat data kinerja…':p<100?'Menyiapkan tampilan…':'Dashboard siap';
  return <div className="loading-screen" role="status" aria-live="polite" aria-label={`Memuat dashboard ${p} persen`}>
    <div className="loading-shell">
      <div className="loading-orbit">
        <div className="loading-ring ring-a"/>
        <div className="loading-ring ring-b"/>
        <div className="loading-ring ring-c"/>
        <div className="loading-logo-wrap">
          <span className="loading-logo-glow"/>
          <img className="loading-logo" src="/assets/favicon.png" alt="Logo Inspektorat"/>
        </div>
      </div>
      <div className="loading-brand loading-brand-animated">INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU</div>
      <h2 className="loading-title-animated">(SIKAP) SISTEM INFORMASI KINERJA DAN PENGAWASAN</h2>
      <p>{status} Proses ini tidak mengubah data di spreadsheet.</p>
      <div className="loading-progress">
        <div className="loading-progress-head"><span>MEMUAT DATA</span><strong>{p}%</strong></div>
        <div className="loading-track"><i style={{width:`${p}%`}}/></div>
      </div>
      <div className="loading-meta"><span><i/>Sinkronisasi sumber</span><span>TA {year}</span></div>
    </div>
  </div>
}

function MetricIcon({id}){
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {id==='budget'?<><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M7 4h11"/><circle cx="17" cy="15" r="1"/></>:
     id==='financial'?<><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-7"/><path d="M15 6h4v4"/></>:
     id==='serapan'?<><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 4"/></>:
     id==='physical'?<><path d="M3 12h4l3-6 4 12 3-7h4"/></>:
     id==='pkpt'?<><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6M14 15c4-1 8 1 8 5"/></>:
     <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>}
  </svg>;
}

function Dashboard({cards,k,data,onKpi}){return <>
  <div className="kpis">{cards.map(c=><button type="button" aria-label={`Lihat detail ${c.label}`} className={`kpi tone-${c.tone}`} key={c.id} onClick={()=>onKpi(c)}>
    <div className="kpi-head"><span className="kpi-icon"><MetricIcon id={c.id}/></span><span className="kpi-link">LIHAT GRAFIK <b>↗</b></span></div>
    <label>{c.label}</label><strong title={c.value}>{c.value}</strong><p>{c.note}</p>
    {typeof c.progress==='number'?<div className="mini-progress"><i style={{width:`${c.progress}%`}}/></div>:<div className="kpi-decor-svg"><svg viewBox="0 0 140 24" aria-hidden="true"><path d="M2 19 Q18 14 30 16 T58 11 T86 14 T112 7 T138 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="138" cy="8" r="3" fill="currentColor"/></svg></div>}
  </button>)}</div>

  <section className="panel official-monev-panel"><div className="panel-title"><span>SUMBER EXCEL TERBARU</span><b>Laporan Monitoring & Evaluasi Renaksi Resmi</b><small>{data?.officialReport?.name||'Laporan_Monev_Renaksi_2026'}</small></div>{data?.officialReport?.available?<><div className="official-monev-values"><button className="drilldown-tile" onClick={()=>onKpi({id:'official',label:'Kegiatan Monev Resmi',value:num(data.officialReport.activities),note:'Kegiatan dengan pagu anggaran pada sheet laporan resmi'})}><small>KEGIATAN DENGAN PAGU</small><strong>{num(data.officialReport.activities)}</strong></button><button className="drilldown-tile" onClick={()=>onKpi({id:'official',label:'Anggaran Laporan Monev',value:money(data.officialReport.plannedBudget),note:'Total pagu pada sheet laporan resmi, tidak digandakan pada KPI utama'})}><small>ANGGARAN DALAM LAPORAN</small><strong>{money(data.officialReport.plannedBudget)}</strong></button><button className="drilldown-tile" onClick={()=>onKpi({id:'official',label:'Realisasi Laporan Monev',value:money(data.officialReport.realizedBudget),note:'Belum diisi berarti tidak ada angka, bukan nol'})}><small>REALISASI KEUANGAN LAPORAN</small><strong>{data.officialReport.realizedBudget===null?'Belum diisi':money(data.officialReport.realizedBudget)}</strong></button><button className="drilldown-tile" onClick={()=>onKpi({id:'official',label:'Realisasi Belum Diisi',value:num(data.officialReport.missingRealizations),note:'Jumlah kegiatan dengan nilai realisasi belum tersedia'})}><small>REALISASI BELUM DIISI</small><strong>{num(data.officialReport.missingRealizations)} kegiatan</strong></button></div><p>Angka laporan resmi dihitung dari kolom O, T, dan U pada Excel, terpisah dari KPI keuangan induk. Kolom U kosong pada file acuan; nilai kosong tidak dianggap Rp0.</p></>:<p>Sheet laporan resmi belum ditemukan pada sumber data periode ini. KPI utama tetap berasal dari sheet inti yang tersedia.</p>}</section>
  <div className="dashboard-grid">
    <section role="button" tabIndex={0} aria-label="Detail serapan anggaran" onClick={()=>onKpi({id:'serapan',label:'Serapan Anggaran',value:pct(k.serapan),note:'Realisasi Keuangan ÷ Total Anggaran × 100'})} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onKpi({id:'serapan',label:'Serapan Anggaran',value:pct(k.serapan)})}}} className="panel panel-large gauge-panel interactive-panel">
      <div className="panel-title"><span>REALISASI KEUANGAN</span><b>Serapan Anggaran</b><small>{pct(k.serapan)}</small></div>
      <div className="gauge-wrap"><div className="gauge" style={{'--p':`${clamp(k.serapan)}%`}}><div><strong>{pct(k.serapan)}</strong><small>SERAPAN</small></div></div><div className="gauge-caption">Realisasi dibanding total anggaran</div></div>
      <div className="stats stats-grid">
        <div><small>ANGGARAN</small><b>{money(k.totalAnggaran)}</b></div>
        <div><small>REALISASI</small><b>{money(k.realisasiKeuangan)}</b></div>
        <div><small>SISA DANA</small><b>{money(k.sisaDana)}</b></div>
        <div><small>REALISASI FISIK</small><b>{pct(k.realisasiFisik)}</b></div>
      </div>
    </section>

    <section className="panel performance-panel interactive-panel">
      <div className="panel-title"><span>CAPAIAN KINERJA</span><b>Profil Realisasi</b><small>8 indikator</small></div>
      <div className="profile-bars">{[
        ['Strategis',k.capaian?.strategic],['Program',k.capaian?.program],['Kegiatan',k.capaian?.kegiatanUtama],['Penunjang',k.capaian?.kegiatanPenunjang],['Sub-U',k.capaian?.subUtama],['Sub-P',k.capaian?.subPenunjang],['Renaksi',k.capaian?.renaksi],['Monev',k.capaian?.monevProgram]
      ].map(([n,v])=><button type="button" aria-label={`Detail capaian ${n}`} onClick={()=>onKpi({id:'capaian',label:`Capaian ${n}`,value:pct(v),progress:v,note:'Indikator kinerja dari sheet capaian terkait'})} className="profile-bar" key={n}><span style={{height:`${v==null?0:Math.max(7,clamp(v))}%`}}/><b>{n}</b><small>{pct(v)}</small></button>)}</div>
    </section>

    <section role="button" tabIndex={0} aria-label="Detail penugasan PKPT" onClick={()=>onKpi({id:'pkpt',label:'Progress Penugasan PKPT',value:num(k.penugasan),note:'Selesai, berjalan, dan belum ditugaskan'})} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onKpi({id:'pkpt',label:'Progress Penugasan PKPT',value:num(k.penugasan)})}}} className="panel pkpt-panel interactive-panel">
      <div className="panel-title"><span>STATUS PKPT</span><b>Progress Penugasan</b><small>{num(k.penugasan)} total</small></div>
      <div className="stack"><i style={{width:`${ratio(k.selesai,k.penugasan)||0}%`}}/><i style={{width:`${ratio(k.berjalan,k.penugasan)}%`}}/><i style={{width:`${ratio(k.belum,k.penugasan)}%`}}/></div>
      <div className="legend"><span><i className="done"/>Selesai <b>{num(k.selesai)}</b></span><span><i className="running"/>Berjalan <b>{num(k.berjalan)}</b></span><span><i className="pending"/>Belum <b>{num(k.belum)}</b></span></div>
      <div className="output"><div><small>OUTPUT UTAMA</small><b>{num(k.outputUtama)}</b></div><div><small>OUTPUT PENUNJANG</small><b>{num(k.outputPenunjang)}</b></div></div>
    </section>
  </div>

  <section className="panel coverage">
    <div className="panel-title"><span>CAKUPAN KERTAS KERJA</span><b>Cakupan baris berisi per sumber (indikatif)</b><small>{pct(data?.overallCompleteness)} baris terisi</small></div>
    <div className="coverage-grid">{(data?.sheets||[]).map(s=><button type="button" className={`coverage-item ${s.available===false?'source-unavailable':''}`} key={s.name} onClick={()=>onKpi({id:'sheet',label:s.name,value:pct(s.percent),progress:s.percent,note:s.available===false?'Sumber tidak tersedia; persentase tidak dihitung.':`Cakupan baris berisi teks: ${num(s.rows)} baris (indikatif, bukan kelengkapan kolom wajib).`})}><div><b>{s.name}</b><span>{pct(s.percent)}</span></div><div className="track"><i style={{width:`${clamp(s.percent)}%`}}/></div><small className="card-action-hint">Lihat detail ↗</small></button>)}</div>
  </section>

  <section className="summary-strip">
    <div className="summary-label"><span>RINGKASAN KINERJA</span><b>Indikator utama dashboard</b></div>
    <div className="summary-item"><strong>{pct(k.capaian?.strategic)}</strong><span>Capaian strategis</span></div>
    <div className="summary-item"><strong>{num(k.outputUtama)}</strong><span>Output utama</span></div>
    <div className="summary-item"><strong>{num(k.penugasan)}</strong><span>Penugasan PKPT</span></div>
    <div className="summary-item"><strong>{pct(data?.overallCompleteness)}</strong><span>Cakupan baris (indikatif)</span></div>
  </section>
</>}

function ratio(a,b){return a==null||b==null?null:b?Math.max(0,Math.min(100,(Number(a||0)/Number(b||0))*100)):0}
function Realisasi({k,onKpi}){const rows=[['Total Anggaran',money(k.totalAnggaran)],['Realisasi Keuangan',money(k.realisasiKeuangan)],['Sisa Dana',money(k.sisaDana)],['Serapan Keuangan',pct(k.serapan)],['Realisasi Fisik',pct(k.realisasiFisik)]];return <section><div className="section-title"><span>ANALITIK REALISASI</span><h2>Fisik & Keuangan</h2><p>Ringkasan indikator realisasi yang dibaca langsung dari sumber kinerja.</p></div><div className="metric-list">{rows.map(([a,b])=><button key={a} onClick={()=>onKpi({label:a,value:b,note:'Nilai dihitung dan dibaca dari sumber data pusat.'})}><span>{a}</span><strong>{b}</strong><em>↗</em></button>)}</div><div className="panel formula"><span>LOGIKA PERHITUNGAN</span><b>Serapan Keuangan = Realisasi Keuangan ÷ Anggaran × 100</b><b>Realisasi Fisik = nilai fisik resmi/tertimbang dari sumber</b><b>Sisa Dana = Anggaran − Realisasi Keuangan</b></div></section>}
function Kinerja({k,onKpi}){const items=[['Sasaran Strategis',k.capaian?.strategic],['Sasaran Program',k.capaian?.program],['Kegiatan Utama',k.capaian?.kegiatanUtama],['Kegiatan Penunjang',k.capaian?.kegiatanPenunjang],['Subkegiatan Utama',k.capaian?.subUtama],['Subkegiatan Penunjang',k.capaian?.subPenunjang],['Monev Renaksi IKU',k.capaian?.renaksi],['Monev Program',k.capaian?.monevProgram]];return <section><div className="section-title"><span>MONITORING</span><h2>Kinerja & Evaluasi</h2><p>Perbandingan capaian antar kelompok sumber dalam tampilan visual yang ringkas.</p></div><div className="performance-grid">{items.map(([n,v])=><button type="button" className="perf panel interactive-panel" key={n} onClick={()=>onKpi({id:'capaian',label:n,value:pct(v),progress:v,note:'Capaian dari tabel sumber kinerja sesuai Excel'})}><div><b>{n}</b><strong>{pct(v)}</strong></div><div className="track"><i style={{width:`${clamp(v)}%`}}/></div><small className="card-action-hint">Klik untuk melihat grafik ↗</small></button>)}</div></section>}
function Penugasan({k,onKpi}){return <section><div className="section-title"><span>PKPT</span><h2>Progress Penugasan</h2><p>Ringkasan status penugasan dan jumlah output pada tahun anggaran terpilih.</p></div><div className="pen-grid"><button type="button" className="big-num panel interactive-panel" onClick={()=>onKpi({id:'pkpt',label:'Total Penugasan',value:num(k.penugasan)})}><strong>{num(k.penugasan)}</strong><span>Total penugasan</span></button>{[['Selesai',k.selesai],['Berjalan',k.berjalan],['Belum',k.belum]].map(([n,v])=><button type="button" className="status panel interactive-panel" key={n} onClick={()=>onKpi({id:'pkpt',label:`Penugasan ${n}`,value:num(v),note:`${pct(ratio(v,k.penugasan))} dari seluruh penugasan`})}><small>{n}</small><strong>{num(v)}</strong><span>{pct(ratio(v,k.penugasan))} dari total</span></button>)}</div><div className="panel output-grid">{[['OUTPUT UTAMA',k.outputUtama],['OUTPUT PENUNJANG',k.outputPenunjang],['TOTAL OUTPUT',outputTotal(k)]].map(([title,v])=><button type="button" className="drilldown-tile" key={title} onClick={()=>onKpi({id:'output',label:title,value:num(v),note:'Jumlah berasal dari rekap output pada sheet Monev'})}><small>{title}</small><strong>{num(v)}</strong></button>)}</div></section>}
// All detail charts use ONLY values returned by the Google Sheets API.
// Neither random bars nor invented monthly trends are rendered.
function SvgProgressRing({value,caption='CAPAIAN'}){
  const valid=value!==null&&value!==undefined&&Number.isFinite(Number(value));
  const p=valid?clamp(value):0, radius=56,circ=2*Math.PI*radius;
  return <svg className="detail-ring-svg" viewBox="0 0 160 160" role="img" aria-label={valid?`${caption} ${pct(value)}`:`${caption} tidak tersedia`}>
    <defs><linearGradient id="detail-ring-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#92e6cc"/><stop offset="100%" stopColor="#ebd484"/></linearGradient></defs>
    <circle cx="80" cy="80" r={radius} fill="none" stroke="#254149" strokeWidth="13"/>
    <circle className="detail-progress-arc" cx="80" cy="80" r={radius} fill="none" stroke="url(#detail-ring-gradient)" strokeWidth="13" strokeLinecap="round" transform="rotate(-90 80 80)" strokeDasharray={`${circ*p/100} ${circ}`} />
    <text x="80" y="78" textAnchor="middle" fill="#effcf9" fontSize="22" fontWeight="800">{pct(valid?value:null)}</text><text x="80" y="98" textAnchor="middle" fill="#95b7b0" fontSize="9" letterSpacing="2">{caption}</text>
  </svg>;
}
function SvgCompareBars({items=[]}){
  const valid=items.filter(x=>Number.isFinite(Number(x.value))&&x.value!==null&&x.value!==undefined);
  const max=Math.max(1,...valid.map(x=>Number(x.value)));
  return <div className="detail-chart" role="img" aria-label={valid.map(x=>`${x.label}: ${num(x.value)}`).join(', ')||'Data belum tersedia'}>
   {items.map((item,i)=>{const validValue=item.value!==null&&item.value!==undefined&&Number.isFinite(Number(item.value));const width=validValue?Math.max(Number(item.value)>0?1:0,Math.max(0,Number(item.value))/max*100):0;return <div className="detail-bar-row" key={i}><div className="detail-bar-top"><span>{item.label}</span><b>{item.display??(validValue?num(item.value):'—')}</b></div><div className="detail-bar-track"><i style={{'--bar-width':`${width}%`,background:item.color||'linear-gradient(90deg,#84d9c9,#d6df9b)'}}/></div></div>;})}
  </div>;
}
function KpiModal({kpi,k,data,year,period,onClose}){
  useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose]);
  const id=kpi.id;
  const budget=k.totalAnggaran,financial=k.realisasiKeuangan;
  const percent=id==='serapan'?k.serapan:id==='physical'?k.realisasiFisik:id==='capaian'||id==='sheet'?kpi.progress:null;
  let bars=[];
  if(['budget','financial','serapan','physical'].includes(id))bars=[{label:'Total anggaran',value:budget,display:money(budget)},{label:'Realisasi keuangan',value:financial,display:money(financial)},{label:'Sisa anggaran',value:k.sisaDana,display:money(k.sisaDana)}];
  else if(id==='pkpt')bars=[{label:'Selesai',value:k.selesai},{label:'Berjalan',value:k.berjalan,color:'linear-gradient(90deg,#e7cb83,#e0e1a4)'},{label:'Belum',value:k.belum,color:'linear-gradient(90deg,#93bcf8,#b3aeeb)'}];
  else if(id==='output')bars=[{label:'Output utama',value:k.outputUtama},{label:'Output penunjang',value:k.outputPenunjang,color:'linear-gradient(90deg,#afc6ff,#bdabfb)'}];
  else if(id==='official'){const r=data?.officialReport||{};bars=[{label:'Kegiatan dengan pagu',value:r.activities},{label:'Realisasi telah diisi',value:r.reportedRealizations},{label:'Realisasi belum diisi',value:r.missingRealizations,color:'linear-gradient(90deg,#e7cc8e,#efd4af)'}];}
  return <div className="modal-back" onClick={onClose} role="presentation"><section className="modal detailed-kpi-modal" role="dialog" aria-modal="true" aria-labelledby="kpi-dialog-title" onClick={e=>e.stopPropagation()}><button className="close" onClick={onClose} aria-label="Tutup detail">×</button><span className="eyebrow">DETAIL INDIKATOR • TA {year} • {PERIOD_OPTIONS.find(x=>x.value===period)?.label||'Tahunan'}</span><h2 id="kpi-dialog-title">{kpi.label}</h2><div className="modal-number" title={kpi.value}>{kpi.value??'—'}</div><p>{kpi.note||'Nilai berdasarkan pembacaan Google Sheets pusat, untuk tahun dan periode yang dipilih.'}</p>
    {percent!==null?<div className="detail-modal-grid"><SvgProgressRing value={percent} caption="PERSENTASE"/><div className="detail-data-caption"><strong>Persentase sumber</strong><span>Nilai diambil dari indikator terpilih. Angka tidak tersedia ditampilkan sebagai —, bukan nol.</span><small>{data?.updatedAt?'Dihitung saat: '+new Date(data.updatedAt).toLocaleString('id-ID'):''}</small></div></div>:null}
    {bars.length>0&&<SvgCompareBars items={bars}/>}
    <div className="formula-box"><small>SUMBER & SINKRONISASI</small><b>{id==='sheet'?kpi.label:id==='official'?data?.officialReport?.name:id==='pkpt'?'Rekap realisasi PKPT':id==='output'?'Monev output Subkegiatan Utama dan Penunjang':id==='capaian'?'Sheet Capaian / Monev': 'Realisasi Fisik & Keu'}</b><span>Dashboard mengambil sumber langsung dari Google Sheets meskipun website Kertas Kerja ditutup. Penyegaran otomatis berlangsung saat tab aktif; informasi dapat tertunda karena cache/koneksi.</span></div>
    <div className="detail-modal-actions"><button onClick={onClose}>Tutup detail</button></div>
  </section></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
