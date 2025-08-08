/**
 * Content Script for LinkedIn Job Insights Extension (Chrome)
 * Simple approach: Listen for job data from background script and display it
 */

(() => {
  'use strict';

  if (window.__liJobInsightsInjected) return;
  window.__liJobInsightsInjected = true;

  const UI = {
    toast(data) {
      const el = document.createElement('div');
      el.className = 'li-ji-toast';
      el.innerHTML = `
        <div class="li-ji-toast__title">LinkedIn Job Insights</div>
        <div class="li-ji-toast__row"><span>Applicants</span><strong>${fmt(data.applies)}</strong></div>
        <div class="li-ji-toast__row"><span>Views</span><strong>${fmt(data.views)}</strong></div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 6000);
    },
    injectInline(data) {
      const targets = [
        '.jobs-unified-top-card__content--two-pane .jobs-unified-top-card__content-left',
        '.jobs-unified-top-card__content',
        '.job-card-container__metadata',
      ];
      let host = null;
      for (const sel of targets) { host = document.querySelector(sel); if (host) break; }
      if (!host) return;
      let panel = host.querySelector('.li-ji-inline');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'li-ji-inline';
        host.appendChild(panel);
      }
      panel.innerHTML = `
        <div class="li-ji-chip"><span>Applicants</span><strong>${fmt(data.applies)}</strong></div>
        <div class="li-ji-sep"></div>
        <div class="li-ji-chip"><span>Views</span><strong>${fmt(data.views)}</strong></div>
      `;
    }
  };

  const fmt = (n) => (n === null || n === undefined) ? 'N/A' : Number(n).toLocaleString();

  function jobIdFromUrl(url) {
    const patterns = [
      /jobs\/view\/(\d+)/,
      /jobPostings\/(\d+)/,
      /currentJobId=(\d+)/,
      /jobId[=:](\d+)/
    ];
    for (const re of patterns) { const m = url.match(re); if (m) return m[1]; }
    return null;
  }

  function requestCached(jobId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_JOB_DATA', jobId }, (res) => {
          resolve(res?.data || null);
        });
      } catch { resolve(null); }
    });
  }

  async function interceptNetwork() {
    try {
      await chrome.runtime.sendMessage({ type: 'INJECT_INTERCEPTOR' });
    } catch {}
  }

  function init() {
    // Listen for messages from background and page
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'JOB_DATA_FOUND') {
        const data = { applies: message.applies, views: message.views };
        UI.toast(data);
        UI.injectInline(data);
      }
    });
    window.addEventListener('message', (evt) => {
      if (evt.data?.type === 'LI_JI_DATA') {
        const { jobId, applies, views } = evt.data.payload || {};
        const currentId = jobIdFromUrl(location.href);
        if (!currentId || currentId !== jobId) return;
  try { chrome.runtime.sendMessage({ type: 'CACHE_JOB_DATA', jobId, applies, views }); } catch {}
        UI.toast({ applies, views });
        UI.injectInline({ applies, views });
      }
    });

    // On load, try cache
    const jid = jobIdFromUrl(location.href);
    if (jid) {
      requestCached(jid).then((cached) => {
        if (cached) { UI.injectInline(cached); }
      });
    }

    // Intercept in-page network
    interceptNetwork();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
