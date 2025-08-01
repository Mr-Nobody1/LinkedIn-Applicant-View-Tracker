/**
 * Background Script for LinkedIn Job Insights Extension (Chrome)
 * Intercepts network requests and extracts job data
 */

// Import shared utilities (for service worker environment)
importScripts('../shared/utils.js');

class LinkedInAPIInterceptor {
  constructor() {
    this.jobDataStore = new JobDataStore();
    this.requestId = 0;
    this.setupRequestListener();
    this.setupAlarms();
    
    console.log('[LinkedIn Job Insights] Background script initialized');
  }

  setupRequestListener() {
    // Listen for completed web requests to LinkedIn API
    chrome.webRequest.onCompleted.addListener(
      (details) => {
        this.handleCompletedRequest(details);
      },
      {
        urls: CONFIG.LINKEDIN_API_PATTERNS
      },
      ['responseHeaders']
    );

    // Also listen for before sending to catch request patterns
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        this.handleBeforeRequest(details);
      },
      {
        urls: CONFIG.LINKEDIN_API_PATTERNS
      },
      ['requestBody']
    );
  }

  setupAlarms() {
    // Create alarm for periodic cleanup
    chrome.alarms.create('cleanup', { periodInMinutes: 60 });
    
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'cleanup') {
        this.jobDataStore.cleanup();
      }
    });
  }

  handleBeforeRequest(details) {
    if (!utils.isLinkedInJobUrl(details.url)) return;

    utils.log('Intercepted LinkedIn API request:', details.url);
    
    // Store request for later correlation with response
    const requestId = `${details.requestId}_${this.requestId++}`;
    
    // Extract job ID from URL if possible
    const jobId = utils.extractJobIdFromApiUrl(details.url);
    if (jobId) {
      utils.log('Found job ID in request URL:', jobId);
    }
  }

  async handleCompletedRequest(details) {
    if (!utils.isLinkedInJobUrl(details.url)) return;
    if (details.statusCode !== 200) return;

    try {
      // Fetch the response body
      const response = await this.fetchResponseBody(details);
      if (!response) return;

      // Parse job data from response
      const jobDataArray = utils.parseJobData(response, details.url);
      
      if (jobDataArray.length > 0) {
        utils.log('Extracted job data:', jobDataArray);
        
        // Store and broadcast data
        jobDataArray.forEach(jobData => {
          this.jobDataStore.set(jobData.jobId, jobData);
          this.sendJobDataToContentScript(jobData.jobId, jobData);
        });
      }

    } catch (error) {
      utils.error('Error handling completed request:', error);
    }
  }

  async fetchResponseBody(details) {
    try {
      // Note: In Manifest V3, we can't directly access response bodies
      // We need to make a separate fetch request
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
      utils.error('Error fetching response body:', error);
      return null;
    }
  }

  buildHeaders(details) {
    const headers = {};
    
    // Add common LinkedIn headers
    headers['Accept'] = 'application/vnd.linkedin.normalized+json+2.1';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    
    // Copy relevant headers from original request
    if (details.requestHeaders) {
      details.requestHeaders.forEach(header => {
        if (['authorization', 'csrf-token', 'x-li-uuid'].includes(header.name.toLowerCase())) {
          headers[header.name] = header.value;
        }
      });
    }

    return headers;
  }

  async sendJobDataToContentScript(jobId, data) {
    try {
      // Get all tabs with LinkedIn job pages
      const tabs = await chrome.tabs.query({
        url: ['*://*.linkedin.com/jobs/*']
      });

      // Send data to each relevant tab
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'JOB_DATA_UPDATE',
              jobId: jobId,
              data: data
            });
          } catch (error) {
            // Tab might not have content script loaded yet, ignore
            utils.log('Could not send message to tab:', tab.id, error.message);
          }
        }
      }

      // Also store in chrome.storage for persistence
      await this.storeJobData(jobId, data);

    } catch (error) {
      utils.error('Error sending job data to content script:', error);
    }
  }

  async storeJobData(jobId, data) {
    try {
      const key = `${CONFIG.STORAGE_KEY}_${jobId}`;
      await chrome.storage.local.set({
        [key]: {
          ...data,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      utils.error('Error storing job data:', error);
    }
  }

  async getStoredJobData(jobId) {
    try {
      const key = `${CONFIG.STORAGE_KEY}_${jobId}`;
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (error) {
      utils.error('Error getting stored job data:', error);
      return null;
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

      sendResponse({ jobId, data });
    } else if (message.type === 'REFRESH_JOB_DATA') {
      // Force refresh for current page
      this.refreshJobDataForTab(sender.tab.id);
    }
  }

  async refreshJobDataForTab(tabId) {
    try {
      // Get current tab URL to extract job ID
      const tab = await chrome.tabs.get(tabId);
      const jobId = utils.extractJobId(tab.url);
      
      if (jobId) {
        const data = this.jobDataStore.get(jobId) || await this.getStoredJobData(jobId);
        if (data) {
          await chrome.tabs.sendMessage(tabId, {
            type: 'JOB_DATA_UPDATE',
            jobId: jobId,
            data: data
          });
        }
      }
    } catch (error) {
      utils.error('Error refreshing job data for tab:', error);
    }
  }
}

// Initialize the interceptor
const interceptor = new LinkedInAPIInterceptor();

// Set up message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  interceptor.handleMessage(message, sender, sendResponse);
  return true; // Keep message channel open for async response
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  utils.log('Extension startup');
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  utils.log('Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Show welcome message or setup
    utils.log('First time installation');
  }
});

// Clean up on extension suspension (for service worker)
self.addEventListener('beforeunload', () => {
  interceptor.jobDataStore.clear();
});
