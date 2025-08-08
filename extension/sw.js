// Service worker (background)
const log = (...a)=>console.log('[LI-JI][sw]', ...a);
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const jobCache = new Map();

function setCache(jobId, data){ jobCache.set(jobId, { ...data, ts: Date.now() }); }
function getCache(jobId){ const v = jobCache.get(jobId); if(!v) return null; if(Date.now()-v.ts > CACHE_TTL_MS){ jobCache.delete(jobId); return null; } return v; }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log('onMessage', msg?.type, { fromTab: sender?.tab?.id });
  if (msg?.type === 'GET_JOB_DATA' && msg.jobId) { sendResponse({ ok:true, data: getCache(msg.jobId) ? { applies:getCache(msg.jobId).applies, views:getCache(msg.jobId).views } : null }); return true; }
  if (msg?.type === 'CACHE_JOB_DATA' && msg.jobId) { setCache(msg.jobId, { applies: msg.applies ?? null, views: msg.views ?? null }); sendResponse({ ok:true }); return true; }
  if (msg?.type === 'INJECT_INTERCEPTOR') {
    const tabId = msg.tabId || sender?.tab?.id; if (!tabId) { sendResponse({ ok:false, error:'No tabId' }); return true; }
    log('Injecting interceptor into tab', tabId);
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      func: () => {
        try {
          const ilog = (...a)=>{ try { console.log('[LI-JI][intercept]', ...a); } catch(_){} };
          const send = (payload) => { ilog('postMessage LI_JI_DATA', payload); window.postMessage({ type: 'LI_JI_DATA', payload }, '*'); };
          const safeParse = (txt) => {
            if (typeof txt !== 'string') return null;
            const s = txt.trim().replace(/^for\s*\([^)]*\);?\s*/,'').replace(/^while\s*\(1\);?\s*/,'');
            try { return JSON.parse(s); } catch(e){ ilog('JSON.parse failed', e); return null; }
          };
          const idFrom = (u) => { const m = (u||'').match(/jobPostings\/(\d+)/); return m?m[1]:null; };
          const find = (o,d=0) => { if(!o||typeof o!=='object'||d>10) return {applies:null,views:null}; let a=null,v=null; const ak=['applies','applicationCount','numApplicants','applicantCount','totalApplications','totalApplicantCount']; const vk=['views','viewCount','numViews','totalViews','viewers','jobViewCount','jobViewersCount']; for(const k of ak){ if(typeof o[k]==='number') a=o[k]; } for(const k of vk){ if(typeof o[k]==='number') v=o[k]; } if(a!==null||v!==null) return {applies:a,views:v}; for(const k in o){ try{ const r=find(o[k],d+1); if(r.applies!==null||r.views!==null) return r; }catch(e){} } return {applies:null,views:null}; };
          if (!window.__liInterceptPatched) {
            window.__liInterceptPatched = true;
            ilog('Patching fetch & XHR');
            const ofetch = window.fetch; window.fetch = function(...args){ const u=args[0]; const isTarget = typeof u==='string' && u.includes('/voyager/api/jobs/jobPostings'); if (isTarget) ilog('fetch target hit', u);
              return ofetch.apply(this,args).then(r=>{ if(isTarget){ try{ r.clone().text().then(t=>{ const j=safeParse(t); if(!j){ ilog('fetch parsed null'); return; } const id=idFrom(u); const {applies,views}=find(j); ilog('fetch parsed', {id, applies, views}); if(id&&(applies!==null||views!==null)) send({ jobId:id, applies, views, source:'page-intercept' }); }).catch((e)=>ilog('fetch clone error', e)); }catch(e){ ilog('fetch then error', e); } } return r; }); };
            const oopen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function(m,u,...rest){ this.__li_u=u; return oopen.call(this,m,u,...rest); };
            const osend = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function(...a){ this.addEventListener('load', function(){ try{ if(this.__li_u && this.__li_u.includes('/voyager/api/jobs/jobPostings')){ ilog('xhr target hit', this.__li_u); const id=idFrom(this.__li_u);
                  const handleText = (txt) => { const j=safeParse(txt); if(!j){ ilog('xhr parsed null'); return; } const {applies,views}=find(j); ilog('xhr parsed', {id, applies, views}); if(id&&(applies!==null||views!==null)) send({ jobId:id, applies, views, source:'page-intercept' }); };
                  if (this.responseType === '' || this.responseType === 'text') {
                    handleText(this.responseText);
                  } else if (this.responseType === 'blob' && this.response && typeof this.response.text === 'function') {
                    this.response.text().then(handleText).catch((e)=>ilog('xhr blob.text error', e));
                  } else if (this.responseType === 'arraybuffer' && this.response) {
                    try { const txt = new TextDecoder('utf-8').decode(this.response); handleText(txt); } catch(e){ ilog('xhr arraybuffer decode error', e); }
                  } else {
                    ilog('xhr unsupported responseType', this.responseType);
                  }
                } }catch(e){ ilog('xhr handler error', e); } }); return osend.apply(this,a); };
          }
        } catch (e) {}
      }
  }).then(() => { log('Injection success'); sendResponse({ ok:true }); }).catch((e)=>{ console.error('Injection failed', e); sendResponse({ ok:false, error:String(e) }); });
    return true;
  }
});