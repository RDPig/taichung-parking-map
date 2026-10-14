import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.PARKING_SOURCE_URL || 'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=1744bc00-cd16-48f3-9632-309f364662bb';
const REFRESH_MS = Math.max(60000, Number(process.env.REFRESH_SECONDS || 600) * 1000);
const MAX_STALE_MS = Math.max(REFRESH_MS, Number(process.env.MAX_STALE_SECONDS || 1800) * 1000);
let cache = { features: [], fetchedAt: null, lastAttempt: null, error: null };
let inflight;
const get = (obj, keys) => keys.map(k => obj?.[k]).find(v => v !== undefined && v !== null && v !== '');
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  for (const k of ['data','records','result','items','Data','Records']) {
    if (Array.isArray(payload?.[k])) return payload[k];
    if (payload?.[k] && typeof payload[k] === 'object') {
      const nested = rowsOf(payload[k]);
      if (nested) return nested;
    }
  }
  return null;
}
function normalize(data) {
  const rows = rowsOf(data);
  if (!rows) throw Error('來源 JSON 結構未知：找不到車格陣列');
  const features = [];
  for (const r of rows) {
    const lat = Number(get(r, ['Lat','PS_Lat','lat','latitude']));
    const lng = Number(get(r, ['Lng','PS_Lng','lng','lon','longitude']));
    const raw = get(r, ['status','Status','PS_status']);
    const status = Number(raw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 24 || lat > 25 || lng < 120 || lng > 121 || raw === undefined || ![0,1,2].includes(status)) continue;
    features.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{id:String(get(r,['PS_ID','ps_id','id']) ?? ''),section:String(get(r,['Section_ID','section_id']) ?? ''),parkingType:get(r,['PS_type','ps_type']),status}});
  }
  if (!features.length) throw Error(`來源有 ${rows.length} 筆，但沒有可辨識的有效車格；請檢查欄位`);
  return features;
}
async function refresh() {
  if (inflight) return inflight;
  inflight = (async () => {
    cache.lastAttempt = new Date().toISOString();
    try {
      const response = await fetch(SOURCE, {signal:AbortSignal.timeout(25000),headers:{'Accept':'application/json, */*'}});
      if (!response.ok) throw Error(`上游 HTTP ${response.status}`);
      const text = (await response.text()).replace(/^\uFEFF/,'');
      const data = JSON.parse(text);
      const features = normalize(data);
      cache = {...cache,features,fetchedAt:new Date().toISOString(),error:null};
    } catch (e) {cache.error = String(e.message || e); console.error('Refresh failed:', cache.error);}
  })().finally(() => { inflight = undefined; });
  return inflight;
}
app.get('/api/parking', async (req,res) => {
  if (!cache.lastAttempt || Date.now()-Date.parse(cache.lastAttempt) >= REFRESH_MS) await refresh();
  const ageMs = cache.fetchedAt ? Date.now()-Date.parse(cache.fetchedAt) : null;
  const fresh = ageMs !== null && ageMs <= MAX_STALE_MS;
  res.set('Cache-Control','no-store');
  res.status(cache.fetchedAt ? 200 : 503).json({type:'FeatureCollection',features:fresh ? cache.features : [],meta:{source:'臺中市政府開放資料',fetchedAt:cache.fetchedAt,lastAttempt:cache.lastAttempt,ageSeconds:ageMs === null ? null : Math.floor(ageMs/1000),fresh,recordCount:cache.features.length,error:cache.error}});
});
app.get('/health', (_req,res) => res.json({ok:true,hasData:!!cache.fetchedAt,error:cache.error}));
app.use(express.static(path.join(root,'public')));
app.listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log('Listening on port',process.env.PORT || 3000));
refresh();
setInterval(refresh,REFRESH_MS).unref();