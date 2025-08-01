/**
 * Background Script for LinkedIn Job Insights Extension (Firefox)
 * Intercepts network requests and extracts job data
 */

// Firefox uses a different approach for importing scripts
// We'll include the utilities inline or load them differently

class LinkedInAPIInterceptor {
  constructor() {
    this.jobDataStore = new Map();
    this.requestId = 0;
    this.setupRequestListener();
    this.setupPeriodicCleanup();
    
    console.log('[LinkedIn Job Insights] Firefox Background script initialized');
  }

  setupRequestListener() {
    // Listen for completed web requests to LinkedIn API
    browser.webRequest.onCompleted.addListener(
      (details) => {
        this.handleCompletedRequest(details);
      },
      {
        urls: [
          '*://www.linkedin.com/voyager/api/jobs/jobPostings*',
          '*://www.linkedin.com/voyager/api/jobs/search*'
        ]
      },
      ['responseHeaders']
    );

    // Listen for before sending to catch request patterns
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        this.handleBeforeRequest(details);
      },
      {
        urls: [
          '*://www.linkedin.com/voyager/api/jobs/jobPostings*',
          '*://www.linkedin.com/voyager/api/jobs/search*'
        ]
      },
      ['requestBody']
    );
  }

  setupPeriodicCleanup() {
    // Clean up old data every hour
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  cleanup() {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    
    for (const [jobId, data] of this.jobDataStore.entries()) {
      if (now - data.timestamp > oneHour) {
        this.jobDataStore.delete(jobId);
      }
    }
  }

  handleBeforeRequest(details) {
    if (!this.isLinkedInJobUrl(details.url)) return;

    console.log('[LinkedIn Job Insights] Intercepted LinkedIn API request:', details.url);
    
    // Extract job ID from URL if possible
    const jobId = this.extractJobIdFromApiUrl(details.url);
    if (jobId) {
      console.log('[LinkedIn Job Insights] Found job ID in request URL:', jobId);
    }
  }

  async handleCompletedRequest(details) {
    if (!this.isLinkedInJobUrl(details.url)) return;
    if (details.statusCode !== 200) return;

    try {
      // Fetch the response body
      const response = await this.fetchResponseBody(details);
      if (!response) return;

      // Parse job data from response
      const jobDataArray = this.parseJobData(response, details.url);
      
      if (jobDataArray.length > 0) {
        console.log('[LinkedIn Job Insights] Extracted job data:', jobDataArray);
        
        // Store and broadcast data
        jobDataArray.forEach(jobData => {
          this.storeJobData(jobData.jobId, jobData);
          this.sendJobDataToContentScript(jobData.jobId, jobData);
        });
      }

    } catch (error) {
      console.error('[LinkedIn Job Insights] Error handling completed request:', error);
    }
  }

  async fetchResponseBody(details) {
    try {
      const response = await fetch(details.url, {
        method: details.method || 'GET',
        headers: this.buildHeaders(details),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error('[LinkedIn Job Insights] Error fetching response body:', error);
      return null;
    }
  }

  buildHeaders(details) {
    const headers = {};
    
    // Add common LinkedIn headers
    headers['Accept'] = 'application/vnd.linkedin.normalized+json+2.1';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    
    return headers;
  }

  storeJobData(jobId, data) {
    this.jobDataStore.set(jobId, {
      ...data,
      timestamp: Date.now()
    });
  }

  async sendJobDataToContentScript(jobId, data) {
    try {
      // Get all tabs with LinkedIn job pages
      const tabs = await browser.tabs.query({
        url: ['*://*.linkedin.com/jobs/*']
      });

      // Send data to each relevant tab
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await browser.tabs.sendMessage(tab.id, {
              type: 'JOB_DATA_UPDATE',
              jobId: jobId,
              data: data
            });
          } catch (error) {
            // Tab might not have content script loaded yet, ignore
            console.log('[LinkedIn Job Insights] Could not send message to tab:', tab.id, error.message);
          }
        }
      }

      // Also store in browser.storage for persistence
      await this.persistJobData(jobId, data);

    } catch (error) {
      console.error('[LinkedIn Job Insights] Error sending job data to content script:', error);
    }
  }

  async persistJobData(jobId, data) {
    try {
      const key = `linkedin_job_data_${jobId}`;
      await browser.storage.local.set({
        [key]: {
          ...data,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error('[LinkedIn Job Insights] Error storing job data:', error);
    }
  }

  async getStoredJobData(jobId) {
    try {
      const key = `linkedin_job_data_${jobId}`;
      const result = await browser.storage.local.get(key);
      return result[key];
    } catch (error) {
      console.error('[LinkedIn Job Insights] Error getting stored job data:', error);
      return null;
    }
  }

  // Utility methods
  isLinkedInJobUrl(url) {
    return url && (
      url.includes('linkedin.com/jobs') ||
      url.includes('linkedin.com/voyager/api/jobs')
    );
  }

  extractJobIdFromApiUrl(url) {
    if (!url) return null;
    
    const patterns = [
      /jobPostings\/(\d+)/,
      /jobs\/(\d+)/,
      /jobId[=:](\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  extractJobIdFromEntityUrn(entityUrn) {
    if (!entityUrn) return null;
    
    const match = entityUrn.match(/jobPosting[:\-](\d+)/);
    return match ? match[1] : null;
  }

  parseJobData(responseText, url) {
    try {
      const data = JSON.parse(responseText);
      const jobData = [];
      
      // Handle different API response structures
      if (data.included) {
        // Standard voyager API response
        data.included.forEach(item => {
          if (item.entityUrn && item.entityUrn.includes('jobPosting')) {
            const jobId = this.extractJobIdFromEntityUrn(item.entityUrn);
            if (jobId) {
              jobData.push({
                jobId,
                applies: item.applies || item.applicationCount || 0,
                views: item.views || item.viewCount || 0,
                title: item.title || 'Unknown',
                company: item.companyDetails?.companyName || item.company || 'Unknown'
              });
            }
          }
        });
      } else if (data.elements) {
        // Alternative API structure
        data.elements.forEach(element => {
          const jobId = this.extractJobIdFromApiUrl(url);
          if (jobId) {
            jobData.push({
              jobId,
              applies: element.applies || element.applicationCount || 0,
              views: element.views || element.viewCount || 0,
              title: element.title || 'Unknown',
              company: element.companyName || element.company || 'Unknown'
            });
          }
        });
      }
      
      return jobData;
    } catch (error) {
      console.error('[LinkedIn Job Insights] Error parsing job data:', error);
      return [];
    }
  }

  // Handle messages from content scripts
  async handleMessage(message, sender, sendResponse) {
    if (message.type === 'GET_JOB_DATA') {
      const jobId = message.jobId;
      
      // Try memory first
      let data = this.jobDataStore.get(jobId);
      
      // Fall back to storage
      if (!data) {
        data = await this.getStoredJobData(jobId);
      }

      return { jobId, data };
    } else if (message.type === 'REFRESH_JOB_DATA') {
      // Force refresh for current page
      this.refreshJobDataForTab(sender.tab.id);
    }
  }

  async refreshJobDataForTab(tabId) {
    try {
      // Get current tab URL to extract job ID
      const tab = await browser.tabs.get(tabId);
      const jobId = this.extractJobId(tab.url);
      
      if (jobId) {
        const data = this.jobDataStore.get(jobId) || await this.getStoredJobData(jobId);
        if (data) {
          await browser.tabs.sendMessage(tabId, {
            type: 'JOB_DATA_UPDATE',
            jobId: jobId,
            data: data
          });
        }
      }
    } catch (error) {
      console.error('[LinkedIn Job Insights] Error refreshing job data for tab:', error);
    }
  }

  extractJobId(url) {
    if (!url) return null;
    
    const patterns = [
      /\/jobs\/view\/(\d+)/,
      /currentJobId=(\d+)/,
      /jobId[=:](\d+)/,
      /jobs\/(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }
}

// Initialize the interceptor
const interceptor = new LinkedInAPIInterceptor();

// Set up message listener
browser.runtime.onMessage.addListener((message, sender) => {
  return interceptor.handleMessage(message, sender);
});

// Handle extension startup
browser.runtime.onStartup.addListener(() => {
  console.log('[LinkedIn Job Insights] Extension startup');
});

// Handle extension installation
browser.runtime.onInstalled.addListener((details) => {
  console.log('[LinkedIn Job Insights] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    console.log('[LinkedIn Job Insights] First time installation');
  }
});
