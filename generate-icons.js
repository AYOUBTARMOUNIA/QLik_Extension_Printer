/**
 * generate-icons.js
 *
 * Generates simple SVG-based extension icons in required PNG sizes.
 * Uses Node.js built-ins only — no npm dependencies needed.
 *
 * The icon is a rounded-corner blue square with a stylised "P" arrow
 * (representing "export to PDF").
 *
 * Usage:
 *   node generate-icons.js
 *
 * Output: icons/icon16.png  icons/icon32.png  icons/icon48.png  icons/icon128.png
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128];
const DIR   = path.join(__dirname, 'icons');

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

/**
 * Build an SVG string for the given size.
 * Scales font/stroke proportionally to the icon size.
 */
function buildSVG(size) {
  const r  = Math.round(size * 0.18); // corner radius
  const cx = size / 2;
  const cy = size / 2;

  // Arrow-down shape pointing to a baseline (download / export metaphor)
  const arrowW  = size * 0.28;
  const arrowH  = size * 0.30;
  const stemW   = size * 0.14;
  const stemH   = size * 0.25;
  const baseline= size * 0.75;
  const baseT   = size * 0.80;
  const baseH   = size * 0.07;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${r}" fill="#4A90D9"/>

  <!-- Stem of the arrow -->
  <rect
    x="${cx - stemW / 2}"
    y="${size * 0.18}"
    width="${stemW}"
    height="${stemH + arrowH * 0.4}"
    fill="white"
    rx="${stemW * 0.2}"
  />

  <!-- Arrowhead (down-pointing triangle) -->
  <polygon
    points="
      ${cx},${baseline}
      ${cx - arrowW / 2},${baseline - arrowH * 0.6}
      ${cx + arrowW / 2},${baseline - arrowH * 0.6}
    "
    fill="white"
  />

  <!-- Baseline bar (tray / surface) -->
  <rect
    x="${cx - arrowW * 0.8}"
    y="${baseT}"
    width="${arrowW * 1.6}"
    height="${baseH}"
    fill="white"
    rx="${baseH * 0.5}"
  />
</svg>`;
}

/**
 * Write the SVG as a file and also produce a minimal PNG using
 * a pure-JS BMP→PNG pipeline so Node alone (no canvas module) works.
 *
 * For production, replace this with sharp or canvas:
 *   const sharp = require('sharp');
 *   await sharp(Buffer.from(svg)).png().toFile(pngPath);
 */
function writeSVGAndPlaceholderPNG(size) {
  const svg     = buildSVG(size);
  const svgPath = path.join(DIR, `icon${size}.svg`);
  const pngPath = path.join(DIR, `icon${size}.png`);

  // Always write SVG for reference / manual conversion
  fs.writeFileSync(svgPath, svg, 'utf8');

  if (fs.existsSync(pngPath)) {
    console.log(`  [skip] ${path.basename(pngPath)} already exists`);
    return;
  }

  // Attempt to use the `canvas` npm package if available (optional)
  try {
    const { createCanvas, loadImage } = require('canvas');
    const svgDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

    // canvas.loadImage works synchronously with data URLs only in some versions;
    // use the sync fallback below if this doesn't work in your environment.
    const c   = createCanvas(size, size);
    const ctx = c.getContext('2d');
    const img = new Image();
    img.src = svgDataUrl;
    ctx.drawImage(img, 0, 0, size, size);
    fs.writeFileSync(pngPath, c.toBuffer('image/png'));
    console.log(`  [png]  ${path.basename(pngPath)} (via canvas)`);
    return;
  } catch (_) {
    // `canvas` module not installed — write a tiny valid placeholder PNG
  }

  // Fallback: write a minimal 1×1 solid-colour PNG scaled up.
  // This keeps Chrome happy during development; replace with real icons for production.
  fs.writeFileSync(pngPath, buildSolidColourPNG(size, 0x4A, 0x90, 0xD9));
  console.log(`  [png]  ${path.basename(pngPath)} (placeholder — install 'canvas' for real icons)`);
}

// ─── Minimal PNG encoder (no dependencies) ───────────────────────────────

/**
 * Build a valid PNG filled with a single solid RGB colour.
 * Uses raw deflate via zlib (Node built-in) + manual IHDR/IDAT/IEND.
 */
function buildSolidColourPNG(size, r, g, b) {
  const zlib = require('zlib');

  // Build raw image data: for each row, filter byte 0x00 (None) + RGB pixels
  const rowLen  = 1 + size * 3; // filter byte + RGB
  const rawData = Buffer.alloc(rowLen * size);

  for (let y = 0; y < size; y++) {
    const base = y * rowLen;
    rawData[base] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      rawData[base + 1 + x * 3 + 0] = r;
      rawData[base + 1 + x * 3 + 1] = g;
      rawData[base + 1 + x * 3 + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8]  = 8;   // bit depth
  ihdrData[9]  = 2;   // colour type: RGB
  ihdrData[10] = 0;   // compression
  ihdrData[11] = 0;   // filter
  ihdrData[12] = 0;   // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const crc32 = require('zlib').crc32 // Node 22+ has crc32; fallback below
    ? (buf) => require('zlib').crc32(buf)
    : (buf) => _crc32(buf);

  const len  = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Pure-JS CRC-32 for environments where zlib.crc32 isn't available. */
function _crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = _crc32.table || (_crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────

for (const size of SIZES) {
  writeSVGAndPlaceholderPNG(size);
}

console.log(`\nIcons written to: ${DIR}`);
console.log("Tip: install 'canvas' (npm i canvas) for proper rasterised PNGs,");
console.log("     or convert the .svg files manually with Inkscape / ImageMagick.");
