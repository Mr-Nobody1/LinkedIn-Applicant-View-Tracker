// Service worker (background)
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const jobCache = new Map();

function setCache(jobId, data){ jobCache.set(jobId, { ...data, ts: Date.now() }); }
function getCache(jobId){ const v = jobCache.get(jobId); if(!v) return null; if(Date.now()-v.ts > CACHE_TTL_MS){ jobCache.delete(jobId); return null; } return v; }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GET_JOB_DATA' && msg.jobId) { sendResponse({ ok:true, data: getCache(msg.jobId) ? { applies:getCache(msg.jobId).applies, views:getCache(msg.jobId).views } : null }); return true; }
  if (msg?.type === 'CACHE_JOB_DATA' && msg.jobId) { setCache(msg.jobId, { applies: msg.applies ?? null, views: msg.views ?? null }); sendResponse({ ok:true }); return true; }
  if (msg?.type === 'INJECT_INTERCEPTOR') {
    const tabId = msg.tabId || sender?.tab?.id; if (!tabId) { sendResponse({ ok:false, error:'No tabId' }); return true; }
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      func: () => {
        try {
          const send = (payload) => window.postMessage({ type: 'LI_JI_DATA', payload }, '*');
          const idFrom = (u) => { const m = (u||'').match(/jobPostings\/(\d+)/); return m?m[1]:null; };
          const find = (o,d=0) => { if(!o||typeof o!=='object'||d>10) return {applies:null,views:null}; let a=null,v=null; const ak=['applies','applicationCount','numApplicants','applicantCount','totalApplications']; const vk=['views','viewCount','numViews','totalViews']; for(const k of ak){ if(typeof o[k]==='number') a=o[k]; } for(const k of vk){ if(typeof o[k]==='number') v=o[k]; } if(a!==null||v!==null) return {applies:a,views:v}; for(const k in o){ try{ const r=find(o[k],d+1); if(r.applies!==null||r.views!==null) return r; }catch(e){} } return {applies:null,views:null}; };
          if (!window.__liInterceptPatched) {
            window.__liInterceptPatched = true;
            const ofetch = window.fetch; window.fetch = function(...args){ const u=args[0]; const isTarget = typeof u==='string' && u.includes('/voyager/api/jobs/jobPostings'); return ofetch.apply(this,args).then(r=>{ if(isTarget){ try{ r.clone().json().then(j=>{ const id=idFrom(u); const {applies,views}=find(j); if(id&&(applies!==null||views!==null)) send({ jobId:id, applies, views, source:'page-intercept' }); }).catch(()=>{}); }catch(e){} } return r; }); };
            const oopen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function(m,u,...rest){ this.__li_u=u; return oopen.call(this,m,u,...rest); };
            const osend = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function(...a){ this.addEventListener('load', function(){ try{ if(this.__li_u && this.__li_u.includes('/voyager/api/jobs/jobPostings')){ const id=idFrom(this.__li_u); const j=JSON.parse(this.responseText); const {applies,views}=find(j); if(id&&(applies!==null||views!==null)) send({ jobId:id, applies, views, source:'page-intercept' }); } }catch(e){} }); return osend.apply(this,a); };
          }
        } catch (e) {}
      }
    }).then(() => sendResponse({ ok:true })).catch((e)=>{ console.error('Injection failed', e); sendResponse({ ok:false, error:String(e) }); });
    return true;
  }
});
