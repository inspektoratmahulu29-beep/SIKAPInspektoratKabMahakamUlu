/** Lightweight verification of the actual master workbook revision written by Web Kertas Kerja.
 * No synthetic time bucket: a revision changes only after a successful authenticated mutation.
 */
import {sheetsMeta,batchGetSheets} from '../../lib/google.js';
export async function onRequestGet({env}){
 const headers={'cache-control':'no-store, max-age=0','content-type':'application/json; charset=utf-8'};
 try{
  const meta=await sheetsMeta(env);
  const exists=(meta.sheets||[]).some(s=>s.properties?.title==='_KK_SYNC');
  if(!exists)return Response.json({ok:true,markerAvailable:false,revision:null,reason:'MASTER_REVISION_NOT_INITIALIZED',fullRefreshFallbackMs:60000},{headers});
  const data=await batchGetSheets(env,["'_KK_SYNC'!A1:F2"]);
  const values=data.valueRanges?.[0]?.values||[];
  const second=values[1]||[];
  const revision=String(second[0]||'');
  if(!revision)return Response.json({ok:true,markerAvailable:false,revision:null,reason:'MASTER_REVISION_EMPTY',fullRefreshFallbackMs:60000},{headers});
  return Response.json({ok:true,markerAvailable:true,revision,updatedAt:second[1]||null,year:Number(second[2])||null,period:String(second[3]||'annual'),action:String(second[4]||''),count:Number(second[5])||0},{headers});
 }catch(error){
  console.error(JSON.stringify({event:'dashboard_revision_error',code:'REVISION_READ_FAILED',httpStatus:Number(error?.status||0),message:String(error?.message||'').slice(0,160)}));
  return Response.json({ok:false,code:'REVISION_READ_FAILED',markerAvailable:false,revision:null,fullRefreshFallbackMs:60000},{status:503,headers});
 }
}
