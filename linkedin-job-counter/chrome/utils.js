/**
 * Shared utilities for LinkedIn Job Insights Extension
 */

// Configuration constants
const CONFIG = {
  LINKEDIN_API_PATTERNS: [
    '*://www.linkedin.com/voyager/api/jobs/jobPostings*',
    '*://www.linkedin.com/voyager/api/jobs/search*'
  ],
  STORAGE_KEY: 'linkedin_job_data',
  DEBOUNCE_DELAY: 500,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};

// Job data storage
class JobDataStore {
  constructor() {
    this.data = new Map();
    this.listeners = new Set();
  }

  set(jobId, data) {
    this.data.set(jobId, {
      ...data,
      timestamp: Date.now()
    });
    this.notifyListeners(jobId, data);
  }

  get(jobId) {
    return this.data.get(jobId);
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(jobId, data) {
    this.listeners.forEach(callback => {
      try {
        callback(jobId, data);
      } catch (error) {
        console.error('Error in job data listener:', error);
      }
    });
  }

  clear() {
    this.data.clear();
  }

  // Clean old entries (older than 1 hour)
  cleanup() {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    
    for (const [jobId, data] of this.data.entries()) {
      if (now - data.timestamp > oneHour) {
        this.data.delete(jobId);
      }
    }
  }
}

// Utility functions
const utils = {
  // Extract job ID from URL
  extractJobId(url) {
    if (!url) return null;
    
    // Try different patterns for job ID extraction
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
  },

  // Extract job ID from LinkedIn API response URL
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
  },

  // Parse LinkedIn API response for job data
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
          const jobId = this.extractJobIdFromApiUrl(url) || this.extractJobIdFromElement(element);
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
      } else if (data.data) {
        // Direct data structure
        const jobId = this.extractJobIdFromApiUrl(url);
        if (jobId && (data.data.applies !== undefined || data.data.views !== undefined)) {
          jobData.push({
            jobId,
            applies: data.data.applies || data.data.applicationCount || 0,
            views: data.data.views || data.data.viewCount || 0,
            title: data.data.title || 'Unknown',
            company: data.data.companyName || data.data.company || 'Unknown'
          });
        }
      }
      
      return jobData;
    } catch (error) {
      console.error('Error parsing job data:', error);
      return [];
    }
  },

  // Extract job ID from entity URN
  extractJobIdFromEntityUrn(entityUrn) {
    if (!entityUrn) return null;
    
    const match = entityUrn.match(/jobPosting[:\-](\d+)/);
    return match ? match[1] : null;
  },

  // Extract job ID from API element
  extractJobIdFromElement(element) {
    if (!element) return null;
    
    // Try various property paths
    const paths = [
      'jobPostingId',
      'entityUrn',
      'trackingUrn',
      'jobId',
      'id'
    ];
    
    for (const path of paths) {
      const value = element[path];
      if (value) {
        if (typeof value === 'string') {
          const jobId = this.extractJobIdFromEntityUrn(value) || this.extractJobId(value);
          if (jobId) return jobId;
        } else if (typeof value === 'number') {
          return value.toString();
        }
      }
    }
    
    return null;
  },

  // Format numbers with commas
  formatNumber(num) {
    if (typeof num !== 'number') {
      num = parseInt(num, 10);
    }
    
    if (isNaN(num)) return '0';
    
    return num.toLocaleString();
  },

  // Debounce function
  debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  },

  // Sleep function for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Retry function for failed operations
  async retry(fn, attempts = CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await this.sleep(CONFIG.RETRY_DELAY * (i + 1));
      }
    }
  },

  // Check if URL matches LinkedIn job patterns
  isLinkedInJobUrl(url) {
    return url && (
      url.includes('linkedin.com/jobs') ||
      url.includes('linkedin.com/voyager/api/jobs')
    );
  },

  // Generate unique ID for elements
  generateId() {
    return `linkedin-job-insights-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  // Log with prefix
  log(...args) {
    console.log('[LinkedIn Job Insights]', ...args);
  },

  // Error logging
  error(...args) {
    console.error('[LinkedIn Job Insights]', ...args);
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, JobDataStore, utils };
}
