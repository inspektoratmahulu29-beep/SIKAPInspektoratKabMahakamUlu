/** Read-only projection of the Web 1 "Realisasi Fisik & Keu" master.
 * Source sheet: C = anggaran, E = realisasi fisik (%), G = realisasi
 * keuangan (Rp), H = persentase keuangan, J = sisa dana (Rp).
 * The INSPEKTORAT/JUMLAH BELANJA rows are summaries, NOT transactions.
 * Program totals are parent rows, not additions to their detail children.
 */
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('id');
const hasValue = value => value !== null && value !== undefined && clean(value) !== '';

export function financeNumber(value, percent = false) {
  percent = percent || /%\s*$/.test(clean(value));
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = clean(value).replace(/[\s\u00a0]/g, '').replace(/^Rp\.?/i, '').replace(/%$/, '');
  if (!s || s[0] === '=' || s[0] === '#' || !/^\(?-?[\d.,]+\)?$/.test(s)) return null;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s=s.slice(1,-1); }
  if (s.includes(',') && s.includes('.')) {
    // Indonesian thousands and decimal separator, or international format.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    if (!percent && /^-?\d{1,3}(,\d{3})+$/.test(s)) s=s.replace(/,/g, '');
    else s=s.replace(',', '.');
  } else if (!percent && (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s) || /^-?\d{1,3}\.\d{3}$/.test(s))) {
    s=s.replace(/\./g, '');
  }
  const parsed=Number(s);
  return Number.isFinite(parsed) ? (negative?-Math.abs(parsed):parsed) : null;
}

export function projectFinancialRows(sheet) {
  if (!Array.isArray(sheet?.values)) return [];
  const rows=sheet.values;
  const map=sheet.schemaColumns || [];
  if (!map.length) return rows;
  const byOld=new Map();
  for(const c of map){if(Number.isInteger(c.original)&&Number.isInteger(c.current)&&c.original>=0&&c.current>=0)byOld.set(c.original,c.current);}
  if (!byOld.size) return rows;
  return rows.map(row=>{
    const out=[];
    for(const [oldIndex,currentIndex] of byOld)out[oldIndex]=row?.[currentIndex];
    return out;
  });
}

const empty = () => ({
  available:false,source:'Realisasi Fisik & Keu',summary:null,programs:[],counts:{program:0,rincian:0},
  reconciliation:null,notes:[],columns:null
});
const rate = (part,total) => part !== null && total !== null && total !== 0 ? part/total*100 : null;
function getMeasure(row, columns) {
  const anggaran=financeNumber(row[columns.budget]);
  const realisasiKeuangan=financeNumber(row[columns.financial]);
  const realisasiFisik=financeNumber(row[columns.physical],true);
  const sumberSisa=financeNumber(row[columns.remaining]);
  const sisaDana=sumberSisa!==null?sumberSisa:anggaran!==null&&realisasiKeuangan!==null?anggaran-realisasiKeuangan:null;
  const sumberSerapan=financeNumber(row[columns.financialRate],true);
  return {
    anggaran,realisasiKeuangan,realisasiFisik,
    sisaDana,sisaDihitung:sumberSisa===null&&sisaDana!==null,
    serapanKeuangan:sumberSerapan!==null?sumberSerapan:rate(realisasiKeuangan,anggaran)
  };
}
function namedHeading(rows) {
  for(let i=0;i<Math.min(rows.length,35);i++) {
    const c=(rows[i]||[]).findIndex(v=>/^program\s*\/\s*kegiatan\s*\/\s*sub\s*kegiatan$/i.test(clean(v)));
    if(c>=0)return {row:i,name:c};
  }
  return null;
}
function detectColumns(rows,h) {
  const values=rows[h.row]||[];
  const locate=(pattern,fallback)=>{const idx=values.findIndex(v=>pattern.test(lower(v)));return idx>=0?idx:fallback;};
  const financial=locate(/^realisasi\s+keuangan$/,h.name+5);
  return {
    no:locate(/^no\.?$/,h.name-1),name:h.name,
    budget:locate(/^anggaran$/,h.name+1),
    physical:locate(/^realisasi\s+fisik$/,h.name+3),
    financial,
    // This column is the adjacent percentage to financial (rupiah) even if
    // an inserted column moves the whole financial block to the right.
    financialRate:financial+1,
    remaining:locate(/^sisa\s+dana$/,h.name+8)
  };
}
function assignKind(name,numbering) {
  if (/^sub\s*kegiatan\b/i.test(name) || /^\d+(?:\.\d+){3,}\s+/.test(name) || /^\d+(?:\.\d+){3,}$/.test(numbering)) return 'subkegiatan';
  // Code in the No column identifies an activity, including '1' used on some master rows.
  if (/^kegiatan\b/i.test(name) || /^\d+(?:\.\d+){0,2}$/.test(numbering)) return 'kegiatan';
  // In annual source, some children have no explicit row type. Preserve uncertainty.
  return 'rincian';
}

const sumKnown=(items,field)=>items.every(x=>x[field]!==null)&&items.length?items.reduce((a,x)=>a+x[field],0):null;
const delta=(a,b)=>a!==null&&b!==null?a-b:null;

export function extractFinancialDetails(sheet) {
  const out=empty();
  if (!sheet?.values?.length) {out.notes=['Sheet sumber belum tersedia atau masih kosong.'];return out;}
  const rows=projectFinancialRows(sheet);
  const header=namedHeading(rows);
  if(!header){out.notes=['Header PROGRAM/KEGIATAN/SUB KEGIATAN tidak ditemukan; rincian tidak bisa ditampilkan dengan aman.'];return out;}
  const columns=detectColumns(rows,header);
  if(columns.name<0||columns.budget<0||columns.physical<0||columns.financial<0||columns.remaining<0){out.notes=['Struktur kolom keuangan tidak valid.'];return out;}
  const officeIndex=rows.findIndex((r,i)=>i>header.row && lower(r?.[columns.name])==='inspektorat');
  const totalIndex=rows.findIndex((r,i)=>i>header.row && /jumlah\s+belanja/i.test(clean(r?.[columns.no])));
  const end=totalIndex>header.row?totalIndex:rows.length;
  const office=officeIndex>header.row?getMeasure(rows[officeIndex]||[],columns):null;
  const total=totalIndex>header.row?getMeasure(rows[totalIndex]||[],columns):null;
  const start=officeIndex>header.row?officeIndex+1:header.row+1;
  const programs=[];
  let active=null;
  let orphan=null;
  let rincian=0;
  let currentKegiatan=null;
  let inferredChildren=0;
  for(let i=start;i<end;i++){
    const r=rows[i]||[];
    const name=clean(r[columns.name]);
    if(!name || /^(?:program\s*\/\s*kegiatan|anggaran|inspektorat|jumlah belanja)$/i.test(name)) continue;
    const number=clean(r[columns.no]);
    if(/^\d+$/.test(name)) continue; // printed column enumeration
    const values=getMeasure(r,columns);
    const relevant=values.anggaran!==null||values.realisasiKeuangan!==null||values.realisasiFisik!==null||values.sisaDana!==null;
    const isProgram=/^program\s+\S/i.test(name);
    if(!relevant && !isProgram)continue;
    if(isProgram){
      active={id:`program-${i+1}`,row:i+1,name,jenis:'program',...values,items:[]};
      programs.push(active);currentKegiatan=null;continue;
    }
    // Rincian sebelum judul PROGRAM is shown, never silently discarded.
    if(!active){
      if(!orphan){orphan={id:'rincian-tanpa-program',row:i+1,name:'Rincian tanpa induk program',jenis:'kelompok-tidak-dikenal',anggaran:null,realisasiKeuangan:null,realisasiFisik:null,sisaDana:null,serapanKeuangan:null,items:[]};programs.push(orphan);}
      active=orphan;
    }
    let jenis=assignKind(name,number);
    // A blank No underneath a coded Kegiatan is a child in the visible master layout.
    // This grouping is marked as inferred, never reported as an explicitly coded type.
    const kelompokInduk=currentKegiatan&&(!number||jenis==='subkegiatan')?{parentId:currentKegiatan.id,parentName:currentKegiatan.name}:{};
    const jenisDariUrutan=jenis==='rincian'&&!number&&!!currentKegiatan;
    if(jenisDariUrutan){jenis='subkegiatan';inferredChildren++;}
    const item={id:`rincian-${i+1}`,row:i+1,name,jenis,no:number||null,jenisDariUrutan,...kelompokInduk,...values};
    active.items.push(item);
    if(jenis==='kegiatan')currentKegiatan=item;
    else if(jenis==='rincian'&&number)currentKegiatan=null;
    rincian++;
  }
  const regularPrograms=programs.filter(p=>p.jenis==='program');
  const summary=office||total||null;
  const programTotals={
    anggaran:sumKnown(regularPrograms,'anggaran'),
    realisasiKeuangan:sumKnown(regularPrograms,'realisasiKeuangan'),
    sisaDana:sumKnown(regularPrograms,'sisaDana')
  };
  const expected=summary?{
    anggaran:summary.anggaran,realisasiKeuangan:summary.realisasiKeuangan,sisaDana:summary.sisaDana,realisasiFisik:summary.realisasiFisik,
    serapanKeuangan:summary.serapanKeuangan
  }:null;
  const reconciliation={
    reference:office?'INSPEKTORAT':total?'JUMLAH BELANJA':null,
    programTotals,
    selisihAnggaran:delta(expected?.anggaran??null,programTotals.anggaran),
    selisihRealisasi:delta(expected?.realisasiKeuangan??null,programTotals.realisasiKeuangan),
    selisihSisa:delta(expected?.sisaDana??null,programTotals.sisaDana),
    selisihOfficeTotal:office&&total?delta(office.anggaran,total.anggaran):null
  };
  out.available=!!summary||regularPrograms.length>0;
  out.summary=expected;
  out.programs=programs;
  out.counts={program:regularPrograms.length,rincian,kegiatan:programs.reduce((n,p)=>n+p.items.filter(i=>i.jenis==='kegiatan').length,0),subkegiatan:programs.reduce((n,p)=>n+p.items.filter(i=>i.jenis==='subkegiatan').length,0)};
  out.reconciliation=reconciliation;
  out.columns=columns;
  if(!summary)out.notes.push('Baris total Inspektorat/Jumlah Belanja tidak ditemukan. Nilai KPI induk tetap harus diverifikasi di sumber.');
  if(programs.some(p=>p.jenis==='kelompok-tidak-dikenal'))out.notes.push('Beberapa rincian tidak memiliki induk PROGRAM pada sumber.');
  if(regularPrograms.some(p=>p.items.some(i=>i.jenis==='rincian')))out.notes.push('Sebagian baris sumber tidak membedakan kegiatan dan subkegiatan; ditampilkan sebagai rincian sesuai nama asli.');
  if(inferredChildren)out.notes.push(`${inferredChildren} baris tanpa kode kegiatan dikelompokkan sebagai subkegiatan berdasarkan urutan setelah kegiatan bernomor; jenisnya belum dinyatakan eksplisit pada master.`);
  if([reconciliation.selisihAnggaran,reconciliation.selisihRealisasi].some(x=>x!==null&&Math.abs(x)>1))out.notes.push('Jumlah program berbeda dari total induk. Periksa master sebelum menggunakan rekap sebagai dasar keputusan.');
  return out;
}
