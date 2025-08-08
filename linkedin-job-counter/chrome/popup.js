// popup.js - Show applicant/view numbers for current job

function showError(msg) {
  document.getElementById('error').textContent = msg;
  document.getElementById('error').style.display = 'block';
}

function setStats({ applies, views, jobId }) {
  document.getElementById('applies').textContent = applies !== undefined ? applies : 'N/A';
  document.getElementById('views').textContent = views !== undefined ? views : 'N/A';
  document.getElementById('jobId').textContent = jobId || 'N/A';
}


// Extract job ID from any LinkedIn job URL format
function extractJobIdFromUrl(url) {
  // Try /jobs/view/12345 or /jobs/view/12345/
  let match = url.match(/jobs\/view\/(\d+)/);
  if (match) return match[1];
  // Try /jobPostings/12345
  match = url.match(/jobPostings\/(\d+)/);
  if (match) return match[1];
  // Try currentJobId=12345
  match = url.match(/currentJobId=(\d+)/);
  if (match) return match[1];
  // Try jobId=12345
  match = url.match(/jobId[=:](\d+)/);
  if (match) return match[1];
  return null;
}

chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  const tab = tabs[0];
  if (!tab || !tab.url) {
    showError('No active LinkedIn job tab found.');
    return;
  }
  const jobId = extractJobIdFromUrl(tab.url);
  if (!jobId) {
    showError('Not a LinkedIn job page.');
    return;
  }
  chrome.runtime.sendMessage({ type: 'GET_JOB_DATA', jobId }, function(response) {
    if (response && response.data) {
      setStats({ ...response.data, jobId });
    } else {
      showError('No applicant/view data found for this job. Try refreshing the job page.');
    }
  });
});
