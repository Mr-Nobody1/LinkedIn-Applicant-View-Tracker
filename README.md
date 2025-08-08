# LinkedIn Job Insights (Fresh)

Minimal MV3 Chrome extension that shows real Applicants and Views on LinkedIn job postings by reading the same data available in DevTools → Network → voyager/api/jobs/jobPostings.

## Install
1. Visit `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked → choose the `extension` folder.

## Use
1. Open any LinkedIn job posting and refresh the page once.
2. A small toast appears and an inline chip bar shows Applicants / Views.
3. Click the extension icon to open the popup; click Refresh if needed.

## Dev notes
- CSP-safe MAIN world injection via `chrome.scripting.executeScript` in service worker.
- Data cached in-memory in SW for 30 minutes.
- No external libs. Clean, native UI.
