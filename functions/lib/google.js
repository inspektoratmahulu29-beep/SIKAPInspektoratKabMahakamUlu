const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUEST_TIMEOUT_MS = 8500;
const MAX_ATTEMPTS = 2;
// Keep total upstream retries below the dashboard's 25-second request deadline for normal failures.
let tokenCache = null;

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function textBase64url(text) { return base64url(new TextEncoder().encode(text)); }
function pemToArrayBuffer(pem) {
  const body = String(pem || '').replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export async function getGoogleAccessToken(serviceAccountJson) {
  const now = Math.floor(Date.now() / 1000);
  let sa;
  try { sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson; }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON invalid'); }
  if (!sa?.client_email || !sa?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON tidak lengkap');
  const cacheIdentity=`${sa.client_email}:${sa.private_key_id||sa.private_key.slice(-80)}`;
  if(tokenCache?.identity===cacheIdentity&&tokenCache.expiresAt-now>120)return tokenCache.accessToken;
  const unsigned = `${textBase64url(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${textBase64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.private_key), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  let resp;
  try{resp = await fetch(TOKEN_URL, {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},signal:controller.signal,
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${base64url(new Uint8Array(signature))}`})});}
  catch(error){const e=new Error(error?.name==='AbortError'?'Google OAuth timeout':'Google OAuth network failure');e.status=error?.name==='AbortError'?504:0;throw e;}
  finally{clearTimeout(timer);}
  if (!resp.ok) {const e=new Error(`Google OAuth ${resp.status}: ${(await resp.text()).slice(0,400)}`);e.status=resp.status;throw e;}
  const data = await resp.json();
  tokenCache = { identity:cacheIdentity,accessToken: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return data.access_token;
}
async function fetchJson(url, options = {}) {
  let last = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      const text = await resp.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (resp.ok) return data;
      last = new Error(data?.error?.message || `Google Sheets ${resp.status}`);
      last.status = resp.status;
      if (![429,500,502,503,504].includes(resp.status) || attempt === MAX_ATTEMPTS - 1) break;
      const retryAfter = Number(resp.headers.get('retry-after') || 0);
      await new Promise(r => setTimeout(r, retryAfter ? Math.min(5000, retryAfter*1000) : 300*(2**attempt)));
    } catch (e) {
      last = e?.name === 'AbortError' ? new Error('Google Sheets request timeout') : e;
      last.status = e?.name === 'AbortError' ? 504 : 0;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await new Promise(r => setTimeout(r, 350*(2**attempt)));
    } finally { clearTimeout(timer); }
  }
  throw last || new Error('Google Sheets unavailable');
}

/** Optional server-to-server master connection. Use this if SIKAP has no working
 * Google credentials. The URL and secret are Cloudflare server variables, NEVER
 * Vite VITE_* variables or frontend code. */
export const masterBridgeConfigured = env => Boolean(String(env?.KKK_MASTER_URL||'').trim() && String(env?.SIKAP_SYNC_SECRET||'').length >= 32);
export const masterBridgeIncomplete = env => Boolean(env?.KKK_MASTER_URL || env?.SIKAP_SYNC_SECRET) && !masterBridgeConfigured(env);
export const masterSourceMode = env => masterBridgeConfigured(env) ? 'kertas-kerja-master' : 'google-sheets';

async function masterRead(env, operation, ranges=[]) {
  let root;
  try {root=new URL(String(env.KKK_MASTER_URL||'').trim());}
  catch {const e=new Error('MASTER_SYNC_URL_INVALID');e.code='MASTER_SYNC_URL_INVALID';throw e;}
  if(root.protocol!=='https:' || !root.hostname || root.username || root.password){
    const e=new Error('MASTER_SYNC_URL_INVALID');e.code='MASTER_SYNC_URL_INVALID';throw e;
  }
  // The configured origin is resolved server-side; no incoming request controls it.
  const endpoint=new URL('/api/sync/master',root.origin);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-sikap-sync-key':env.SIKAP_SYNC_SECRET,'accept':'application/json'},body:JSON.stringify({operation,ranges}),signal:controller.signal});
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.ok){
      const error=new Error(result?.code||'MASTER_SYNC_UNAVAILABLE');
      error.code=result?.code||'MASTER_SYNC_UNAVAILABLE';error.status=response.status;throw error;
    }
    return operation==='metadata'?result.meta:operation==='revision'?result:result.data;
  }catch(error){
    if(error.name==='AbortError'){const e=new Error('MASTER_SYNC_TIMEOUT');e.code='MASTER_SYNC_TIMEOUT';e.status=504;throw e;}
    if(!error.code){error.code='MASTER_SYNC_UNAVAILABLE';error.status=error.status||503;}
    throw error;
  }finally{clearTimeout(timer);}
}
async function directMeta(env) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID belum diatur');
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return fetchJson(`${SHEETS_API}/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID)}?fields=spreadsheetId,namedRanges,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))`, {
    headers:{Authorization:`Bearer ${token}`}
  });
}
export async function masterRevision(env){
  if(!masterBridgeConfigured(env))throw Object.assign(new Error('MASTER_SYNC_CONFIG_INCOMPLETE'),{code:'MASTER_SYNC_CONFIG_INCOMPLETE'});
  return masterRead(env,'revision');
}
export async function sheetsMeta(env) {
  if(masterBridgeIncomplete(env)) {const e=new Error('MASTER_SYNC_CONFIG_INCOMPLETE');e.code='MASTER_SYNC_CONFIG_INCOMPLETE';throw e;}
  return masterBridgeConfigured(env)?masterRead(env,'metadata'):directMeta(env);
}
export async function getSheetTitles(env) {
  const meta = await sheetsMeta(env);
  return (meta.sheets || []).map(s=>s.properties.title);
}
async function directValues(env,ranges) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID belum diatur');
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID)}/values:batchGet`);
  for (const range of ranges) url.searchParams.append('ranges', range);
  url.searchParams.set('majorDimension','ROWS');
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  return fetchJson(url, {headers:{Authorization:`Bearer ${token}`}});
}
/** Keep small reads atomic. Split 28-sheet snapshots into modest groups so that
 * one oversized/transient Google result does not blank every working KPI.
 * Partial results retain exact input indices; callers must mark failed sources.
 */
export async function batchGetSheets(env,ranges){
  if(!Array.isArray(ranges)||!ranges.length)return {valueRanges:[],failedRanges:[]};
  const read=chunk=>masterBridgeConfigured(env)?masterRead(env,'values',chunk):directValues(env,chunk);
  if(ranges.length<=16)return read(ranges);
  const groups=[];for(let i=0;i<ranges.length;i+=10)groups.push({offset:i,ranges:ranges.slice(i,i+10)});
  const valueRanges=Array(ranges.length).fill(null),failedRanges=[];
  // Sequential groups avoid bursting quota limits for concurrent OPD readers;
  // the edge cache and inflight request sharing further reduce upstream usage.
  for(const group of groups){
    try{
      const response=await read(group.ranges);
      for(let i=0;i<group.ranges.length;i++)valueRanges[group.offset+i]=response.valueRanges?.[i]||{range:group.ranges[i],values:[]};
    }catch(error){
      // Incorrect credentials / a wrong spreadsheet cannot be treated as an
      // optional partial failure, otherwise the screen could show a false 0.
      if([401,403,404].includes(Number(error?.status))||/AUTH|DENIED|CREDENTIAL|NOT_FOUND|UNAUTHORIZED|CONFIG/i.test(String(error?.code||'')))throw error;
      failedRanges.push(...group.ranges.map((range,i)=>({index:group.offset+i,range,code:error?.code||'GOOGLE_READ_FAILED'})));
    }
  }
  if(failedRanges.length===ranges.length){
    const err=new Error('Semua kelompok sumber gagal dibaca');err.code='GOOGLE_SHEETS_UNAVAILABLE';err.stage='values';throw err;
  }
  return {valueRanges,failedRanges};
}
export function quoteSheet(name) { return `'${String(name).replace(/'/g,"''")}'`; }
export async function batchGetExisting(env, rangesByName) {
  const titles = await getSheetTitles(env);
  const available = new Set(titles);
  const resolved = rangesByName.filter(x => available.has(x.title));
  if (!resolved.length) return {titles, valueRanges:[]};
  const data = await batchGetSheets(env, resolved.map(x=>`${quoteSheet(x.title)}!A:${x.endCol||'Z'}`));
  return {titles, valueRanges:data.valueRanges||[]};
}
