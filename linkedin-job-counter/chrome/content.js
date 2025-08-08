// Content Script for LinkedIn Job Insights Extension (Chrome)
// Fast, reliable: Intercepts fetch/XHR in page context, extracts applicant count, and shows notification

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.linkedInJobInsightsInjected) return;
  window.linkedInJobInsightsInjected = true;

  // Inject a script into the page to intercept fetch/XHR
  function injectVoyagerInterceptor() {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        function sendData(jobId, data) {
          window.postMessage({ type: 'LINKEDIN_JOB_INSIGHTS_DATA', jobId, data }, '*');
        }

        function extractJobId(url) {
          const m = url.match(/jobPostings\\/(\\d+)/);
          return m ? m[1] : null;
        }

        function findApplies(obj, depth = 0) {
          if (!obj || typeof obj !== 'object' || depth > 10) return null;
          const keys = ['applies', 'applicationCount', 'numApplicants', 'applicantCount', 'totalApplications'];
          for (const k of keys) if (typeof obj[k] === 'number') return obj[k];
          for (const k in obj) {
            if (obj.hasOwnProperty(k)) {
              const v = findApplies(obj[k], depth + 1);
              if (v !== null) return v;
            }
          }
          return null;
        }

        // Patch fetch
        const origFetch = window.fetch;
        window.fetch = function(...args) {
          const url = args[0];
          if (typeof url === 'string' && url.includes('/voyager/api/jobs/jobPostings')) {
            return origFetch.apply(this, args).then(resp => {
              try {
                const clone = resp.clone();
                clone.json().then(data => {
                  const jobId = extractJobId(url);
                  const applies = findApplies(data);
                  if (jobId && applies !== null) sendData(jobId, { applies });
                }).catch(()=>{});
              } catch(e){}
              return resp;
            });
          }
          return origFetch.apply(this, args);
        };

        // Patch XHR
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this._li_url = url;
          return origOpen.call(this, method, url, ...rest);
        };
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(...args) {
          this.addEventListener('load', function() {
            try {
              if (this._li_url && this._li_url.includes('/voyager/api/jobs/jobPostings')) {
                const jobId = extractJobId(this._li_url);
                const data = JSON.parse(this.responseText);
                const applies = findApplies(data);
                if (jobId && applies !== null) sendData(jobId, { applies });
              }
            } catch(e){}
          });
          return origSend.apply(this, args);
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  // Listen for data from the injected script
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'LINKEDIN_JOB_INSIGHTS_DATA') {
      const { jobId, data } = event.data;
      showDataNotification({ jobId, applies: data.applies, extractedFrom: 'page-intercept' });
    }
  });

  function showDataNotification(jobData) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0073b1;
      color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 300px;
    `;
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">LinkedIn Job Insights</div>
      <div>Job ID: ${jobData.jobId}</div>
      <div>📊 Applicants: ${jobData.applies ?? 'N/A'}</div>
      <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">Source: ${jobData.extractedFrom}</div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 5000);
  }

  // Inject the interceptor as soon as possible
  injectVoyagerInterceptor();

})();
