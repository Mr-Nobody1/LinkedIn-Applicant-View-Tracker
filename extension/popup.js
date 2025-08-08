// Popup logic with verbose logging
(function(){
  'use strict';
  const log = (...a)=>console.log('[LI-JI][popup]', ...a);

  const $ = (id)=>document.getElementById(id);
  const fmt = (n)=> (n===null||n===undefined) ? 'N/A' : Number(n).toLocaleString();
  const jobIdFromUrl = (url)=>{ const ps=[/jobs\/view\/(\d+)/,/jobPostings\/(\d+)/,/currentJobId=(\d+)/,/jobId[=:](\d+)/]; for(const r of ps){const m=(url||'').match(r); if(m) return m[1];} return null; };

  function showStats(jobId, applies, views){
    log('Render stats', {jobId, applies, views});
    $('jobId').textContent = jobId || '-';
    $('applies').textContent = fmt(applies);
    $('views').textContent = fmt(views);
    $('stats').style.display = 'block';
    $('empty').style.display = 'none';
  }

  function showEmpty(reason){
    if (reason) log('Empty UI reason:', reason);
    $('stats').style.display = 'none';
    $('empty').style.display = 'block';
  }

  async function getActiveTab(){
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function getCached(jobId){
    return new Promise((res)=>{
      chrome.runtime.sendMessage({ type:'GET_JOB_DATA', jobId }, (reply)=>{
        log('GET_JOB_DATA reply:', reply);
        res(reply && reply.ok ? (reply.data||null) : null);
      });
    });
  }

  async function inject(tabId){
    return new Promise((res)=>{
      chrome.runtime.sendMessage({ type:'INJECT_INTERCEPTOR', tabId }, (reply)=>{
        log('INJECT_INTERCEPTOR reply:', reply);
        res(reply && reply.ok);
      });
    });
  }

  async function init(){
    log('Popup loaded');
    const tab = await getActiveTab();
    if (!tab) { showEmpty('No active tab'); return; }
    log('Active tab:', { id: tab.id, url: tab.url });
    const jobId = jobIdFromUrl(tab.url||'');
    $('jobId').textContent = jobId || '-';

    // Try to read cache immediately
    if (jobId){
      const cached = await getCached(jobId);
      if (cached){ showStats(jobId, cached.applies, cached.views); }
      else { showEmpty('No cached data yet'); }
    } else {
      showEmpty('Could not detect jobId in URL');
    }

    // Wire refresh
    $('refresh').addEventListener('click', async () => {
      try {
        $('refresh').disabled = true; $('refresh').textContent = 'Reloading…';

        // If data sneaked in while popup is open, show it first
        if (jobId){
          const cachedNow = await getCached(jobId);
          if (cachedNow){ showStats(jobId, cachedNow.applies, cachedNow.views); $('refresh').disabled=false; $('refresh').textContent='Refresh stats'; return; }
        }

        // Ensure interceptor is injected, then force a reload to trigger LinkedIn API calls
        if (tab?.id){ await inject(tab.id); log('Triggering tab reload'); await chrome.tabs.reload(tab.id, { bypassCache:true }); }

        // Popup will close on reload; leave a trace
        log('Tab reload requested — reopen the popup after the page finishes loading.');
        window.close();
      } catch (e){
        log('Refresh error:', e);
        $('refresh').disabled = false; $('refresh').textContent = 'Refresh stats';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();