/**
 * Background Script for LinkedIn Job Insights Extension (Chrome)
 * Service Worker implementation for Manifest V3
 * Recursively searches all properties for applies/views/applicant counts
 */

console.log('[LinkedIn Job Insights] Background script starting...');

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
