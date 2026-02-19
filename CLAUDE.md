# CLAUDE.md — QLik Extension Printer

This file provides context for AI coding assistants working on this codebase.

---

## Project Summary

**QLik Extension Printer** is a **Qlik Sense visualization extension** that renders a configurable print button on any Qlik Sense sheet. Clicking the button hides Qlik's chrome (header, toolbar, navigation) via injected CSS and opens the browser's native `window.print()` dialog, producing a clean sheet-only PDF with no server-side dependency.

The extension is imported into Qlik Management Console (QMC) as a ZIP archive.

---

## Repository Layout

```
QLik_Extension_Printer/
├── QLik_Extension_Printer.qext   ← REQUIRED by QMC — extension metadata (JSON)
├── QLik_Extension_Printer.js     ← AMD module (RequireJS) — main extension logic
├── QLik_Extension_Printer.css    ← Button styles + @media print rules
├── README.md
└── CLAUDE.md                     ← you are here
```

### Critical: the `.qext` file

QMC validates a ZIP as a Qlik extension **only if it contains a `.qext` file at the archive root**. The file must be valid JSON. Without it, QMC returns *"The zip file did not contain any valid extension"*.

### ZIP packaging rule

Files must be zipped **individually** (flat), not as a folder. Example:

```bash
zip QLik_Extension_Printer.zip \
  QLik_Extension_Printer.qext \
  QLik_Extension_Printer.js \
  QLik_Extension_Printer.css
```

Zipping the parent folder — `zip -r ext.zip QLik_Extension_Printer/` — places files inside a subfolder in the archive, which QMC may reject depending on version.

---

## Architecture

### Module system

Qlik Sense uses **RequireJS (AMD)**. Every extension entry point must follow:

```js
define(['qlik', 'jquery', /* other deps */], function (qlik, $) {
  return {
    definition:        { /* property panel */ },
    initialProperties: { /* default values */ },
    paint:             function ($element, layout) { /* render */ }
  };
});
```

The `paint` function is called on every re-render (resize, property change, selection change).

### Extension lifecycle

```
QMC import ZIP
  → QMC reads .qext → registers extension name
  → User opens app in edit mode
  → User drags extension onto sheet
  → Qlik calls paint($element, layout) on each render cycle
  → paint() injects the button HTML
  → Button click → _triggerPrint() injects @media print CSS → window.print()
  → afterprint event → cleanup injected CSS
```

### Properties / layout object

The `layout` parameter in `paint()` mirrors the `definition` structure.
All custom properties live under `layout.props.*`:

| Property key | Type | Default |
|---|---|---|
| `props.buttonLabel` | string | `'Print / Export PDF'` |
| `props.buttonIcon` | boolean | `true` |
| `props.printTarget` | `'sheet'` \| `'object'` | `'sheet'` |
| `props.orientation` | `'landscape'` \| `'portrait'` | `'landscape'` |
| `props.colorMode` | `'color'` \| `'grayscale'` | `'color'` |
| `props.hideSelf` | boolean | `true` |

---

## Key Conventions

### No external dependencies

The extension intentionally loads **only** `qlik` and `jquery` — both are provided by the Qlik Sense runtime. Do not add npm packages or CDN `<script>` tags. All functionality must be achievable with browser built-ins + the two Qlik-provided modules.

### AMD only — no ES modules

Qlik Sense's RequireJS runtime does **not** support ES `import`/`export`. All code must use `define([...], function(...) { ... })`. Do not introduce TypeScript, Babel, Webpack, or any bundler unless explicitly requested.

### DOM isolation — jQuery scoped to `$element`

Always scope DOM queries to `$element` (the container managed by Qlik), never to the entire document. The one exception is the deliberate full-page manipulation in `_triggerPrint()`, which is intentional and documented.

### Paint idempotency

`paint()` may be called multiple times rapidly (e.g. on window resize). Always call `$element.empty()` before injecting new HTML to avoid duplicate event listeners.

### CSS class naming

All extension-specific classes are prefixed `qep-` (Qlik Extension Printer) to avoid collisions with Qlik's own stylesheet and the host page's styles.

### No persistent DOM mutations

`_triggerPrint()` injects a `<style>` tag and adds a class to an ancestor element. Both are **removed** in the `afterprint` listener. Never leave modifications outside `$element` after the print dialog closes.

---

## Common Development Tasks

### Reload the extension after editing

1. QMC → **Extensions** → select the extension → **Delete**.
2. Re-import the updated ZIP.
3. Open/reload your Qlik Sense app.

For faster iteration on Qlik Sense Desktop, you can edit files directly in the extensions folder:
`%USERPROFILE%\Documents\Qlik\Sense\Extensions\QLik_Extension_Printer\`

Then press F5 in the browser — no re-import needed.

### Add a new property panel control

1. Add an entry inside the `definition.items.appearance.items` object in `QLik_Extension_Printer.js`.
2. Set a unique `ref` (e.g. `'props.myNewProp'`).
3. Read it in `paint()` via `layout.props.myNewProp`.
4. Update the options table in `README.md` and this file.

### Extend the list of hidden selectors

The selectors that hide Qlik chrome during printing are in the `_triggerPrint()` function inside `QLik_Extension_Printer.js`, in the `hideSelectors` variable. Add new selectors to the array and separate with commas. Use the browser DevTools inspector on a Qlik sheet to find element class names.

### Test print output without a printer

In Chrome/Edge: open the print dialog → change **Destination** to **Save as PDF**.
In Firefox: open the print dialog → click **Print to File**.

---

## `.qext` file schema reference

Required fields:

```json
{
  "name":        "Human-readable name shown in QMC and the Assets panel",
  "description": "Short description",
  "type":        "visualization",
  "version":     "1.0.0"
}
```

Optional fields commonly used: `"author"`, `"homepage"`, `"keywords"`, `"license"`, `"dependencies": { "qlik-sense": ">=3.0.x" }`.

**The `"type"` field must be `"visualization"`** for a standard sheet extension.
Other valid types: `"mashup"`, `"theme"` (rarely used for sheet extensions).

---

## Out of Scope (do not implement without explicit instruction)

- Server-side PDF rendering (Qlik Print Service / Puppeteer)
- QlikView (`.qvpp`) extension format
- Multi-page sheet export via Qlik's REST API
- Firefox / Safari cross-browser pixel-perfect print normalisation
- Snapshot or export-data support (`support.snapshot`, `support.exportData`)
- Custom themes / white-label branding of the button
