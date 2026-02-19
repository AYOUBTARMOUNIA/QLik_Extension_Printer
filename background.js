/**
 * background.js — PDF Export Pro Service Worker
 *
 * Responsibilities:
 *  - Relay messages between popup.js and content.js
 *  - Persist user preferences via chrome.storage.sync
 *  - Handle edge cases where content script isn't yet injected
 *    (e.g. chrome:// pages, extension pages)
 */

// ─── Message relay ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'background') {
    handleBackgroundMessage(message, sender, sendResponse);
    return true; // Keep the channel open for async response
  }

  if (message.target === 'content') {
    relayToActiveTab(message, sendResponse);
    return true;
  }
});

/**
 * Handle messages addressed directly to the background worker.
 */
async function handleBackgroundMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'SAVE_OPTIONS': {
      await chrome.storage.sync.set({ options: message.options });
      sendResponse({ success: true });
      break;
    }
    case 'LOAD_OPTIONS': {
      const data = await chrome.storage.sync.get('options');
      sendResponse({ success: true, options: data.options || {} });
      break;
    }
    default:
      sendResponse({ success: false, error: 'Unknown action: ' + message.action });
  }
}

/**
 * Forward a message to the content script running in the active tab.
 * If the content script is not reachable (e.g. restricted page), return
 * a descriptive error rather than crashing.
 */
async function relayToActiveTab(message, sendResponse) {
  let tab;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  } catch (err) {
    sendResponse({ success: false, error: 'Could not query active tab: ' + err.message });
    return;
  }

  if (!tab || !tab.id) {
    sendResponse({ success: false, error: 'No active tab found.' });
    return;
  }

  // chrome:// and edge:// pages block content scripts entirely
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    sendResponse({ success: false, error: 'PDF Export Pro cannot run on browser internal pages.' });
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    sendResponse(response);
  } catch (err) {
    // Content script may not have loaded yet — try injecting it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'lib/Readability.js',
          'lib/html2canvas.min.js',
          'lib/jspdf.umd.min.js',
          'content.js'
        ]
      });
      // Retry the message after injection
      const retryResponse = await chrome.tabs.sendMessage(tab.id, message);
      sendResponse(retryResponse);
    } catch (injectErr) {
      sendResponse({
        success: false,
        error: 'Content script could not be injected: ' + injectErr.message
      });
    }
  }
}

// ─── Install / Update lifecycle ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // Set sensible defaults on first install
    chrome.storage.sync.set({
      options: {
        paperSize:      'a4',
        margins:        10,
        fontSize:       100,
        includeImages:  true,
        headerFooter:   true,
        useReadability: true
      }
    });
  }
});
