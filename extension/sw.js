// Service worker (background) with persistent storage
const log = (...a)=>console.log('[LI-JI][sw]', ...a);
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY_PREFIX = 'job_';
const HISTORY_KEY = 'job_history';

// Persistent cache using chrome.storage.local
async function setCache(jobId, data) {
  const key = STORAGE_KEY_PREFIX + jobId;
  const entry = { ...data, ts: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
  
  // Also add to history
  await addToHistory(jobId, data);
  log('Cached data for job', jobId, entry);
}

async function getCache(jobId) {
  const key = STORAGE_KEY_PREFIX + jobId;
  const result = await chrome.storage.local.get(key);
  const v = result[key];
  if (!v) return null;
  if (Date.now() - v.ts > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return v;
}

// Job history for export/import
async function addToHistory(jobId, data) {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const history = result[HISTORY_KEY] || [];
  
  // Update or add entry
  const existingIndex = history.findIndex(h => h.jobId === jobId);
  const entry = {
    jobId,
    applies: data.applies,
    views: data.views,
    lastSeen: Date.now()
  };
  
  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.unshift(entry); // Add to beginning
  }
  
  // Keep only last 100 entries
  const trimmed = history.slice(0, 100);
  await chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
}

async function getHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return result[HISTORY_KEY] || [];
}

async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}

async function exportData() {
  const result = await chrome.storage.local.get(null);
  return result;
}

async function importData(data) {
  await chrome.storage.local.clear();
  await chrome.storage.local.set(data);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log('onMessage', msg?.type, { fromTab: sender?.tab?.id });
  
  if (msg?.type === 'GET_JOB_DATA' && msg.jobId) {
    getCache(msg.jobId).then(cached => {
      sendResponse({ 
        ok: true, 
        data: cached ? { applies: cached.applies, views: cached.views } : null 
      });
    });
    return true;
  }
  
  if (msg?.type === 'CACHE_JOB_DATA' && msg.jobId) {
    setCache(msg.jobId, { applies: msg.applies ?? null, views: msg.views ?? null })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  
  if (msg?.type === 'GET_HISTORY') {
    getHistory().then(history => sendResponse({ ok: true, history }));
    return true;
  }
  
  if (msg?.type === 'CLEAR_HISTORY') {
    clearHistory().then(() => sendResponse({ ok: true }));
    return true;
  }
  
  if (msg?.type === 'EXPORT_DATA') {
    exportData().then(data => sendResponse({ ok: true, data }));
    return true;
  }
  
  if (msg?.type === 'IMPORT_DATA' && msg.data) {
    importData(msg.data).then(() => sendResponse({ ok: true }));
    return true;
  }
  
  if (msg?.type === 'INJECT_INTERCEPTOR') {
    const tabId = msg.tabId || sender?.tab?.id; 
    if (!tabId) { 
      sendResponse({ ok: false, error: 'No tabId' }); 
      return true; 
    }
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
          const find = (o,d=0) => { 
            if(!o||typeof o!=='object'||d>10) return {applies:null,views:null}; 
            let a=null,v=null; 
            const ak=['applies','applicationCount','numApplicants','applicantCount','totalApplications','totalApplicantCount']; 
            const vk=['views','viewCount','numViews','totalViews','viewers','jobViewCount','jobViewersCount']; 
            for(const k of ak){ if(typeof o[k]==='number') a=o[k]; } 
            for(const k of vk){ if(typeof o[k]==='number') v=o[k]; } 
            if(a!==null||v!==null) return {applies:a,views:v}; 
            for(const k in o){ 
              try{ const r=find(o[k],d+1); if(r.applies!==null||r.views!==null) return r; }catch(e){} 
            } 
            return {applies:null,views:null}; 
          };
          if (!window.__liInterceptPatched) {
            window.__liInterceptPatched = true;
            ilog('Patching fetch & XHR');
            const ofetch = window.fetch; 
            window.fetch = function(...args){ 
              const u=args[0]; 
              const isTarget = typeof u==='string' && u.includes('/voyager/api/jobs/jobPostings'); 
              if (isTarget) ilog('fetch target hit', u);
              return ofetch.apply(this,args).then(r=>{ 
                if(isTarget){ 
                  try{ 
                    r.clone().text().then(t=>{ 
                      const j=safeParse(t); 
                      if(!j){ ilog('fetch parsed null'); return; } 
                      const id=idFrom(u); 
                      const {applies,views}=find(j); 
                      ilog('fetch parsed', {id, applies, views}); 
                      if(id&&(applies!==null||views!==null)) send({ jobId:id, applies, views, source:'page-intercept' }); 
                    }).catch((e)=>ilog('fetch clone error', e)); 
                  }catch(e){ ilog('fetch then error', e); } 
                } 
                return r; 
              }); 
            };
            const oopen = XMLHttpRequest.prototype.open; 
            XMLHttpRequest.prototype.open = function(m,u,...rest){ 
              this.__li_u=u; 
              return oopen.call(this,m,u,...rest); 
            };
            const osend = XMLHttpRequest.prototype.send; 
            XMLHttpRequest.prototype.send = function(...a){ 
              this.addEventListener('load', function(){ 
                try{ 
                  if(this.__li_u && this.__li_u.includes('/voyager/api/jobs/jobPostings')){ 
                    ilog('xhr target hit', this.__li_u); 
                    const id=idFrom(this.__li_u);
                    const handleText = (txt) => { 
                      const j=safeParse(txt); 
                      if(!j){ ilog('xhr parsed null'); return; } 
                      const {applies,views}=find(j); 
                      ilog('xhr parsed', {id, applies, views}); 
                      if(id&&(applies!==null||views!==null)) send({ jobId:id, applies, views, source:'page-intercept' }); 
                    };
                    if (this.responseType === '' || this.responseType === 'text') {
                      handleText(this.responseText);
                    } else if (this.responseType === 'blob' && this.response && typeof this.response.text === 'function') {
                      this.response.text().then(handleText).catch((e)=>ilog('xhr blob.text error', e));
                    } else if (this.responseType === 'arraybuffer' && this.response) {
                      try { const txt = new TextDecoder('utf-8').decode(this.response); handleText(txt); } catch(e){ ilog('xhr arraybuffer decode error', e); }
                    } else {
                      ilog('xhr unsupported responseType', this.responseType);
                    }
                  } 
                }catch(e){ ilog('xhr handler error', e); } 
              }); 
              return osend.apply(this,a); 
            };
          }
        } catch (e) {}
      }
    }).then(() => { 
      log('Injection success'); 
      sendResponse({ ok: true }); 
    }).catch((e)=>{ 
      console.error('Injection failed', e); 
      sendResponse({ ok: false, error: String(e) }); 
    });
    return true;
  }
});