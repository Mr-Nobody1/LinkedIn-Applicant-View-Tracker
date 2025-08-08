/**
 * Background Script for LinkedIn Job Insights Extension (Chrome)
 * Service Worker implementation for Manifest V3
 * Recursively searches all properties for applies/views/applicant counts
 */

console.log('[LinkedIn Job Insights] Background script starting...');

// In-memory cache of job stats { [jobId]: { applies, views, timestamp } }
const jobCache = new Map();

// TTL for cached entries (30 minutes)
const CACHE_TTL_MS = 30 * 60 * 1000;

function setCache(jobId, data) {
  jobCache.set(jobId, { ...data, timestamp: Date.now() });
}

function getCache(jobId) {
  const entry = jobCache.get(jobId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    jobCache.delete(jobId);
    return null;
  }
  return entry;
}

function extractJobIdFromUrl(url) {
  const match = url.match(/jobPostings\/([^?&/]+)/);
  return match ? match[1] : null;
}

function findAppliesAndViews(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return null;

  // Check for all possible applicant/view fields
  const appliesKeys = ['applies', 'applicationCount', 'numApplicants', 'applicantCount', 'totalApplications'];
  const viewsKeys = ['views', 'viewCount', 'numViews', 'totalViews', 'viewStats'];

  let applies = null, views = null;
  for (const key of appliesKeys) {
    if (obj[key] !== undefined && typeof obj[key] === 'number') applies = obj[key];
  }
  for (const key of viewsKeys) {
    if (obj[key] !== undefined && typeof obj[key] === 'number') views = obj[key];
  }
  if (applies !== null || views !== null) {
    return { applies, views };
  }

  // Recursively search all properties
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const result = findAppliesAndViews(obj[key], depth + 1);
      if (result) return result;
    }
  }
  return null;
}

// Respond to popup/content requests for job data
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_JOB_DATA' && message.jobId) {
    const cached = getCache(message.jobId);
    sendResponse({ ok: true, data: cached ? { applies: cached.applies, views: cached.views } : null });
    return true; // async-safe
  }
  if (message?.type === 'CACHE_JOB_DATA' && message.jobId) {
    const { applies = null, views = null } = message;
    setCache(message.jobId, { applies, views });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'INJECT_INTERCEPTOR') {
    // Inject a MAIN world script to intercept fetch/XHR without CSP inline issues
    const tabId = message.tabId || sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: 'No tabId' }); return true; }
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
    }).then(() => sendResponse({ ok: true })).catch((e) => {
      console.error('[LinkedIn Job Insights] Injection failed:', e);
      sendResponse({ ok: false, error: String(e) });
    });
    return true;
  }
});

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    console.log('[LinkedIn Job Insights] Detected LinkedIn API call:', details.url);
    const jobId = extractJobIdFromUrl(details.url);
    if (!jobId) return;
    try {
      const response = await fetch(details.url, {
        credentials: 'include',
        headers: {
          'Accept': 'application/vnd.linkedin.normalized+json+2.1',
          'x-restli-protocol-version': '2.0.0'
        }
      });
      if (response.ok) {
        const data = await response.json();
        const jobStats = findAppliesAndViews(data);
        if (jobStats && (jobStats.applies !== null || jobStats.views !== null)) {
          setCache(jobId, { applies: jobStats.applies ?? null, views: jobStats.views ?? null });
          const tabs = await chrome.tabs.query({ url: '*://www.linkedin.com/jobs/*' });
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'JOB_DATA_FOUND',
              jobId: jobId,
              applies: jobStats.applies !== null ? jobStats.applies : 'N/A',
              views: jobStats.views !== null ? jobStats.views : 'N/A',
              extractedFrom: 'background-api'
            });
          }
        } else {
          console.log('[LinkedIn Job Insights] No applies/views data found in response');
        }
      }
    } catch (error) {
      console.error('[LinkedIn Job Insights] Error fetching API data:', error);
    }
  },
  {
    urls: [
      '*://www.linkedin.com/voyager/api/jobs/jobPostings*'
    ]
  }
);

console.log('[LinkedIn Job Insights] Background script initialized');
