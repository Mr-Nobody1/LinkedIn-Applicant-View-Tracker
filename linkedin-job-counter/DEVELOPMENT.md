# Development & Testing Guide

## Quick Start

### Chrome Development
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" and select the `chrome` folder
4. Open LinkedIn jobs page and check console for logs

### Firefox Development  
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `firefox/manifest.json`
4. Open LinkedIn jobs page and check console for logs

## Testing Checklist

### Basic Functionality
- [ ] Extension loads without errors
- [ ] Background script initializes correctly
- [ ] Content script injects on LinkedIn job pages
- [ ] API requests are intercepted successfully
- [ ] Job data is extracted from responses
- [ ] UI elements are injected into job listings
- [ ] Numbers format correctly (with commas)

### UI Integration
- [ ] Data appears in job search results
- [ ] Data appears on individual job pages
- [ ] Data appears in recommended jobs
- [ ] Styling matches LinkedIn's design
- [ ] Dark mode support works
- [ ] Mobile responsive design

### Navigation Testing
- [ ] Works when navigating between jobs
- [ ] Updates when using browser back/forward
- [ ] Persists data across page refreshes
- [ ] Handles LinkedIn's SPA navigation

### Error Handling
- [ ] Graceful handling of missing data
- [ ] Network error recovery
- [ ] Invalid response handling
- [ ] Extension continues working after errors

## Debugging Tips

### Chrome DevTools
1. Go to `chrome://extensions/`
2. Click "Inspect views: background page" for the extension
3. Check console for background script logs
4. For content script, inspect the LinkedIn page normally

### Firefox Debugging
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Inspect" next to the extension
3. Check console for background script logs
4. For content script, inspect the LinkedIn page normally

### Common Issues

**Extension doesn't load:**
- Check manifest.json syntax
- Verify file paths are correct
- Check console for permission errors

**No data appears:**
- Verify you're on a LinkedIn job page
- Check if API requests are being intercepted
- Look for parsing errors in console
- Confirm LinkedIn hasn't changed their API structure

**UI injection fails:**
- Check CSS selectors are still valid
- Verify LinkedIn hasn't changed their HTML structure
- Look for JavaScript errors in content script

## API Testing

### Manual Testing
1. Open browser DevTools > Network tab
2. Navigate to LinkedIn job pages
3. Look for requests to `voyager/api/jobs/`
4. Check response structure matches expected format

### Response Structure Examples

**Standard Voyager Response:**
```json
{
  "included": [
    {
      "entityUrn": "urn:li:jobPosting:1234567890",
      "applies": 247,
      "views": 1523,
      "title": "Software Engineer",
      "companyDetails": {
        "companyName": "Example Company"
      }
    }
  ]
}
```

**Alternative Response:**
```json
{
  "elements": [
    {
      "jobId": "1234567890",
      "applicationCount": 247,
      "viewCount": 1523,
      "title": "Software Engineer",
      "company": "Example Company"
    }
  ]
}
```

## Performance Testing

### Memory Usage
- Monitor extension memory in Task Manager
- Check for memory leaks during extended use
- Verify cleanup functions work correctly

### Network Impact
- Ensure no additional network requests
- Verify requests don't slow down LinkedIn
- Check for rate limiting issues

## Browser Compatibility

### Chrome/Chromium Testing
- Test on latest Chrome version
- Test on Chrome Canary for upcoming features
- Test on Edge (Chromium-based)

### Firefox Testing  
- Test on latest Firefox version
- Test on Firefox Developer Edition
- Test on Firefox ESR if applicable

## Code Quality

### JavaScript
- Use ESLint for code linting
- Follow consistent naming conventions
- Add comprehensive error handling
- Document complex functions

### CSS
- Validate CSS syntax
- Test responsive design
- Verify dark mode support
- Check accessibility features

## Security Testing

### Content Security Policy
- Ensure no inline scripts
- Verify all resources load correctly
- Test with strict CSP settings

### Permissions
- Use minimal required permissions
- Test without optional permissions
- Verify host permissions work correctly

## Deployment Preparation

### Code Review
- [ ] Remove console.log statements (or make conditional)
- [ ] Update version numbers
- [ ] Verify all files are included
- [ ] Check file sizes are reasonable

### Documentation
- [ ] Update README.md
- [ ] Create user installation guide
- [ ] Document known issues
- [ ] Add troubleshooting section

### Testing Matrix

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome  | Latest  | ✅     | Primary target |
| Chrome  | 88+     | ✅     | Minimum supported |
| Firefox | Latest  | ✅     | Primary target |  
| Firefox | 109+    | ✅     | Minimum supported |
| Edge    | Latest  | ✅     | Uses Chrome build |

## Release Process

1. **Pre-release Testing**
   - Full functionality test
   - Cross-browser compatibility 
   - Performance verification

2. **Version Bump**
   - Update manifest.json versions
   - Update README version history
   - Tag git release

3. **Package Creation**
   - Create .zip for Chrome Web Store
   - Create .xpi for Firefox AMO
   - Verify package contents

4. **Store Submission**
   - Submit to Chrome Web Store
   - Submit to Firefox Add-ons
   - Monitor review process

## Maintenance

### Regular Updates
- Monitor LinkedIn for UI changes
- Update selectors as needed
- Test after browser updates
- Address user feedback

### API Changes
- Watch for LinkedIn API modifications
- Update parsing logic as needed
- Add new data fields if available
- Maintain backward compatibility
