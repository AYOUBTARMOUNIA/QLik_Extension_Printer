/**
 * popup.js — PDF Export Pro
 *
 * Controls the extension popup UI.
 * Reads saved options from storage, wires up all controls,
 * and dispatches EXPORT_PDF / ENABLE_SELECTION messages to
 * the content script (via background.js relay).
 */

'use strict';

// ─── DOM refs ──────────────────────────────────────────────────────────────

const btnExport       = document.getElementById('btn-export');
const btnSelect       = document.getElementById('btn-select');
const btnSaveDefaults = document.getElementById('btn-save-defaults');
const statusMsg       = document.getElementById('status-msg');

const selPaper        = document.getElementById('sel-paper');
const inpMargins      = document.getElementById('inp-margins');
const marginsHint     = document.getElementById('margins-hint');
const inpFontsize     = document.getElementById('inp-fontsize');
const fontsizeHint    = document.getElementById('fontsize-hint');
const chkImages       = document.getElementById('chk-images');
const chkHeaderFooter = document.getElementById('chk-headerfooter');
const chkReadability  = document.getElementById('chk-readability');

// ─── Initialise ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadOptions();
  bindLiveHints();
  bindActions();
});

// ─── Load / save options ───────────────────────────────────────────────────

/**
 * Fetch saved options from chrome.storage.sync and populate all controls.
 * Falls back to hardcoded defaults if nothing is stored yet.
 */
async function loadOptions() {
  const response = await sendToBackground({ action: 'LOAD_OPTIONS' });
  const opts     = response?.options || {};

  selPaper.value        = opts.paperSize      ?? 'a4';
  inpMargins.value      = opts.margins        ?? 10;
  inpFontsize.value     = opts.fontSize       ?? 100;
  chkImages.checked     = opts.includeImages  ?? true;
  chkHeaderFooter.checked = opts.headerFooter ?? true;
  chkReadability.checked  = opts.useReadability ?? true;

  // Sync hint labels
  marginsHint.textContent  = inpMargins.value  + ' mm';
  fontsizeHint.textContent = inpFontsize.value + '%';
}

/** Collect current control values into an options object. */
function collectOptions() {
  return {
    paperSize:      selPaper.value,
    margins:        Number(inpMargins.value),
    fontSize:       Number(inpFontsize.value),
    includeImages:  chkImages.checked,
    headerFooter:   chkHeaderFooter.checked,
    useReadability: chkReadability.checked
  };
}

// ─── Live hints for range inputs ───────────────────────────────────────────

function bindLiveHints() {
  inpMargins.addEventListener('input', () => {
    marginsHint.textContent = inpMargins.value + ' mm';
  });
  inpFontsize.addEventListener('input', () => {
    fontsizeHint.textContent = inpFontsize.value + '%';
  });
}

// ─── Button actions ────────────────────────────────────────────────────────

function bindActions() {
  btnExport.addEventListener('click', onExportClick);
  btnSelect.addEventListener('click', onSelectClick);
  btnSaveDefaults.addEventListener('click', onSaveDefaults);
}

/** Trigger a full-page PDF export with the current options. */
async function onExportClick() {
  setStatus('', '');
  setBusy(true, btnExport, 'Exporting…');

  try {
    const opts = collectOptions();

    const response = await sendToContent({ action: 'EXPORT_PDF', options: opts });

    if (response?.success) {
      setStatus('PDF saved successfully.', 'success');
    } else {
      setStatus(response?.error || 'Export failed. Try again.', 'error');
    }
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
  } finally {
    setBusy(false, btnExport, null, 'Export to PDF');
  }
}

/**
 * Enable drag-to-select mode in the active tab.
 * After the user finishes selecting (or cancels), run the export on that region.
 */
async function onSelectClick() {
  setStatus('Switch to the page and drag to select a region.', '');
  setBusy(true, btnSelect, 'Waiting for selection…');

  // Collapse the popup — user needs to interact with the page
  // Note: popup may close automatically on some OS/Chrome combos.
  //       That's handled via the background relay keeping the response alive.

  try {
    const response = await sendToContent({ action: 'ENABLE_SELECTION' });

    if (!response?.success) {
      setStatus(response?.reason || 'Selection cancelled.', '');
      return;
    }

    // Selection received — now export just that region
    const opts = collectOptions();
    opts.selectionRegion = response.region;

    const exportResp = await sendToContent({ action: 'EXPORT_PDF', options: opts });
    if (exportResp?.success) {
      setStatus('Region exported successfully.', 'success');
    } else {
      setStatus(exportResp?.error || 'Export failed.', 'error');
    }
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
  } finally {
    setBusy(false, btnSelect, null, 'Select Region…');
  }
}

/** Persist current options as the user's defaults. */
async function onSaveDefaults() {
  const opts = collectOptions();
  const res  = await sendToBackground({ action: 'SAVE_OPTIONS', options: opts });
  if (res?.success) {
    setStatus('Defaults saved.', 'success');
  } else {
    setStatus('Could not save defaults.', 'error');
  }
  // Clear the message after 2 s
  setTimeout(() => setStatus('', ''), 2000);
}

// ─── Messaging helpers ─────────────────────────────────────────────────────

/**
 * Send a message to background.js.
 * Always resolves; never throws (returns null on error).
 */
function sendToBackground(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { ...message, target: 'background' },
      response => {
        if (chrome.runtime.lastError) {
          console.warn('[PDF Export Pro popup]', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Ask background.js to relay a message to the content script.
 */
function sendToContent(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { ...message, target: 'content' },
      response => {
        if (chrome.runtime.lastError) {
          console.warn('[PDF Export Pro popup]', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      }
    );
  });
}

// ─── UI state helpers ──────────────────────────────────────────────────────

/** Show a status message with an optional CSS class ('' | 'success' | 'error'). */
function setStatus(text, type) {
  statusMsg.textContent = text;
  statusMsg.className   = 'status-msg' + (type ? ' ' + type : '');
}

/**
 * Toggle a button's busy/idle state.
 *
 * @param {boolean}     busy
 * @param {HTMLElement} btn
 * @param {string|null} busyLabel  — label shown while busy (null = no change)
 * @param {string|null} idleLabel  — label restored on idle (null = no change)
 */
function setBusy(busy, btn, busyLabel, idleLabel) {
  btn.disabled = busy;
  if (busy && busyLabel !== null) {
    // Preserve the SVG icon and replace only the text node
    _setButtonText(btn, busyLabel);
    btn.classList.add('loading');
  } else if (!busy) {
    if (idleLabel !== null) _setButtonText(btn, idleLabel);
    btn.classList.remove('loading');
  }
}

/** Replace the text content of a button while keeping its child SVGs. */
function _setButtonText(btn, text) {
  // Find existing text node or create one after the last SVG
  const nodes = Array.from(btn.childNodes);
  const textNode = nodes.find(n => n.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = ' ' + text;
  } else {
    btn.appendChild(document.createTextNode(' ' + text));
  }
}
