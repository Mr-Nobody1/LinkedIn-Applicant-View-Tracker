/**
 * Content Script for LinkedIn Job Insights Extension (Chrome)
 * Manages UI injection and user interactions
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.linkedInJobInsightsInjected) {
    return;
  }
  window.linkedInJobInsightsInjected = true;

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

        utils.log('Content script initialized');
      } catch (error) {
        utils.error('Error initializing content script:', error);
      }
    }

    async initializeExtension() {
      if (this.isInitialized) return;

      try {
        // Wait a bit for LinkedIn to load
        await utils.sleep(1000);

        // Initialize UI injector
        this.uiInjector = new LinkedInUIInjector();
        this.uiInjector.init();

        // Request job data for current page
        await this.requestJobDataForCurrentPage();

        this.isInitialized = true;
        utils.log('Extension initialized successfully');

      } catch (error) {
        utils.error('Error initializing extension:', error);
      }
    }

    setupUrlMonitoring() {
      // Check for URL changes every second (for SPA navigation)
      this.urlCheckInterval = setInterval(() => {
        if (window.location.href !== this.currentUrl) {
          this.currentUrl = window.location.href;
          this.handleUrlChange();
        }
      }, 1000);

      // Also listen for history changes
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function() {
        originalPushState.apply(history, arguments);
        setTimeout(() => this.handleUrlChange(), 100);
      }.bind(this);

      history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        setTimeout(() => this.handleUrlChange(), 100);
      }.bind(this);

      window.addEventListener('popstate', () => {
        setTimeout(() => this.handleUrlChange(), 100);
      });
    }

    async handleUrlChange() {
      utils.log('URL changed to:', this.currentUrl);

      // Re-initialize if on a new job page
      if (this.isLinkedInJobPage()) {
        await utils.sleep(2000); // Wait for LinkedIn to load new content
        
        if (this.uiInjector) {
          this.uiInjector.injectDataForAllJobs();
        }

        await this.requestJobDataForCurrentPage();
      }
    }

    isLinkedInJobPage() {
      return this.currentUrl.includes('/jobs/') || 
             this.currentUrl.includes('/search/results/');
    }

    async requestJobDataForCurrentPage() {
      try {
        // Extract job ID from current URL
        const jobId = utils.extractJobId(this.currentUrl);
        
        if (jobId) {
          // Request data from background script
          const response = await chrome.runtime.sendMessage({
            type: 'GET_JOB_DATA',
            jobId: jobId
          });

          if (response && response.data) {
            this.handleJobData(response.jobId, response.data);
          }
        }

        // Also request refresh to trigger new API calls
        chrome.runtime.sendMessage({
          type: 'REFRESH_JOB_DATA'
        });

      } catch (error) {
        utils.error('Error requesting job data:', error);
      }
    }

    handleJobData(jobId, data) {
      if (!this.uiInjector) return;

      utils.log('Received job data in content script:', jobId, data);
      this.uiInjector.handleJobData(jobId, data);
    }

    // Handle messages from background script
    handleMessage(message, sender, sendResponse) {
      try {
        if (message.type === 'JOB_DATA_UPDATE') {
          this.handleJobData(message.jobId, message.data);
        }
      } catch (error) {
        utils.error('Error handling message:', error);
      }
    }

    cleanup() {
      if (this.urlCheckInterval) {
        clearInterval(this.urlCheckInterval);
        this.urlCheckInterval = null;
      }

      if (this.uiInjector) {
        this.uiInjector.cleanup();
        this.uiInjector = null;
      }

      this.isInitialized = false;
    }
  }

  // Initialize the content script
  const contentScript = new LinkedInJobInsightsContent();

  // Set up message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    contentScript.handleMessage(message, sender, sendResponse);
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    contentScript.cleanup();
  });

  // Add some CSS for better integration
  const style = document.createElement('style');
  style.textContent = `
    .linkedin-job-insights-container {
      display: inline-flex;
      gap: 8px;
      margin-left: 8px;
    }
    
    .linkedin-job-insights-applicants,
    .linkedin-job-insights-views {
      display: inline-block;
    }
    
    .linkedin-job-insights-container .job-card-container__metadata-item {
      color: rgba(0,0,0,.6);
      font-size: 12px;
      line-height: 1.33333;
    }
    
    .linkedin-job-insights-container .tvm__text {
      color: inherit;
    }
    
    /* Dark theme support */
    @media (prefers-color-scheme: dark) {
      .linkedin-job-insights-container .job-card-container__metadata-item {
        color: rgba(255,255,255,.6);
      }
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .linkedin-job-insights-container {
        flex-direction: column;
        gap: 4px;
      }
    }
  `;
  
  document.head.appendChild(style);

  utils.log('LinkedIn Job Insights content script loaded');

})();
