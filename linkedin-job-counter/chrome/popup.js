// popup.js - Show applicant/view numbers for current job with clean UI

const $ = (id) => document.getElementById(id);

function setStats({ applies, views, jobId }) {
  $('applies').textContent = applies ?? 'N/A';
  $('views').textContent = views ?? 'N/A';
  $('jobId').textContent = jobId || 'N/A';
  $('stats').style.display = 'block';
  $('empty').style.display = 'none';
}

function extractJobIdFromUrl(url) {
  const patterns = [
    /jobs\/view\/(\d+)/,
    /jobPostings\/(\d+)/,
    /currentJobId=(\d+)/,
    /jobId[=:](\d+)/
  ];
  for (const re of patterns) { const m = url.match(re); if (m) return m[1]; }
  return null;
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs?.[0];
  const url = tab?.url || '';
  const jobId = extractJobIdFromUrl(url);
  if (!jobId) return; // keep empty state

  chrome.runtime.sendMessage({ type: 'GET_JOB_DATA', jobId }, (response) => {
    if (response?.data) {
      setStats({ ...response.data, jobId });
    }
  });
  // Wire refresh button
  const btn = $('refresh');
  if (btn) {
    btn.onclick = () => {
      // Trigger MAIN-world injection and a gentle re-check
      chrome.runtime.sendMessage({ type: 'INJECT_INTERCEPTOR', tabId: tab?.id }, () => {
        // After a short delay, ask for data again
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'GET_JOB_DATA', jobId }, (res2) => {
            if (res2?.data) setStats({ ...res2.data, jobId });
          });
        }, 1000);
      });
    };
  }
});
