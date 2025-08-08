/**
 * Content Script for LinkedIn Job Insights Extension (Chrome)
 * Simple approach: Listen for API call completion trigger and search page data
 */

(function() {
  'use strict';

  // Debug: Log that content script is loading
  console.log('[LinkedIn Job Insights] Content script loading...');
  
  // Temporary alert to verify loading (remove after testing)
  if (window.location.href.includes('linkedin.com')) {
    console.log('[LinkedIn Job Insights] Extension loaded on LinkedIn!');
    // Show a brief notification that extension is active
    setTimeout(() => {
      console.log('[LinkedIn Job Insights] Extension is active and monitoring LinkedIn');
    }, 2000);
  }

  // Prevent multiple injections
  if (window.linkedInJobInsightsInjected) {
    console.log('[LinkedIn Job Insights] Already injected, skipping');
    return;
  }
  window.linkedInJobInsightsInjected = true;

  console.log('[LinkedIn Job Insights] Content script injected successfully');

  class LinkedInJobInsightsContent {
    constructor() {
      this.uiInjector = null;
      this.isInitialized = false;
      this.currentUrl = window.location.href;
      this.urlCheckInterval = null;
      
      this.init();
    }

    async init() {
      try {
        // Wait for page to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => this.initializeExtension());
        } else {
          this.initializeExtension();
        }

        // Monitor URL changes for SPA navigation
        this.setupUrlMonitoring();

        // Set up message listener for background script communications
        this.setupMessageListener();

        console.log('[LinkedIn Job Insights] Content script initialized');
      } catch (error) {
        console.error('[LinkedIn Job Insights] Error initializing content script:', error);
      }
    }

    setupMessageListener() {
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'JOB_DATA_UPDATE') {
          console.log('[LinkedIn Job Insights] Received job data update:', message.jobId, message.data);
          this.handleJobDataUpdate(message.jobId, message.data);
          sendResponse({ success: true });
        } else if (message.type === 'API_CALL_COMPLETED') {
          console.log('[LinkedIn Job Insights] API call completed, searching for job data:', message.jobId);
          this.handleAPICallCompleted(message.url, message.jobId);
          sendResponse({ success: true });
        }
      });
    }

    handleAPICallCompleted(url, jobId) {
      console.log('[LinkedIn Job Insights] Starting data search for job:', jobId);
      
      // Schedule searches with delays to allow LinkedIn to populate the data
      setTimeout(() => this.searchForJobDataInPage(jobId), 500);
      setTimeout(() => this.searchForJobDataInPage(jobId), 1500);
      setTimeout(() => this.searchForJobDataInPage(jobId), 3000);
    }

    searchForJobDataInPage(jobId) {
      console.log('[LinkedIn Job Insights] Searching page data for job:', jobId);
      
      try {
        // Search method 1: Look in global JavaScript objects
        let foundData = this.searchInGlobalObjects(jobId);
        
        if (!foundData) {
          // Search method 2: Look in script tags containing JSON data
          foundData = this.searchInScriptTags(jobId);
        }
        
        if (!foundData) {
          // Search method 3: Look in the page's internal state/store
          foundData = this.searchInPageState(jobId);
        }
        
        if (foundData) {
          console.log('[LinkedIn Job Insights] Found job data:', foundData);
          this.showDataNotification(foundData);
        } else {
          console.log('[LinkedIn Job Insights] No job data found in page for job:', jobId);
        }
        
      } catch (error) {
        console.error('[LinkedIn Job Insights] Error searching for job data:', error);
      }
    }

    searchInGlobalObjects(jobId) {
      // Search in window objects that might contain LinkedIn data
      const globalKeys = Object.keys(window).filter(key => 
        key.toLowerCase().includes('voyager') || 
        key.toLowerCase().includes('linkedin') || 
        key.toLowerCase().includes('app') ||
        key.toLowerCase().includes('data') ||
        key.toLowerCase().includes('store')
      );
      
      console.log('[LinkedIn Job Insights] Checking global objects:', globalKeys);
      
      for (const key of globalKeys) {
        try {
          const obj = window[key];
          if (obj && typeof obj === 'object') {
            const result = this.findAppliesAndViewsInObject(obj);
            if (result) {
              return {
                jobId: jobId,
                applies: result.applies || 0,
                views: result.views || 0,
                extractedFrom: `global-${key}`,
                timestamp: Date.now()
              };
            }
          }
        } catch (error) {
          // Skip objects that can't be accessed
        }
      }
      
      return null;
    }

    searchInScriptTags(jobId) {
      const scripts = document.querySelectorAll('script');
      
      for (const script of scripts) {
        try {
          const content = script.textContent || script.innerText;
          if (content && content.includes('applies') && content.includes(jobId)) {
            console.log('[LinkedIn Job Insights] Found potential data in script tag');
            
            // Look for JSON objects containing applies
            const jsonMatches = content.match(/\{[^{}]*"applies"[^{}]*\}/g);
            if (jsonMatches) {
              for (const jsonMatch of jsonMatches) {
                try {
                  const data = JSON.parse(jsonMatch);
                  if (data.applies !== undefined) {
                    return {
                      jobId: jobId,
                      applies: data.applies || 0,
                      views: data.views || 0,
                      extractedFrom: 'script-tag',
                      timestamp: Date.now()
                    };
                  }
                } catch (parseError) {
                  // Continue to next match
                }
              }
            }
          }
        } catch (error) {
          // Skip problematic scripts
        }
      }
      
      return null;
    }

    searchInPageState(jobId) {
      // Try to find data in common LinkedIn state management locations
      const searchLocations = [
        () => window.voyager?.store?.getState?.(),
        () => window.AppModel?.data,
        () => window.__INITIAL_STATE__,
        () => window.__DATA__,
        () => document.querySelector('[data-job-id="' + jobId + '"]')?.dataset
      ];
      
      for (const getLocation of searchLocations) {
        try {
          const location = getLocation();
          if (location) {
            const result = this.findAppliesAndViewsInObject(location);
            if (result) {
              return {
                jobId: jobId,
                applies: result.applies || 0,
                views: result.views || 0,
                extractedFrom: 'page-state',
                timestamp: Date.now()
              };
            }
          }
        } catch (error) {
          // Continue to next location
        }
      }
      
      return null;
    }

    findAppliesAndViewsInObject(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 5) return null;
      
      // Direct property check
      if (obj.applies !== undefined || obj.views !== undefined) {
        return {
          applies: obj.applies,
          views: obj.views
        };
      }
      
      // Recursive search
      for (const key in obj) {
        try {
          if (obj.hasOwnProperty(key) && obj[key] && typeof obj[key] === 'object') {
            const result = this.findAppliesAndViewsInObject(obj[key], depth + 1);
            if (result) return result;
          }
        } catch (error) {
          // Skip properties that can't be accessed
        }
      }
      
      return null;
    }

    handleJobDataUpdate(jobId, data) {
      console.log('[LinkedIn Job Insights] Processing job data update for job:', jobId);
      console.log('[LinkedIn Job Insights] Data:', data);
      
      if (data && (data.applies > 0 || data.views > 0)) {
        this.showDataNotification(data);
      }
    }

    showDataNotification(jobData) {
      // Create a temporary notification to show the extracted data
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
        <div style="font-weight: bold; margin-bottom: 8px;">
          LinkedIn Job Insights - Data Found!
        </div>
        <div>Job ID: ${jobData.jobId}</div>
        <div>📊 Applicants: ${jobData.applies || 'N/A'}</div>
        <div>👁️ Views: ${jobData.views || 'N/A'}</div>
        <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
          Source: ${jobData.extractedFrom}
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Remove after 5 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 5000);
    }

    async initializeExtension() {
      try {
        this.isInitialized = true;
        console.log('[LinkedIn Job Insights] Extension initialized successfully');
      } catch (error) {
        console.error('[LinkedIn Job Insights] Error initializing extension:', error);
      }
    }

    setupUrlMonitoring() {
      // Monitor URL changes for single-page app navigation
      this.urlCheckInterval = setInterval(() => {
        if (this.currentUrl !== window.location.href) {
          this.currentUrl = window.location.href;
          this.handleUrlChange();
        }
      }, 1000);
    }

    async handleUrlChange() {
      console.log('[LinkedIn Job Insights] URL changed to:', this.currentUrl);
      
      if (this.isLinkedInJobPage()) {
        // Re-initialize on job page
        await this.initializeExtension();
      }
    }

    isLinkedInJobPage() {
      return this.currentUrl.includes('/jobs/') || 
             this.currentUrl.includes('/job/') ||
             this.currentUrl.includes('currentJobId=');
    }

    cleanup() {
      if (this.urlCheckInterval) {
        clearInterval(this.urlCheckInterval);
      }
      this.isInitialized = false;
    }
  }

  // Initialize the content script
  const contentScript = new LinkedInJobInsightsContent();

  console.log('[LinkedIn Job Insights] Content script loaded');

})();
