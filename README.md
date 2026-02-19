# QLik Extension Printer

A **Qlik Sense visualization extension** that adds a configurable **Print / Export PDF** button to any sheet. One click opens the browser's native print dialog with a clean, sheet-only layout — ads, navigation bars, and Qlik toolbars are all hidden automatically.

No server-side component, no dependencies to install.

---

## Installation — QMC import

1. **Download** or build the ZIP (see [Building the ZIP](#building-the-zip) below).
2. Log in to **Qlik Management Console (QMC)** → **Extensions**.
3. Click **Import** and select `QLik_Extension_Printer.zip`.
4. The extension appears in the list as **QLik Extension Printer**.

> The ZIP must contain `QLik_Extension_Printer.qext` at its root — that file is how QMC identifies it as a valid extension.

### Building the ZIP

From the repo root (Linux / macOS / Git Bash):

```bash
cd QLik_Extension_Printer
zip -r ../QLik_Extension_Printer.zip \
  QLik_Extension_Printer.qext \
  QLik_Extension_Printer.js \
  QLik_Extension_Printer.css \
  README.md
```

Or on Windows PowerShell:

```powershell
Compress-Archive -Path `
  QLik_Extension_Printer.qext, `
  QLik_Extension_Printer.js, `
  QLik_Extension_Printer.css `
  -DestinationPath ..\QLik_Extension_Printer.zip -Force
```

> **Important:** zip the individual files, NOT the parent folder. QMC expects the `.qext` file to be at the root of the archive, not inside a subfolder.

---

## Adding to a sheet

1. Open a Qlik Sense app and enter **Edit** mode on a sheet.
2. In the **Assets** panel → **Extensions**, find **QLik Extension Printer**.
3. Drag it onto the sheet and resize as needed (a small 1×1 grid cell works).
4. Click **Done editing**.

---

## Configuration options

All options are set in the **Properties panel** (right-hand panel in Edit mode).

| Option | Default | Description |
|--------|---------|-------------|
| Button label | `Print / Export PDF` | Text shown on the button. Supports Qlik expressions. |
| Show printer icon | On | Toggle the SVG printer icon beside the label. |
| What to print | Entire sheet | **Entire sheet** hides Qlik chrome and prints all visible objects. **This object only** hides everything except the visualization containing this button. |
| Page orientation | Landscape | Sent as a CSS `@page` hint to the browser. |
| Colour mode | Full colour | **Grayscale** applies a CSS filter — useful for monochrome printers. |
| Hide button when printing | Yes | Prevents the print button itself from appearing in the printed output. |

---

## How it works

When the button is clicked the extension:

1. Injects a temporary `<style>` tag with `@media print` rules that hide Qlik's header, toolbar, navigation, side panel, and any other chrome.
2. Calls `window.print()` to open the system print dialog.
3. Listens for the `afterprint` event (fires when the dialog is dismissed) and removes the injected style, restoring the page exactly as before.

No data leaves the browser. The PDF is generated entirely by the browser's built-in print-to-PDF engine.

---

## File structure

```
QLik_Extension_Printer/
├── QLik_Extension_Printer.qext   ← QMC reads this to validate the extension
├── QLik_Extension_Printer.js     ← AMD module (RequireJS), main logic
├── QLik_Extension_Printer.css    ← Button styles + print media rules
├── README.md
└── CLAUDE.md
```

---

## Compatibility

| Platform | Supported |
|----------|-----------|
| Qlik Sense Enterprise (QSE) on Windows | Yes |
| Qlik Sense Enterprise on Kubernetes | Yes |
| Qlik Sense Desktop | Yes |
| QlikView | No — different extension model |

Tested on Chrome, Edge, and Firefox. Safari's print dialog has limited CSS `@page` support; orientation hints may be ignored.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "The zip file did not contain any valid extension" | The archive is missing `QLik_Extension_Printer.qext` at the root, or the file contains invalid JSON. Re-zip the individual files, not the folder. |
| Button doesn't appear in the Extensions panel | Reload QMC and re-import. Check the browser console for AMD load errors. |
| Print output includes Qlik toolbars | Your QSE version uses different CSS class names. Inspect the element and add the selectors to the `hideSelectors` list in `QLik_Extension_Printer.js`. |
| Grayscale mode not working | Some browsers ignore CSS filters in print. Use the printer driver's own grayscale setting instead. |

---

## License

MIT
