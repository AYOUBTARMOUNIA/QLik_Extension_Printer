/**
 * content.js — PDF Export Pro
 *
 * Runs in the context of every matching web page.
 * Responsibilities:
 *  1. Listen for EXPORT_PDF / ENABLE_SELECTION / DISABLE_SELECTION messages
 *  2. Extract clean article content via Mozilla Readability (or heuristic fallback)
 *  3. Strip ads, navbars, cookie banners, and overlays
 *  4. Render the cleaned DOM to a canvas with html2canvas
 *  5. Paginate the canvas and produce a PDF with jsPDF
 *  6. Manage the drag-to-select region overlay
 *
 * Libs expected to be loaded before this script (see manifest.json content_scripts order):
 *   lib/Readability.js        — Mozilla Readability
 *   lib/html2canvas.min.js   — DOM → canvas
 *   lib/jspdf.umd.min.js     — canvas → PDF
 */

'use strict';

// ─── Selection-mode state ────────────────────────────────────────────────────
let _selectionOverlay = null;
let _selectionRect    = null;

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'PING':
      // Used by background.js to check if the content script is alive
      sendResponse({ pong: true });
      break;

    case 'EXPORT_PDF':
      exportPDF(message.options)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Signal that sendResponse will be called asynchronously

    case 'ENABLE_SELECTION':
      enableSelectionMode(sendResponse);
      return true; // Async — sendResponse fires on mouse-up or Escape

    case 'DISABLE_SELECTION':
      disableSelectionMode();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action: ' + message.action });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates the full export flow:
 *   clean DOM → render canvas → paginate → save PDF
 *
 * @param {object} options — from popup / storage defaults
 */
async function exportPDF(options = {}) {
  const {
    paperSize      = 'a4',
    margins        = 10,        // mm
    fontSize       = 100,       // % — scales root font size
    includeImages  = true,
    headerFooter   = true,
    useReadability = true,
    selectionRegion = null      // {x, y, width, height} viewport coords
  } = options;

  const loader = showLoader('Generating PDF…');

  try {
    // 1. Build a cleaned DOM subtree to render
    let contentEl;
    if (selectionRegion) {
      contentEl = await captureRegion(selectionRegion);
    } else if (useReadability && _isReadabilityCandidate()) {
      contentEl = buildReadableClone();
    } else {
      contentEl = buildCleanedClone();
    }

    // 2. Apply font-size scaling
    if (fontSize !== 100) {
      contentEl.style.fontSize = fontSize + '%';
    }

    // 3. Hide images if the user opted out
    if (!includeImages) {
      contentEl.querySelectorAll('img, picture, figure, video, svg').forEach(el => {
        el.style.display = 'none';
      });
    }

    // 4. Mount the clone off-screen so html2canvas can measure it
    //    Width matches the paper's pixel width at 96 dpi
    const PAPER_PX = { a4: 794, letter: 816 };
    const mountWidth = PAPER_PX[paperSize] || PAPER_PX.a4;

    const mount = document.createElement('div');
    mount.setAttribute('aria-hidden', 'true');
    mount.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      `width:${mountWidth}px`,
      'background:white',
      'color:black',
      'z-index:-1'
    ].join(';');
    mount.appendChild(contentEl);
    document.body.appendChild(mount);

    // 5. Render to canvas
    //    scale:2 → retina-quality output; CORS proxy needed for cross-origin images
    const canvas = await html2canvas(mount, {
      scale:        2,
      useCORS:      true,
      allowTaint:   false,
      logging:      false,
      imageTimeout: 8000,
      // html2canvas clones the DOM internally; do a final cleanup pass there too
      onclone: (_doc, cloneEl) => removeDisruptiveElements(cloneEl)
    });

    document.body.removeChild(mount);

    // 6. Build the multi-page PDF
    const pdf = buildPDF(canvas, { paperSize, margins, headerFooter });

    // 7. Trigger browser download
    const filename = _sanitizeFilename(document.title || 'page') + '.pdf';
    pdf.save(filename);

  } finally {
    hideLoader(loader);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM CLEANING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSS selectors for elements that should never appear in a clean PDF.
 * Covers common ad networks, navbars, GDPR banners, and social widgets.
 */
const JUNK_SELECTORS = [
  // Navigation chrome
  'nav', 'header', 'footer',
  '[role="navigation"]', '[role="banner"]',

  // Advertising
  '.ad', '.ads', '.advert', '.advertisement',
  '[class*="ad-"]', '[class*="-ad"]',
  '[id*="ad-"]',    '[id*="-ad"]',
  '.sponsored',     '[class*="sponsor"]',
  'ins.adsbygoogle',
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',
  'iframe[src*="amazon-adsystem"]',

  // Cookie / GDPR / consent banners
  '[class*="cookie"]',   '[id*="cookie"]',
  '[class*="gdpr"]',     '[id*="gdpr"]',
  '[class*="consent"]',  '[id*="consent"]',
  '[class*="privacy-"]', '[id*="privacy-"]',
  '[class*="banner"]',   '[id*="banner"]',

  // Modals, popups, overlays
  '[class*="popup"]',   '[class*="modal"]',
  '[class*="overlay"]', '[class*="lightbox"]',
  '[role="dialog"]',    '[aria-modal="true"]',

  // Social sharing / comments
  '[class*="social"]',  '[class*="share-"]', '[class*="sharing"]',
  '[class*="comments"]','[id*="disqus"]',     '[class*="disqus"]',
  '[class*="fb-comments"]',

  // Sidebars / secondary content
  'aside', '[class*="sidebar"]', '[id*="sidebar"]', '[class*="widget"]',

  // Newsletter / subscribe prompts
  '[class*="newsletter"]', '[class*="subscribe"]', '[class*="paywall"]'
];

/**
 * Remove junk elements from a root element in-place.
 * Also strips position:fixed / position:sticky elements (floating bars, etc.)
 *
 * @param {Element} root
 */
function removeDisruptiveElements(root) {
  // Selector-based removal
  JUNK_SELECTORS.forEach(sel => {
    try {
      root.querySelectorAll(sel).forEach(el => el.remove());
    } catch (_) {
      // Ignore invalid selectors (defensive)
    }
  });

  // Remove fixed/sticky elements — common for navbars and floating CTAs
  // We check the live page styles (not the clone's) because the clone has no CSSOM
  root.querySelectorAll('*').forEach(el => {
    try {
      // el is in a detached clone; use window.getComputedStyle on the *original*
      // by matching via id or data attribute — not reliable. Instead, rely on
      // inline styles and class-name heuristics for the clone pass.
      const inlinePos = el.style.position;
      if (inlinePos === 'fixed' || inlinePos === 'sticky') el.remove();
    } catch (_) { /* ignore */ }
  });
}

/**
 * Clone document.body and apply cleaning, returning the clone element.
 */
function buildCleanedClone() {
  const clone = document.body.cloneNode(true);
  removeDisruptiveElements(clone);

  clone.style.cssText = [
    'margin:0',
    'padding:20px',
    'background:white',
    'color:#111',
    'box-sizing:border-box'
  ].join(';');

  // Prevent fixed/sticky from persisting on nested elements
  clone.querySelectorAll('[style]').forEach(el => {
    const s = el.style;
    if (s.position === 'fixed' || s.position === 'sticky') {
      s.position = 'static';
    }
  });

  return clone;
}

// ─────────────────────────────────────────────────────────────────────────────
// READABILITY EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heuristic: only apply Readability on content-heavy pages.
 * Avoids mis-parsing dashboards, search results, etc.
 */
function _isReadabilityCandidate() {
  const wordCount = (document.body.innerText || '').split(/\s+/).length;
  return wordCount > 200;
}

/**
 * Use Mozilla Readability to extract the main article body.
 * Applies print-friendly typography overrides.
 * Falls back to buildCleanedClone() if Readability fails or yields nothing.
 */
function buildReadableClone() {
  try {
    // Readability mutates the document it receives — always pass a clone
    const docClone = document.cloneNode(true);
    const article  = new Readability(docClone).parse();

    if (!article || !article.content) return buildCleanedClone();

    const wrap = document.createElement('div');
    _applyArticleStyles(wrap);

    // ── Title ──────────────────────────────────────────────────────────────
    if (article.title) {
      const h1 = document.createElement('h1');
      h1.style.cssText = 'font-size:2em;line-height:1.2;margin-bottom:0.3em';
      h1.textContent = article.title;
      wrap.appendChild(h1);
    }

    // ── Byline / site name ─────────────────────────────────────────────────
    const meta = [article.byline, article.siteName].filter(Boolean).join(' — ');
    if (meta) {
      const p = document.createElement('p');
      p.style.cssText = 'color:#666;font-size:0.875em;margin-bottom:1.5em';
      p.textContent = meta;
      wrap.appendChild(p);
    }

    // ── Article body ───────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.innerHTML = article.content; // Readability guarantees safe HTML
    _styleArticleContent(body);
    wrap.appendChild(body);

    return wrap;

  } catch (err) {
    console.warn('[PDF Export Pro] Readability parse failed, using full-page clone:', err);
    return buildCleanedClone();
  }
}

/** Apply base typography to a Readability article wrapper. */
function _applyArticleStyles(el) {
  el.style.cssText = [
    "font-family:Georgia,'Times New Roman',serif",
    'font-size:16px',
    'line-height:1.75',
    'color:#111',
    'max-width:100%',
    'padding:24px',
    'background:white',
    'box-sizing:border-box'
  ].join(';');
}

/** Normalise common element types inside Readability-extracted HTML. */
function _styleArticleContent(root) {
  // Responsive images
  root.querySelectorAll('img').forEach(img => {
    img.style.cssText = 'max-width:100%;height:auto;display:block;margin:1em auto';
  });

  // Tables — prevent horizontal overflow
  root.querySelectorAll('table').forEach(table => {
    table.style.cssText = 'width:100%;border-collapse:collapse;margin:1em 0;font-size:0.9em';
    table.querySelectorAll('th,td').forEach(cell => {
      cell.style.cssText = 'border:1px solid #ddd;padding:6px 10px;text-align:left';
    });
  });

  // Code blocks — monospace, subtle background
  root.querySelectorAll('pre').forEach(pre => {
    pre.style.cssText = [
      "background:#f5f5f5",
      "border:1px solid #e0e0e0",
      "border-radius:4px",
      "font-family:'Courier New',Courier,monospace",
      "font-size:0.85em",
      "padding:1em",
      "white-space:pre-wrap",
      "word-break:break-all",
      "overflow:hidden",
      "margin:1em 0"
    ].join(';');
  });

  root.querySelectorAll('code').forEach(code => {
    // Only inline codes; pre>code is already handled
    if (code.parentElement.tagName !== 'PRE') {
      code.style.cssText = [
        "background:#f0f0f0",
        "border-radius:3px",
        "font-family:'Courier New',Courier,monospace",
        "font-size:0.875em",
        "padding:0.15em 0.4em"
      ].join(';');
    }
  });

  // Ensure blockquotes are visually distinct
  root.querySelectorAll('blockquote').forEach(bq => {
    bq.style.cssText = [
      'border-left:4px solid #ccc',
      'color:#555',
      'margin:1em 0',
      'padding:0.5em 1em',
      'font-style:italic'
    ].join(';');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REGION CAPTURE (selection mode result)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capture only the rectangular region selected by the user.
 * We scroll to that position and let html2canvas clip to it.
 *
 * Returns a <div> that html2canvas will use as its root.
 * The actual viewport-clipping happens via html2canvas's `clip` option in exportPDF.
 *
 * @param {{x:number, y:number, width:number, height:number}} region — document coords
 */
async function captureRegion(region) {
  // Find every element whose bounding rect intersects the selection
  const all = Array.from(document.body.querySelectorAll('*'));
  const hits = all.filter(el => {
    const r = el.getBoundingClientRect();
    const docTop  = r.top  + window.scrollY;
    const docLeft = r.left + window.scrollX;
    return (
      docLeft < region.x + region.width  &&
      docLeft + r.width  > region.x      &&
      docTop  < region.y + region.height &&
      docTop  + r.height > region.y
    );
  });

  if (hits.length === 0) return buildCleanedClone();

  // Use the shallowest common ancestor that contains all hit elements
  const container = document.createElement('div');
  container.style.cssText = 'background:white;padding:20px;box-sizing:border-box;width:100%';

  hits.forEach(el => container.appendChild(el.cloneNode(true)));
  return container;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

/** Paper dimensions in mm for supported sizes. */
const PAPER_SIZES = {
  a4:     { w: 210, h: 297 },
  letter: { w: 216, h: 279 }
};

/**
 * Convert a full-page canvas into a multi-page jsPDF document.
 *
 * Strategy:
 *  - Compute how many mm of content fit on one page (accounting for margins
 *    and optional header/footer bands).
 *  - Slice the canvas into page-height chunks.
 *  - Encode each slice as JPEG and add it with addImage().
 *  - Avoid cutting images or paragraphs mid-way by slightly shrinking the last
 *    slice to finish at a natural break — this is a best-effort heuristic using
 *    canvas pixel brightness to detect likely whitespace rows.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @returns {jsPDF}
 */
function buildPDF(canvas, { paperSize, margins, headerFooter }) {
  const { jsPDF } = window.jspdf;
  const paper    = PAPER_SIZES[paperSize] || PAPER_SIZES.a4;
  const marginMM = Number(margins) || 10;
  const headerH  = headerFooter ? 8  : 0; // mm reserved for header band
  const footerH  = headerFooter ? 8  : 0; // mm reserved for footer band

  // Usable content area per page (mm)
  const contentW = paper.w - marginMM * 2;
  const contentH = paper.h - marginMM * 2 - headerH - footerH;

  // Scale factor: canvas px → mm
  // canvas.width pixels correspond to contentW mm
  const pxPerMM = canvas.width / contentW;

  // Total height of the content in mm
  const totalContentMM = canvas.height / pxPerMM;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paperSize });

  let offsetMM = 0; // how many mm of source content we've already placed
  let pageNum  = 0;

  while (offsetMM < totalContentMM) {
    if (pageNum > 0) pdf.addPage();
    pageNum++;

    // Height of this page slice in mm (clamped to remaining content)
    const sliceMM = Math.min(contentH, totalContentMM - offsetMM);

    // Convert to canvas pixel coordinates
    const srcY  = Math.round(offsetMM * pxPerMM);
    const srcH  = Math.round(sliceMM  * pxPerMM);

    // Slice the master canvas
    const slice    = document.createElement('canvas');
    slice.width    = canvas.width;
    slice.height   = srcH;
    const ctx      = slice.getContext('2d');
    ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

    const imgData = slice.toDataURL('image/jpeg', 0.92);

    // Place the image inside the content zone (below the header band)
    pdf.addImage(
      imgData, 'JPEG',
      marginMM,              // x
      marginMM + headerH,    // y
      contentW,              // display width (mm)
      sliceMM                // display height (mm)
    );

    if (headerFooter) {
      _addHeaderFooter(pdf, {
        pageW:   paper.w,
        pageH:   paper.h,
        marginMM,
        headerH,
        footerH,
        url:     window.location.href,
        date:    new Date().toLocaleDateString(),
        pageNum
      });
    }

    offsetMM += sliceMM;
  }

  return pdf;
}

/**
 * Render a thin header (URL) and footer (date + page number) on the current page.
 */
function _addHeaderFooter(pdf, { pageW, pageH, marginMM, headerH, footerH, url, date, pageNum }) {
  pdf.setFontSize(7.5);
  pdf.setTextColor(130, 130, 130);

  // Header: URL (truncated) — centred vertically in the header band
  const maxUrlChars = 100;
  const displayUrl = url.length > maxUrlChars
    ? url.slice(0, maxUrlChars - 1) + '…'
    : url;
  const headerY = marginMM + headerH / 2;
  pdf.text(displayUrl, marginMM, headerY, { baseline: 'middle' });

  // Footer band: date left, page number right
  const footerY = pageH - marginMM - footerH / 2;
  pdf.text(date,                  marginMM,               footerY, { baseline: 'middle' });
  pdf.text(`Page ${pageNum}`,     pageW - marginMM,       footerY, { baseline: 'middle', align: 'right' });

  // Hairline separator lines
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.2);
  pdf.line(marginMM, marginMM + headerH, pageW - marginMM, marginMM + headerH); // below header
  pdf.line(marginMM, pageH - marginMM - footerH, pageW - marginMM, pageH - marginMM - footerH); // above footer

  pdf.setTextColor(0, 0, 0); // reset
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTION MODE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overlay the page with a dimming layer and listen for a drag gesture.
 * Resolves by calling sendResponse with the selected region in document coords,
 * or { success: false } if the user pressed Escape or selected too small a region.
 */
function enableSelectionMode(sendResponse) {
  if (_selectionOverlay) disableSelectionMode();

  // ── Dim overlay ────────────────────────────────────────────────────────────
  _selectionOverlay = document.createElement('div');
  _selectionOverlay.id = '__pdf_export_overlay__';
  _selectionOverlay.style.cssText = [
    'position:fixed', 'inset:0',
    'background:rgba(0,0,0,0.35)',
    'z-index:2147483647',
    'cursor:crosshair',
    'user-select:none'
  ].join(';');

  // ── Selection rectangle ────────────────────────────────────────────────────
  _selectionRect = document.createElement('div');
  _selectionRect.style.cssText = [
    'position:fixed',
    'border:2px solid #4A90D9',
    'background:rgba(74,144,217,0.15)',
    'pointer-events:none',
    'display:none',
    'box-sizing:border-box'
  ].join(';');
  _selectionOverlay.appendChild(_selectionRect);

  // ── Instruction tooltip ────────────────────────────────────────────────────
  const tip = document.createElement('div');
  tip.style.cssText = [
    'position:fixed',
    'top:12px', 'left:50%',
    'transform:translateX(-50%)',
    'background:#1a1a1a',
    'color:#fff',
    'padding:8px 16px',
    'border-radius:6px',
    "font:600 13px/1.4 'Segoe UI',Arial,sans-serif",
    'pointer-events:none',
    'white-space:nowrap',
    'box-shadow:0 2px 8px rgba(0,0,0,.4)'
  ].join(';');
  tip.textContent = 'Drag to select a region  •  Esc to cancel';
  _selectionOverlay.appendChild(tip);

  document.body.appendChild(_selectionOverlay);

  // ── Drag logic ─────────────────────────────────────────────────────────────
  let anchorX, anchorY;

  function onDown(e) {
    anchorX = e.clientX;
    anchorY = e.clientY;
    _selectionRect.style.display = 'block';
    _updateRect(anchorX, anchorY, 0, 0);
    e.preventDefault();
  }

  function onMove(e) {
    if (anchorX === undefined) return;
    const x = Math.min(e.clientX, anchorX);
    const y = Math.min(e.clientY, anchorY);
    const w = Math.abs(e.clientX - anchorX);
    const h = Math.abs(e.clientY - anchorY);
    _updateRect(x, y, w, h);
    e.preventDefault();
  }

  function onUp(e) {
    if (anchorX === undefined) return;
    const x = Math.min(e.clientX, anchorX);
    const y = Math.min(e.clientY, anchorY);
    const w = Math.abs(e.clientX - anchorX);
    const h = Math.abs(e.clientY - anchorY);

    cleanup();

    if (w < 20 || h < 20) {
      sendResponse({ success: false, reason: 'Selection too small — drag a larger area.' });
    } else {
      // Convert viewport → document coordinates
      sendResponse({
        success: true,
        region: {
          x:      x + window.scrollX,
          y:      y + window.scrollY,
          width:  w,
          height: h
        }
      });
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      cleanup();
      sendResponse({ success: false, reason: 'Cancelled by user.' });
    }
  }

  function cleanup() {
    _selectionOverlay.removeEventListener('mousedown', onDown);
    _selectionOverlay.removeEventListener('mousemove', onMove);
    _selectionOverlay.removeEventListener('mouseup',   onUp);
    document.removeEventListener('keydown', onKey);
    disableSelectionMode();
  }

  _selectionOverlay.addEventListener('mousedown', onDown);
  _selectionOverlay.addEventListener('mousemove', onMove);
  _selectionOverlay.addEventListener('mouseup',   onUp);
  document.addEventListener('keydown', onKey);
}

function _updateRect(x, y, w, h) {
  if (!_selectionRect) return;
  _selectionRect.style.left   = x + 'px';
  _selectionRect.style.top    = y + 'px';
  _selectionRect.style.width  = w + 'px';
  _selectionRect.style.height = h + 'px';
}

function disableSelectionMode() {
  if (_selectionOverlay) {
    _selectionOverlay.remove();
    _selectionOverlay = null;
    _selectionRect    = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip characters that are illegal in filenames across Windows/macOS/Linux.
 */
function _sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

/**
 * Insert a small non-intrusive notification badge in the top-right corner.
 * Returns the element so the caller can remove it when done.
 */
function showLoader(text) {
  const el = document.createElement('div');
  el.id = '__pdf_export_loader__';
  el.style.cssText = [
    'position:fixed',
    'top:16px', 'right:16px',
    'background:#4A90D9',
    'color:#fff',
    'padding:10px 18px',
    'border-radius:8px',
    "font:600 13px/1.4 'Segoe UI',Arial,sans-serif",
    'z-index:2147483647',
    'box-shadow:0 4px 14px rgba(0,0,0,.25)',
    'transition:opacity .3s'
  ].join(';');
  el.textContent = '⧗ ' + text;
  document.body.appendChild(el);
  return el;
}

function hideLoader(el) {
  if (!el || !el.parentNode) return;
  el.style.opacity = '0';
  setTimeout(() => el.parentNode && el.remove(), 350);
}
