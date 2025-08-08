/**
 * Content Script for LinkedIn Job Insights Extension (Chrome)
 * Simple approach: Listen for job data from background script and display it
 */

(function() {
  'use strict';

  console.log('[LinkedIn Job Insights] Content script loading...');
  
  // Prevent multiple injections
  if (window.linkedInJobInsightsInjected) {
    console.log('[LinkedIn Job Insights] Already injected, skipping');
    return;
  }
  window.linkedInJobInsightsInjected = true;

  class LinkedInJobInsightsContent {
    constructor() {
      this.init();
    }

    init() {
      console.log('[LinkedIn Job Insights] Content script initialized');
      this.setupMessageListener();
    }

    setupMessageListener() {
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'JOB_DATA_FOUND') {
          console.log('[LinkedIn Job Insights] Received job data:', message);
          this.displayJobData(message);
          sendResponse({ success: true });
        }
      });
    }

    displayJobData(data) {
      console.log('[LinkedIn Job Insights] Displaying job data:', data);
      
      // Create notification element
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #0073b1, #005885);
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 115, 177, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        z-index: 10000;
        max-width: 300px;
        border: 2px solid #ffffff20;
      `;
      
      notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 16px;">
          📊 LinkedIn Job Insights
        </div>
        <div style="margin-bottom: 4px;">
          <strong>👥 Applicants:</strong> ${data.applies}
        </div>
        <div style="margin-bottom: 4px;">
          <strong>👀 Views:</strong> ${data.views}
        </div>
        <div style="font-size: 12px; opacity: 0.8; margin-top: 8px;">
          Job ID: ${data.jobId}
        </div>
        <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">
          Source: ${data.extractedFrom}
        </div>
      `;
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      closeBtn.onclick = () => notification.remove();
      notification.appendChild(closeBtn);
      
      // Add to page
      document.body.appendChild(notification);
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 10000);
      
      // Also try to inject into the job posting itself
      this.injectIntoJobPosting(data);
    }

    injectIntoJobPosting(data) {
      // Try to find job details section to add the data
      const selectors = [
        '.job-details-jobs-unified-top-card__container',
        '.jobs-unified-top-card',
        '.job-details',
        '.jobs-box__html',
        '.jobs-description'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          // Check if we already added our data
          if (!element.querySelector('.linkedin-job-insights-data')) {
            const dataElement = document.createElement('div');
            dataElement.className = 'linkedin-job-insights-data';
            dataElement.style.cssText = `
              background: #f3f6f8;
              border: 1px solid #0073b1;
              border-radius: 8px;
              padding: 12px;
              margin: 16px 0;
              font-size: 14px;
            `;
            
            dataElement.innerHTML = `
              <div style="font-weight: 600; color: #0073b1; margin-bottom: 8px;">
                📊 Actual Job Statistics
              </div>
              <div style="display: flex; gap: 20px;">
                <div>
                  <strong>👥 Total Applicants:</strong> ${data.applies}
                </div>
                <div>
                  <strong>👀 Total Views:</strong> ${data.views}
                </div>
              </div>
              <div style="font-size: 12px; color: #666; margin-top: 8px;">
                Revealed by LinkedIn Job Insights Extension
              </div>
            `;
            
            element.insertBefore(dataElement, element.firstChild);
            console.log('[LinkedIn Job Insights] Injected data into job posting');
            break;
          }
        }
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new LinkedInJobInsightsContent();
    });
  } else {
    new LinkedInJobInsightsContent();
  }

})();
