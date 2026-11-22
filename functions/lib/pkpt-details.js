// PKPT is read-only public projection of the SAME master workbook used by Web 1.
// Never return other worksheets, personal notes (Ket), user data, or formulas.
// Column coordinates are the ORIGINAL workbook coordinates. NamedRanges preserve
// them if Web 1 inserts/reorders columns, with header lookup as a fallback.
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 420);
const normal = value => clean(value).toLocaleLowerCase('id-ID');
const numeric = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = clean(value);
  if (!s || /^#|^=/.test(s) || !/^-?[\d.,]+$/.test(s)) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};
const unique = xs => [...new Set(xs)];

export function projectPkptRows(sheet) {
  const values = Array.isArray(sheet?.values) ? sheet.values : [];
  const mapping = sheet?.schemaColumns || [];
  if (!mapping.length) return values;
  // Keep the entire actual row for fallback lookup, plus original-index values.
  return values.map(row => {
    const projected = [];
    for (const col of mapping) {
      if (Number.isInteger(col.original) && Number.isInteger(col.current) && col.original >= 0 && col.current >= 0) {
        projected[col.original] = row?.[col.current];
      }
    }
    return projected;
  });
}

export function classifyPkptStatus(raw) {
  const value = normal(raw);
  if (/\b(belum|tidak dilaksanakan|belum berjalan|not started)\b/.test(value) || !value) return 'belum';
  if (/\b(sedang|berjalan|proses|dalam pelaksanaan|on going|ongoing)\b/.test(value)) return 'berjalan';
  if (/\b(sudah|selesai|tuntas|rampung|completed)\b/.test(value)) return 'selesai';
  return 'lainnya';
}

function irbanMembers(label) {
  const found = [...clean(label).toUpperCase().matchAll(/\b(?:IRBAN\s*)?(III|II|IV|I|V)\b/g)].map(m => `Irban ${m[1]}`);
  return unique(found.length ? found : [clean(label) || 'Belum ditentukan']);
}

function tally(items, key, {splitIrban = false} = {}) {
  const groups = new Map();
  for (const item of items) {
    const names = splitIrban ? irbanMembers(item[key]) : [item[key] || 'Belum ditentukan'];
    for (const label of names) {
      const old = groups.get(label) || {label,total:0,selesai:0,berjalan:0,belum:0,lainnya:0};
      old.total += 1;
      old[item.status] += 1;
      groups.set(label, old);
    }
  }
  return [...groups.values()].sort((a,b) => b.total - a.total || a.label.localeCompare(b.label, 'id'));
}

export function summarizePkpt(items) {
  const summary = {total:items.length,selesai:0,berjalan:0,belum:0,lainnya:0};
  for (const item of items) summary[item.status] += 1;
  return summary;
}

export function extractPkptDetails(sheet) {
  if (!sheet || !Array.isArray(sheet.values) || !sheet.values.some(r => (r || []).some(v => clean(v)))) {
    return {available:false,source:'Rekap realisasi PKPT',items:[],summary:null,irban:[],kegiatan:[],pengawasan:[]};
  }
  const rows = projectPkptRows(sheet);
  // Master row 4 contains column labels, row 6 is enumeration; data begins row 7.
  // In a customized master, find labels instead of assuming the header's row.
  let heading = rows.findIndex(r => (r || []).some(v => /pemantauan\s+realisasi/i.test(clean(v))));
  if (heading < 0) heading = 3;
  const headings = rows[heading] || [];
  const column = (re, fallback) => {
    const i = headings.findIndex(v => re.test(normal(v)));
    return i >= 0 ? i : fallback;
  };
  const statusCol = column(/pemantauan\s+realisasi/,4);
  const detailHeader = column(/rincian\s+pelaksanaan/,2);
  const detailCol = detailHeader + 1; // source C = ordinal, D = actual description
  const kindCol = column(/jenis\s+pengawasan/,1);
  const irbanCol = column(/irban\s+pengampu/,5);
  const methodCol = column(/jenis\s+kegiatan/,7);
  const basisCol = column(/dasar\s+penugasan/,6);
  const budgetCol = column(/pembebanan\s+biaya/,8);
  const targetCol = column(/target\s+output|target\s+satuan|target.*satuan\s+hasil/,9);
  const realCol = column(/realisasi\s+output|realisasi\s+satuan|realisasi.*satuan\s+hasil/,11);
  const quarterCol = column(/triwulan/,13);
  const sectionEnd = rows.findIndex((r,i) => i > heading && (r || []).some(v => /realisasi\s+output\s+penugasan/i.test(clean(v))));
  const end = sectionEnd > heading ? sectionEnd : rows.length;
  // Skip numbered display-heading row, but support extra data rows created by imports.
  const start = heading + 1;
  let currentKind = '';
  const items = [];
  for (let i = start; i < end; i++) {
    const row = rows[i] || [];
    const detail = clean(row[detailCol]);
    const kind = clean(row[kindCol]);
    if (kind && !/^\d+$/.test(kind) && !/^(jenis pengawasan|realisasi output)/i.test(kind)) currentKind = kind;
    if (!detail || /^(rincian pelaksanaan|no\.?|jenis kegiatan)$/i.test(detail)) continue;
    // A PKPT record must have a task name AND a task-related source value.
    // This excludes group labels, column enumerations, and the output section.
    if (![statusCol,irbanCol,methodCol,basisCol,budgetCol,targetCol,realCol].some(c => clean(row[c]))) continue;
    const target = numeric(row[targetCol]);
    const realisasi = numeric(row[realCol]);
    items.push({
      id:`pkpt-${i+1}`,row:i+1,title:detail,
      jenisPengawasan:currentKind || 'Belum ditentukan',
      rawStatus:clean(row[statusCol]), status:classifyPkptStatus(row[statusCol]),
      irban:clean(row[irbanCol]) || 'Belum ditentukan',
      jenisKegiatan:clean(row[methodCol]) || 'Belum ditentukan',
      dasarPenugasan:clean(row[basisCol]),subKegiatan:clean(row[budgetCol]),
      target,realisasi,
      satuanTarget:clean(row[targetCol+1]),satuanRealisasi:clean(row[realCol+1]),
      jadwal:[0,1,2,3].map(q => clean(row[quarterCol+q]))
    });
  }
  return {available:true,source:'Rekap realisasi PKPT',items,summary:summarizePkpt(items),
    irban:tally(items,'irban',{splitIrban:true}),
    kegiatan:tally(items,'jenisKegiatan'),
    pengawasan:tally(items,'jenisPengawasan')};
}
