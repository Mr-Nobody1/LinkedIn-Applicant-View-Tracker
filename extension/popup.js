// Popup logic with auto-refresh, export/import, and dark mode
(function(){
  'use strict';
  const log = (...a)=>console.log('[LI-JI][popup]', ...a);

  const $ = (id)=>document.getElementById(id);
  const fmt = (n)=> (n===null||n===undefined) ? 'N/A' : Number(n).toLocaleString();
  const jobIdFromUrl = (url)=>{ const ps=[/jobs\/view\/(\d+)/,/jobPostings\/(\d+)/,/currentJobId=(\d+)/,/jobId[=:](\d+)/]; for(const r of ps){const m=(url||'').match(r); if(m) return m[1];} return null; };

  let pollInterval = null;
  let currentJobId = null;

  function showToast(message, isError = false) {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

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

  async function getHistory() {
    return new Promise((res) => {
      chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (reply) => {
        log('GET_HISTORY reply:', reply);
        res(reply?.ok ? reply.history : []);
      });
    });
  }

  async function exportData() {
    return new Promise((res) => {
      chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, (reply) => {
        log('EXPORT_DATA reply:', reply);
        res(reply?.ok ? reply.data : null);
      });
    });
  }

  async function importData(data) {
    return new Promise((res) => {
      chrome.runtime.sendMessage({ type: 'IMPORT_DATA', data }, (reply) => {
        log('IMPORT_DATA reply:', reply);
        res(reply?.ok);
      });
    });
  }

  function renderHistory(history) {
    const list = $('historyList');
    $('historyCount').textContent = history.length;
    
    if (history.length === 0) {
      list.innerHTML = '<div class="history-empty">No jobs tracked yet</div>';
      return;
    }

    list.innerHTML = history.slice(0, 20).map(h => `
      <div class="history-item">
        <a href="https://www.linkedin.com/jobs/view/${h.jobId}" target="_blank" class="history-job-id">#${h.jobId}</a>
        <span class="history-stats">${fmt(h.applies)} apps / ${fmt(h.views)} views</span>
      </div>
    `).join('');
  }

  // Dark mode
  function initDarkMode() {
    const toggle = $('themeToggle');
    const savedTheme = localStorage.getItem('li-ji-theme');
    
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark');
      toggle.classList.add('active');
    }

    toggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      toggle.classList.toggle('active');
      localStorage.setItem('li-ji-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
  }

  // Start polling for updates while popup is open
  function startAutoRefresh(jobId) {
    if (pollInterval) clearInterval(pollInterval);
    currentJobId = jobId;
    
    pollInterval = setInterval(async () => {
      if (!currentJobId) return;
      const cached = await getCached(currentJobId);
      if (cached) {
        showStats(currentJobId, cached.applies, cached.views);
      }
    }, 2000);
  }

  // Stop polling
  function stopAutoRefresh() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function init(){
    log('Popup loaded');
    initDarkMode();
    
    const tab = await getActiveTab();
    if (!tab) { showEmpty('No active tab'); return; }
    log('Active tab:', { id: tab.id, url: tab.url });
    
    const jobId = jobIdFromUrl(tab.url||'');
    $('jobId').textContent = jobId || '-';

    // Try to read cache immediately
    if (jobId){
      const cached = await getCached(jobId);
      if (cached){ 
        showStats(jobId, cached.applies, cached.views); 
      } else { 
        showEmpty('Stats loading... Please wait.'); 
      }
      // Start auto-refresh
      startAutoRefresh(jobId);
    } else {
      showEmpty('Open a LinkedIn job posting to see insights.');
    }

    // Load history
    const history = await getHistory();
    renderHistory(history);

    // Wire refresh button
    $('refresh').addEventListener('click', async () => {
      try {
        $('refresh').disabled = true; $('refresh').textContent = 'Reloading…';

        // If data sneaked in while popup is open, show it first
        if (jobId){
          const cachedNow = await getCached(jobId);
          if (cachedNow){ 
            showStats(jobId, cachedNow.applies, cachedNow.views); 
            $('refresh').disabled=false; 
            $('refresh').textContent='Refresh stats'; 
            return; 
          }
        }

        // Ensure interceptor is injected, then force a reload to trigger LinkedIn API calls
        if (tab?.id){ 
          await inject(tab.id); 
          log('Triggering tab reload'); 
          await chrome.tabs.reload(tab.id, { bypassCache:true }); 
        }

        // Popup will close on reload; leave a trace
        log('Tab reload requested — reopen the popup after the page finishes loading.');
        window.close();
      } catch (e){
        log('Refresh error:', e);
        $('refresh').disabled = false; $('refresh').textContent = 'Refresh stats';
        showToast('Error refreshing stats', true);
      }
    });

    // Export functionality
    $('exportBtn').addEventListener('click', async () => {
      try {
        const data = await exportData();
        if (!data) {
          showToast('No data to export', true);
          return;
        }
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linkedin-job-insights-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Data exported successfully!');
      } catch (e) {
        log('Export error:', e);
        showToast('Export failed', true);
      }
    });

    // Import functionality
    $('importBtn').addEventListener('click', () => {
      $('importInput').click();
    });

    $('importInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        await importData(data);
        showToast('Data imported successfully!');
        
        // Refresh history
        const history = await getHistory();
        renderHistory(history);
        
        // Clear file input
        e.target.value = '';
      } catch (err) {
        log('Import error:', err);
        showToast('Invalid file format', true);
      }
    });
  }

  // Cleanup on popup close
  window.addEventListener('unload', stopAutoRefresh);

  document.addEventListener('DOMContentLoaded', init);
})();