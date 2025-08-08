/**
 * UI Injector for LinkedIn Job Insights Extension
 * Handles injection of applicant and view counts into LinkedIn's UI
 */

class LinkedInUIInjector {
  constructor() {
    this.injectedElements = new Set();
    this.currentJobId = null;
    this.observer = null;
    this.isInjecting = false;
    
    // Bind methods
    this.handleJobData = this.handleJobData.bind(this);
    this.observePageChanges = this.observePageChanges.bind(this);
    this.injectDataForAllJobs = utils.debounce(this.injectDataForAllJobs.bind(this), CONFIG.DEBOUNCE_DELAY);
  }

  init() {
    this.setupMessageListener();
    this.observePageChanges();
    this.injectInitialData();
    utils.log('UI Injector initialized');
  }

  setupMessageListener() {
    // Listen for messages from background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'JOB_DATA_UPDATE') {
          this.handleJobData(message.jobId, message.data);
        }
      });
    }
  }

  observePageChanges() {
    // Disconnect existing observer
    if (this.observer) {
      this.observer.disconnect();
    }

    // Create new observer for LinkedIn's SPA navigation
    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      mutations.forEach((mutation) => {
        // Check for job listing changes
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          
          // Look for job-related content
          const hasJobContent = addedNodes.some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return (
                node.classList?.contains('job-card-list__title') ||
                node.classList?.contains('jobs-search-results-list') ||
                node.classList?.contains('job-details-jobs-unified-top-card') ||
                node.querySelector?.('.job-card-list__title') ||
                node.querySelector?.('.jobs-search-results-list') ||
                node.querySelector?.('.job-details-jobs-unified-top-card')
              );
            }
            return false;
          });

          if (hasJobContent) {
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        this.injectDataForAllJobs();
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  injectInitialData() {
    // Wait for page to load, then inject data
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.injectDataForAllJobs(), 1000);
      });
    } else {
      setTimeout(() => this.injectDataForAllJobs(), 1000);
    }
  }

  handleJobData(jobId, data) {
    if (!jobId || !data) return;
    
    utils.log('Received job data for:', jobId, data);
    
    // Store data locally for quick access
    if (typeof window !== 'undefined') {
      if (!window.linkedInJobData) {
        window.linkedInJobData = new Map();
      }
      window.linkedInJobData.set(jobId, data);
    }
    
    // Inject data into UI
    this.injectJobData(jobId, data);
  }

  async injectDataForAllJobs() {
    if (this.isInjecting) return;
    this.isInjecting = true;

    try {
      // Get all stored job data
      const jobData = window.linkedInJobData || new Map();
      
      // Find all job elements on the page
      const jobElements = this.findJobElements();
      
      utils.log(`Found ${jobElements.length} job elements on page`);
      
      for (const element of jobElements) {
        const jobId = this.extractJobIdFromElement(element);
        if (jobId && jobData.has(jobId)) {
          const data = jobData.get(jobId);
          this.injectJobDataIntoElement(element, jobId, data);
        }
      }
    } catch (error) {
      utils.error('Error injecting data for all jobs:', error);
    } finally {
      this.isInjecting = false;
    }
  }

  findJobElements() {
    const selectors = [
      // Job search results
      '.job-card-container',
      '.job-card-list',
      '.jobs-search-results-list__list-item',
      
      // Job details view
      '.job-details-jobs-unified-top-card',
      '.jobs-unified-top-card',
      
      // Alternative selectors
      '[data-job-id]',
      '.job-card',
      '.jobs-search-result',
      
      // Recommended jobs
      '.jobs-home-recommended-jobs .job-card-container'
    ];

    const elements = [];
    
    selectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        elements.push(...Array.from(found));
      } catch (error) {
        // Ignore selector errors
      }
    });

    // Remove duplicates
    return [...new Set(elements)];
  }

  extractJobIdFromElement(element) {
    if (!element) return null;

    // Try data attributes
    const dataJobId = element.getAttribute('data-job-id') || 
                      element.getAttribute('data-entity-urn') ||
                      element.getAttribute('data-tracking-id');
    
    if (dataJobId) {
      const jobId = utils.extractJobId(dataJobId) || utils.extractJobIdFromEntityUrn(dataJobId);
      if (jobId) return jobId;
    }

    // Try to find job ID in links
    const links = element.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]');
    for (const link of links) {
      const jobId = utils.extractJobId(link.href);
      if (jobId) return jobId;
    }

    // Try parent elements
    let parent = element.parentElement;
    let attempts = 0;
    while (parent && attempts < 5) {
      const parentJobId = parent.getAttribute('data-job-id') || 
                          parent.getAttribute('data-entity-urn');
      if (parentJobId) {
        const jobId = utils.extractJobId(parentJobId) || utils.extractJobIdFromEntityUrn(parentJobId);
        if (jobId) return jobId;
      }
      
      parent = parent.parentElement;
      attempts++;
    }

    return null;
  }

  injectJobData(jobId, data) {
    // Find all elements that should show this job's data
    const jobElements = this.findJobElements().filter(element => {
      const elementJobId = this.extractJobIdFromElement(element);
      return elementJobId === jobId;
    });

    jobElements.forEach(element => {
      this.injectJobDataIntoElement(element, jobId, data);
    });
  }

  injectJobDataIntoElement(element, jobId, data) {
    if (!element || !jobId || !data) return;

    try {
      // Check if already injected
      const existingElement = element.querySelector('.linkedin-job-insights-container');
      if (existingElement) {
        this.updateExistingElement(existingElement, data);
        return;
      }

      // Find the best location to inject the data
      const injectionPoint = this.findInjectionPoint(element);
      if (!injectionPoint) {
        utils.log('No suitable injection point found for job:', jobId);
        return;
      }

      // Create and inject the insights element
      const insightsElement = this.createInsightsElement(data);
      this.insertInsightsElement(injectionPoint, insightsElement);
      
      // Track injected element
      this.injectedElements.add(insightsElement);
      
      utils.log('Injected insights for job:', jobId, data);
      
    } catch (error) {
      utils.error('Error injecting job data into element:', error);
    }
  }

  findInjectionPoint(element) {
    // Priority order for injection points
    const selectors = [
      // Near existing applicant count text
      '.job-card-container__metadata-item',
      '.job-details-jobs-unified-top-card__primary-description-without-tagline',
      '.jobs-unified-top-card__content--two-pane .jobs-unified-top-card__content-left',
      
      // Job card metadata areas
      '.job-card-container__metadata',
      '.job-card-list__entity-info',
      '.job-card-container__footer',
      
      // Job details areas
      '.job-details-jobs-unified-top-card__content',
      '.jobs-unified-top-card__content',
      
      // Fallback areas
      '.job-card-container',
      '.job-card-list'
    ];

    for (const selector of selectors) {
      const target = element.querySelector(selector);
      if (target) {
        return target;
      }
    }

    // If no specific area found, use the element itself
    return element;
  }

  createInsightsElement(data) {
    const container = document.createElement('div');
    container.className = 'linkedin-job-insights-container';
    
    // Create applicant count element
    if (data.applies !== undefined && data.applies > 0) {
      const applicantElement = document.createElement('span');
      applicantElement.className = 'linkedin-job-insights-applicants';
      applicantElement.innerHTML = `
        <span class="job-card-container__metadata-item">
          <span class="tvm__text tvm__text--neutral">${utils.formatNumber(data.applies)} applicants</span>
        </span>
      `;
      container.appendChild(applicantElement);
    }

    // Create view count element
    if (data.views !== undefined && data.views > 0) {
      const viewElement = document.createElement('span');
      viewElement.className = 'linkedin-job-insights-views';
      viewElement.innerHTML = `
        <span class="job-card-container__metadata-item">
          <span class="tvm__text tvm__text--neutral">${utils.formatNumber(data.views)} views</span>
        </span>
      `;
      container.appendChild(viewElement);
    }

    return container;
  }

  insertInsightsElement(target, insightsElement) {
    // Try to insert in the most appropriate way
    
    // If target has metadata items, insert among them
    const metadataItems = target.querySelectorAll('.job-card-container__metadata-item');
    if (metadataItems.length > 0) {
      const lastItem = metadataItems[metadataItems.length - 1];
      if (lastItem.parentNode) {
        lastItem.parentNode.insertBefore(insightsElement, lastItem.nextSibling);
        return;
      }
    }

    // If target is a metadata container, append to it
    if (target.classList.contains('job-card-container__metadata') || 
        target.classList.contains('job-card-list__entity-info')) {
      target.appendChild(insightsElement);
      return;
    }

    // Default: append to target
    target.appendChild(insightsElement);
  }

  updateExistingElement(existingElement, data) {
    // Update applicant count
    const applicantElement = existingElement.querySelector('.linkedin-job-insights-applicants');
    if (applicantElement && data.applies !== undefined) {
      const textElement = applicantElement.querySelector('.tvm__text');
      if (textElement) {
        textElement.textContent = `${utils.formatNumber(data.applies)} applicants`;
      }
    }

    // Update view count
    const viewElement = existingElement.querySelector('.linkedin-job-insights-views');
    if (viewElement && data.views !== undefined) {
      const textElement = viewElement.querySelector('.tvm__text');
      if (textElement) {
        textElement.textContent = `${utils.formatNumber(data.views)} views`;
      }
    }
  }

  cleanup() {
    // Remove all injected elements
    this.injectedElements.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    this.injectedElements.clear();

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// Export for use in content scripts
if (typeof window !== 'undefined') {
  window.LinkedInUIInjector = LinkedInUIInjector;
}
