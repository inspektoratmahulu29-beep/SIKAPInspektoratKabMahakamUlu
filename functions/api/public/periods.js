/** Discover real year/month/quarter/semester snapshots in KKK's master. */
import {sheetsMeta,masterSourceMode} from '../../lib/google.js';
import {periodCatalog} from '../../lib/period-catalog.js';
export async function onRequestGet({env}){
  try{
    const meta=await sheetsMeta(env);
    const result=periodCatalog((meta.sheets||[]).map(s=>s.properties?.title).filter(Boolean));
    return Response.json({ok:true,...result,sourceMode:masterSourceMode(env)},{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch(error){
    const code=error?.code||'PERIOD_SOURCE_UNAVAILABLE';
    console.error(JSON.stringify({event:'period_catalog_failed',code,httpStatus:Number(error?.status||0)}));
    return Response.json({ok:false,code,message:'Daftar periode belum dapat dibaca dari master Kertas Kerja.'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
