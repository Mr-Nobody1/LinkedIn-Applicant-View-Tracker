(() => {
  'use strict';
  if (window.__liJobInsightsInjected) return; window.__liJobInsightsInjected = true;

  const fmt = (n) => (n === null || n === undefined) ? 'N/A' : Number(n).toLocaleString();
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
    inline(data) {
      const targets = [
        '.jobs-unified-top-card__content--two-pane .jobs-unified-top-card__content-left',
        '.jobs-unified-top-card__content',
        '.job-card-container__metadata',
      ];
      let host = null; for (const s of targets) { const el = document.querySelector(s); if (el) { host = el; break; } }
      if (!host) return;
      let panel = host.querySelector('.li-ji-inline');
      if (!panel) { panel = document.createElement('div'); panel.className = 'li-ji-inline'; host.appendChild(panel); }
      panel.innerHTML = `
        <div class="li-ji-chip"><span>Applicants</span><strong>${fmt(data.applies)}</strong></div>
        <div class="li-ji-sep"></div>
        <div class="li-ji-chip"><span>Views</span><strong>${fmt(data.views)}</strong></div>
      `;
    }
  };

  const jobIdFromUrl = (url) => { const ps=[/jobs\/view\/(\d+)/,/jobPostings\/(\d+)/,/currentJobId=(\d+)/,/jobId[=:](\d+)/]; for(const r of ps){const m=(url||'').match(r); if(m) return m[1];} return null; };

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'LI_JI_DATA') {
      const { jobId, applies, views } = e.data.payload || {}; const current = jobIdFromUrl(location.href);
      if (!current || current !== jobId) return;
      chrome.runtime?.sendMessage?.({ type: 'CACHE_JOB_DATA', jobId, applies, views });
      UI.toast({ applies, views }); UI.inline({ applies, views });
    }
  });

  // Ask background to inject MAIN-world interceptor
  chrome.runtime?.sendMessage?.({ type: 'INJECT_INTERCEPTOR' });
})();
