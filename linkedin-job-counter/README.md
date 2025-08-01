# LinkedIn Job Insights Extension

A browser extension that reveals the true number of job applicants and views for LinkedIn job postings, replacing vague ranges like "100+ applicants" with exact counts.

## Features

- **Real Applicant Counts**: Shows exact numbers (e.g., "2,847 applicants" instead of "100+ applicants")
- **Job View Counts**: Displays total views for each job posting when available
- **Seamless Integration**: Injects data directly into LinkedIn's existing UI
- **Real-time Updates**: Automatically updates when navigating between jobs
- **Cross-browser Support**: Works on Chrome, Firefox, and Edge
- **Privacy-First**: No external data transmission, all processing happens locally
- **Responsive Design**: Adapts to different screen sizes and LinkedIn's layout changes

## How It Works

The extension intercepts network requests to LinkedIn's internal API (`voyager/api/jobs/jobPostings`) and extracts the `applies` and `views` fields from the response data. This information is then seamlessly injected into LinkedIn's job posting UI to replace or supplement the existing applicant count displays.

## Installation

### Chrome/Edge
1. Download or clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `chrome` folder
5. The extension should now be active on LinkedIn job pages

### Firefox
1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the `firefox` folder
5. The extension should now be active on LinkedIn job pages

## Project Structure

```
linkedin-job-counter/
├── chrome/                     # Chrome extension files
│   ├── manifest.json          # Chrome Manifest V3
│   ├── background.js          # Service worker for Chrome
│   ├── content.js            # Content script for Chrome
│   ├── styles.css           # CSS styles
│   └── icons/               # Extension icons
├── firefox/                   # Firefox extension files
│   ├── manifest.json          # Firefox Manifest V3
│   ├── background.js          # Background script for Firefox
│   ├── content.js            # Content script for Firefox
│   ├── styles.css           # CSS styles
│   └── icons/               # Extension icons
├── shared/                    # Shared utilities
│   ├── utils.js              # Common utilities and configuration
│   └── ui-injector.js        # UI injection logic
└── README.md                 # This file
```

## Technical Details

### Architecture

The extension consists of three main components:

1. **Background Script**: Intercepts LinkedIn API requests and extracts job data
2. **Content Script**: Manages UI injection and user interactions
3. **UI Injector**: Handles the actual injection of data into LinkedIn's interface

### API Interception

The extension monitors requests to these LinkedIn API endpoints:
- `*://www.linkedin.com/voyager/api/jobs/jobPostings*`
- `*://www.linkedin.com/voyager/api/jobs/search*`

### Data Extraction

Job data is extracted from various response structures:
- Standard voyager API responses with `included` arrays
- Alternative API structures with `elements` arrays
- Direct data objects

### UI Integration

The extension injects data into multiple LinkedIn layouts:
- Job search results lists
- Individual job detail pages
- Recommended jobs sections
- Job card containers

## Privacy & Security

- **No External Requests**: All data processing happens locally
- **No Data Collection**: The extension doesn't collect or transmit any user data
- **Minimal Permissions**: Only requests necessary permissions for LinkedIn.com
- **Secure Implementation**: Follows browser extension security best practices

## Browser Compatibility

### Chrome/Chromium-based Browsers
- **Manifest Version**: V3
- **Minimum Version**: Chrome 88+
- **Features**: Full functionality with service worker architecture

### Firefox
- **Manifest Version**: V3
- **Minimum Version**: Firefox 109+
- **Features**: Full functionality with background script

### Edge
- Uses the Chrome version due to Chromium compatibility

## Development

### Prerequisites
- Node.js (for any build tools, if needed)
- A modern web browser for testing

### Testing
1. Load the extension in developer mode
2. Navigate to LinkedIn job search or individual job pages
3. Look for enhanced applicant and view counts
4. Check browser console for any errors

### Debugging
- **Chrome**: Use Chrome DevTools > Extensions > Background page
- **Firefox**: Use about:debugging > Extension > Inspect

## Known Limitations

1. **API Dependency**: Relies on LinkedIn's internal API structure
2. **Rate Limiting**: May be subject to LinkedIn's rate limiting
3. **Layout Changes**: LinkedIn UI updates may require extension updates
4. **Data Availability**: Not all jobs may have complete applicant/view data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on both Chrome and Firefox
5. Submit a pull request

## License

This project is for educational purposes. Please respect LinkedIn's Terms of Service and use responsibly.

## Disclaimer

This extension is not affiliated with LinkedIn. It's an independent tool designed to provide additional insights into job posting data that may already be available through LinkedIn's interface. Users should comply with LinkedIn's Terms of Service and use this extension responsibly.

## Troubleshooting

### Extension Not Working
1. Ensure you're on a LinkedIn job page (`linkedin.com/jobs/`)
2. Check that the extension is enabled in your browser
3. Refresh the page and wait a few seconds for data to load
4. Check the browser console for error messages

### Data Not Appearing
1. The job posting may not have applicant/view data available
2. LinkedIn may have changed their API structure
3. Network requests might be blocked by privacy tools

### Performance Issues
1. The extension automatically cleans up old data every hour
2. Restart the browser if memory usage becomes excessive
3. Disable and re-enable the extension if it becomes unresponsive

## Future Enhancements

- [ ] Add support for more LinkedIn job page layouts
- [ ] Include additional job insights (posting date, application deadline)
- [ ] Add export functionality for job data
- [ ] Implement caching for better performance
- [ ] Add user preferences and settings
- [ ] Support for other professional networking sites

## Version History

### v1.0.0
- Initial release
- Basic applicant and view count extraction
- Chrome and Firefox support
- Responsive UI integration
