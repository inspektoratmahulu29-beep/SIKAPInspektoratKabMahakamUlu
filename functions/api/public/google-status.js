import { batchGetSheets, quoteSheet, getSheetTitles } from '../../lib/google.js';

export async function onRequestGet({ env }) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'GOOGLE_CONFIG_MISSING'
    }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  try {
    const titles = await getSheetTitles(env);
    const sample = titles.includes('2026__IKU') ? '2026__IKU' : titles.includes('IKU') ? 'IKU' : titles.find(x => /(?:^|__)IKU$/i.test(x));
    if(!sample) return new Response(JSON.stringify({ok:false,code:'NO_KERTAS_KERJA',message:'Sheet IKU belum tersedia di spreadsheet pusat.'}),{status:404,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    const result = await batchGetSheets(env, [`${quoteSheet(sample)}!A1:A1`]);
    return new Response(JSON.stringify({
      ok: true,
      code: 'GOOGLE_SHEETS_OK',
      ranges: (result.valueRanges || []).map(v => v.range).filter(Boolean)
    }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch (error) {
    const message = String(error?.message || '');
    const code = message.includes('403') || message.includes('SERVICE_DISABLED')
      ? 'GOOGLE_SHEETS_API_DISABLED'
      : message.includes('Google OAuth')
      ? 'GOOGLE_AUTH_FAILED'
      : 'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({ event: 'google_status_error', code, message, at: new Date().toISOString() }));
    return new Response(JSON.stringify({
      ok: false,
      code,
      message: code === 'GOOGLE_SHEETS_API_DISABLED'
        ? 'Aktifkan Google Sheets API pada project Service Account.'
        : 'Koneksi Google Sheets belum berhasil.'
    }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}
