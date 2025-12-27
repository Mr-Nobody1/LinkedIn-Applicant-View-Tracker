(() => {
  'use strict';
  if (window.__liJobInsightsInjected) return; window.__liJobInsightsInjected = true;
  const log = (...a)=>console.log('[LI-JI][content]', ...a);

  const fmt = (n) => (n === null || n === undefined) ? 'N/A' : Number(n).toLocaleString();
  
  // Track current job to detect navigation
  let lastJobId = null;
  let pollInterval = null;

  const UI = {
    toast(data) {
      const el = document.createElement('div');
      el.className = 'li-ji-toast';
      el.innerHTML = `
        <div class="li-ji-toast__title">LinkedIn Job Insights</div>
        <div class="li-ji-toast__row"><span>Applicants</span><strong>${fmt(data.applies)}</strong></div>
        <div class="li-ji-toast__row"><span>Views</span><strong>${fmt(data.views)}</strong></div>
      `;
      document.body.appendChild(el); requestAnimationFrame(()=>el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, 6000);
    },
    inline(data, loading = false) {
      const targets = [
        '.jobs-unified-top-card__content--two-pane .jobs-unified-top-card__content-left',
        '.jobs-unified-top-card__content',
        '.job-card-container__metadata',
      ];
      let host = null; for (const s of targets) { const el = document.querySelector(s); if (el) { host = el; break; } }
      if (!host) return;
      let panel = host.querySelector('.li-ji-inline');
      if (!panel) { panel = document.createElement('div'); panel.className = 'li-ji-inline'; host.appendChild(panel); }
      
      if (loading) {
        panel.innerHTML = `
          <div class="li-ji-chip"><span>Loading stats...</span><div class="li-ji-spinner"></div></div>
        `;
      } else {
        panel.innerHTML = `
          <div class="li-ji-chip"><span>Applicants</span><strong>${fmt(data.applies)}</strong></div>
          <div class="li-ji-sep"></div>
          <div class="li-ji-chip"><span>Views</span><strong>${fmt(data.views)}</strong></div>
        `;
      }
    },
    removeInline() {
      document.querySelectorAll('.li-ji-inline').forEach(el => el.remove());
    }
  };

  const jobIdFromUrl = (url) => { const ps=[/jobs\/view\/(\d+)/,/jobPostings\/(\d+)/,/currentJobId=(\d+)/,/jobId[=:](\d+)/]; for(const r of ps){const m=(url||'').match(r); if(m) return m[1];} return null; };

  // Get cached data from service worker
  const getCachedData = (jobId) => {
    return new Promise((resolve) => {
      chrome.runtime?.sendMessage?.({ type: 'GET_JOB_DATA', jobId }, (reply) => {
        log('GET_JOB_DATA reply:', reply);
        resolve(reply?.ok && reply.data ? reply.data : null);
      });
    });
  };

  // Request interceptor injection
  const requestInterceptor = () => {
    log('Requesting interceptor injection');
    chrome.runtime?.sendMessage?.({ type: 'INJECT_INTERCEPTOR' }, (r) => {
      log('INJECT_INTERCEPTOR ack', r);
    });
  };

  // Handle job change (SPA navigation)
  const handleJobChange = async (jobId) => {
    log('Job changed to:', jobId);
    lastJobId = jobId;
    
    // Show loading state
    UI.removeInline();
    setTimeout(() => UI.inline({}, true), 100);
    
    // Request fresh interceptor injection
    requestInterceptor();
    
    // Check cache immediately
    const cached = await getCachedData(jobId);
    if (cached) {
      log('Found cached data:', cached);
      UI.inline({ applies: cached.applies, views: cached.views });
      UI.toast({ applies: cached.applies, views: cached.views });
      return;
    }
    
    // Start polling for data if not found
    startPolling(jobId);
  };

  // Poll for data until we get it
  const startPolling = (jobId) => {
    if (pollInterval) clearInterval(pollInterval);
    
    let attempts = 0;
    const maxAttempts = 10; // 10 seconds max
    
    pollInterval = setInterval(async () => {
      attempts++;
      const currentJobId = jobIdFromUrl(location.href);
      
      // Stop if job changed or max attempts reached
      if (currentJobId !== jobId || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        pollInterval = null;
        if (attempts >= maxAttempts) {
          log('Polling timeout, no data received');
          UI.inline({ applies: null, views: null });
        }
        return;
      }
      
      const cached = await getCachedData(jobId);
      if (cached) {
        log('Polling found data:', cached);
        clearInterval(pollInterval);
        pollInterval = null;
        UI.inline({ applies: cached.applies, views: cached.views });
        UI.toast({ applies: cached.applies, views: cached.views });
      }
    }, 1000);
  };

  // Check for URL changes (SPA navigation detection)
  const checkUrlChange = () => {
    const currentJobId = jobIdFromUrl(location.href);
    if (currentJobId && currentJobId !== lastJobId) {
      handleJobChange(currentJobId);
    } else if (!currentJobId && lastJobId) {
      // User navigated away from job page
      lastJobId = null;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
  };

  // Intercept history changes for SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(checkUrlChange, 100);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(checkUrlChange, 100);
  };
  
  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    setTimeout(checkUrlChange, 100);
  });

  // Also poll periodically as fallback (LinkedIn sometimes doesn't trigger history events)
  setInterval(checkUrlChange, 1500);

  // Handle data from interceptor
  window.addEventListener('message', (e) => {
    log('window message', e?.data?.type, e?.data?.payload?.jobId);
    if (e.data?.type === 'LI_JI_DATA') {
      const { jobId, applies, views } = e.data.payload || {}; const current = jobIdFromUrl(location.href);
      if (!current || current !== jobId) return;
      log('Forwarding to SW CACHE_JOB_DATA', { jobId, applies, views });
      chrome.runtime?.sendMessage?.({ type: 'CACHE_JOB_DATA', jobId, applies, views });
      
      // Stop polling if active
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      
      UI.toast({ applies, views }); UI.inline({ applies, views });
    }
  });

  // Initial setup
  requestInterceptor();
  
  // Check initial URL after a short delay (page might still be loading)
  setTimeout(() => {
    const jobId = jobIdFromUrl(location.href);
    if (jobId) {
      handleJobChange(jobId);
    }
  }, 500);
})();