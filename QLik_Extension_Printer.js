/**
 * QLik_Extension_Printer.js
 *
 * Qlik Sense Visualization Extension — Sheet / Object Printer
 *
 * Features:
 *   - Print the current sheet, a visible viewport area, or a single object.
 *   - "Select sheets" picker: choose one or several published sheets and print
 *     them sequentially (navigates to each, waits for render, then prints).
 *   - "Viewport" mode: prints exactly what is visible on screen (no scroll).
 *
 * No server-side component required. Works in QSE and QAP.
 * AMD module — loaded by Qlik's RequireJS runtime.
 */

define(['qlik', 'jquery'], function (qlik, $) {
  'use strict';

  // ─── Property panel definition ──────────────────────────────────────────

  var definition = {
    type: 'items',
    component: 'accordion',
    items: {

      appearance: {
        uses: 'settings',
        items: {

          buttonLabel: {
            ref:          'props.buttonLabel',
            label:        'Button label',
            type:         'string',
            defaultValue: 'Print / Export PDF',
            expression:   'optional'
          },

          buttonIcon: {
            ref:          'props.buttonIcon',
            label:        'Show printer icon',
            type:         'boolean',
            defaultValue: true,
            component:    'switch',
            options: [
              { value: true,  label: 'On'  },
              { value: false, label: 'Off' }
            ]
          },

          printTarget: {
            ref:          'props.printTarget',
            label:        'What to print',
            type:         'string',
            component:    'radiobuttons',
            defaultValue: 'sheet',
            options: [
              { value: 'sheet',    label: 'Entire sheet'         },
              { value: 'viewport', label: 'Visible area (écran)' },
              { value: 'object',   label: 'This object only'     }
            ]
          },

          orientation: {
            ref:          'props.orientation',
            label:        'Page orientation',
            type:         'string',
            component:    'radiobuttons',
            defaultValue: 'landscape',
            options: [
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait',  label: 'Portrait'  }
            ]
          },

          colorMode: {
            ref:          'props.colorMode',
            label:        'Colour mode',
            type:         'string',
            component:    'radiobuttons',
            defaultValue: 'color',
            options: [
              { value: 'color',     label: 'Full colour' },
              { value: 'grayscale', label: 'Grayscale'   }
            ]
          },

          hideExtensionOnPrint: {
            ref:          'props.hideSelf',
            label:        'Hide this button when printing',
            type:         'boolean',
            defaultValue: true,
            component:    'switch',
            options: [
              { value: true,  label: 'Yes' },
              { value: false, label: 'No'  }
            ]
          },

          showSheetSelector: {
            ref:          'props.showSheetSelector',
            label:        'Show "Select sheets" button',
            type:         'boolean',
            defaultValue: true,
            component:    'switch',
            options: [
              { value: true,  label: 'Yes' },
              { value: false, label: 'No'  }
            ]
          }

        }
      }
    }
  };

  // ─── Initial / default layout properties ────────────────────────────────

  var initialProperties = {
    qHyperCubeDef: {
      qDimensions: [],
      qMeasures:   [],
      qInitialDataFetch: []
    }
  };

  // ─── Extension object ────────────────────────────────────────────────────

  return {

    definition:        definition,
    initialProperties: initialProperties,
    support: {
      snapshot:   false,
      export:     false,
      exportData: false
    },

    /**
     * paint() is called every time the extension needs to re-render.
     *
     * @param {jQuery}  $element  — the container element managed by Qlik
     * @param {object}  layout    — the current layout / properties snapshot
     */
    paint: function ($element, layout) {

      var self         = this;
      var props        = layout.props || {};
      var label        = props.buttonLabel        || 'Print / Export PDF';
      var showIcon     = props.buttonIcon         !== false;
      var target       = props.printTarget        || 'sheet';
      var orientation  = props.orientation        || 'landscape';
      var colorMode    = props.colorMode          || 'color';
      var hideSelf     = props.hideSelf           !== false;
      var showSelector = props.showSheetSelector  !== false;

      // ── Icon SVGs ──────────────────────────────────────────────────────

      var printerIconHtml = showIcon
        ? '<svg class="qep-icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3z' +
            'M16 19H8v-5h8v5zm1-11H7V4h10v4z"/>' +
          '</svg>'
        : '';

      var sheetsIconHtml =
        '<svg class="qep-icon" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M3 4h18v2H3zm0 5h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>' +
        '</svg>';

      var selectorBtnHtml = showSelector
        ? '<button class="qep-btn qep-btn-secondary" type="button"' +
            ' title="Sélectionner une ou plusieurs feuilles à imprimer">' +
            sheetsIconHtml +
            '<span class="qep-label">Sélectionner des feuilles\u2026</span>' +
          '</button>'
        : '';

      // ── Render ────────────────────────────────────────────────────────

      $element.empty().append(
        '<div class="qep-wrapper' + (showSelector ? ' qep-has-selector' : '') + '">' +
          '<button class="qep-btn qep-btn-primary" type="button">' +
            printerIconHtml +
            '<span class="qep-label">' + _escapeHtml(label) + '</span>' +
          '</button>' +
          selectorBtnHtml +
        '</div>'
      );

      // ── Wire up handlers ──────────────────────────────────────────────

      var printOpts = {
        target:      target,
        orientation: orientation,
        colorMode:   colorMode,
        hideSelf:    hideSelf,
        $container:  $element
      };

      // Primary: print current view
      $element.find('.qep-btn-primary').on('click', function () {
        _triggerPrint(printOpts);
      });

      // Secondary: open sheet picker
      if (showSelector) {
        $element.find('.qep-btn-secondary').on('click', function () {
          _openSheetPicker(qlik.currApp(self), printOpts);
        });
      }

      return qlik.Promise.resolve();
    }

  }; // end return


  // ─── Sheet picker ─────────────────────────────────────────────────────────

  /**
   * Opens a modal listing all available sheets with checkboxes.
   * User can select one or many sheets then trigger sequential printing.
   *
   * @param {object} app       — Qlik app object from qlik.currApp()
   * @param {object} printOpts — print options to pass to _triggerPrint()
   */
  function _openSheetPicker (app, printOpts) {
    // Remove any previously open picker
    $('#qep-overlay').remove();

    // Build skeleton with loading state
    var $overlay = $(
      '<div id="qep-overlay" class="qep-overlay" role="dialog" aria-modal="true"' +
          ' aria-labelledby="qep-modal-title">' +
        '<div class="qep-modal">' +
          '<div class="qep-modal-header">' +
            '<h3 class="qep-modal-title" id="qep-modal-title">' +
              'Sélectionner les feuilles à imprimer' +
            '</h3>' +
            '<button class="qep-close-btn" type="button" aria-label="Fermer">\u2715</button>' +
          '</div>' +
          '<div class="qep-modal-body qep-loading">Chargement des feuilles\u2026</div>' +
          '<div class="qep-modal-footer" style="display:none;">' +
            '<button class="qep-footer-btn qep-select-all" type="button">Tout sélectionner</button>' +
            '<button class="qep-footer-btn qep-clear-all"  type="button">Effacer</button>' +
            '<span class="qep-footer-spacer"></span>' +
            '<button class="qep-footer-btn qep-cancel-btn" type="button">Annuler</button>' +
            '<button class="qep-footer-btn qep-print-btn"  type="button" disabled>' +
              'Imprimer (0)' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    $('body').append($overlay);

    // Close helpers
    function closePicker () { $overlay.remove(); }

    $overlay.on('click', function (e) {
      if ($(e.target).is('#qep-overlay')) { closePicker(); }
    });
    $overlay.find('.qep-close-btn, .qep-cancel-btn').on('click', closePicker);

    // Load sheets then render list
    _loadSheets(app, function (err, sheets) {
      if (err || !sheets.length) {
        $overlay.find('.qep-modal-body')
          .removeClass('qep-loading')
          .html(
            '<div class="qep-picker-error">' +
              (err
                ? 'Impossible de charger la liste des feuilles.<br>' +
                  'Seule la feuille courante sera imprimée.'
                : 'Aucune feuille trouvée dans cette application.') +
            '</div>'
          );
        $overlay.find('.qep-modal-footer').show();
        $overlay.find('.qep-print-btn')
          .text('Imprimer la feuille courante')
          .prop('disabled', false)
          .on('click', function () {
            closePicker();
            _triggerPrint(printOpts);
          });
        return;
      }

      _renderSheetList($overlay, sheets, printOpts, closePicker);
    });
  }

  /**
   * Populates the modal body with a checkbox list of sheets
   * and wires the footer action buttons.
   */
  function _renderSheetList ($overlay, sheets, printOpts, closePicker) {
    var $body   = $overlay.find('.qep-modal-body').removeClass('qep-loading').empty();
    var $footer = $overlay.find('.qep-modal-footer').show();

    // Build checkbox list
    var html = '<ul class="qep-sheet-list">';
    sheets.forEach(function (sheet, i) {
      html +=
        '<li class="qep-sheet-item">' +
          '<label class="qep-sheet-label">' +
            '<input type="checkbox" class="qep-sheet-check"' +
              ' value="' + _escapeHtml(sheet.id) + '" data-idx="' + i + '">' +
            '<span class="qep-sheet-title">' + _escapeHtml(sheet.title) + '</span>' +
          '</label>' +
        '</li>';
    });
    html += '</ul>';
    $body.html(html);

    // Update the Print button label to reflect current selection count
    function updatePrintBtn () {
      var count = $overlay.find('.qep-sheet-check:checked').length;
      var $btn  = $footer.find('.qep-print-btn');
      $btn.prop('disabled', count === 0);
      $btn.text('Imprimer (' + count + ' feuille' + (count > 1 ? 's' : '') + ')');
    }

    $body.on('change', '.qep-sheet-check', updatePrintBtn);

    $footer.find('.qep-select-all').on('click', function () {
      $overlay.find('.qep-sheet-check').prop('checked', true);
      updatePrintBtn();
    });

    $footer.find('.qep-clear-all').on('click', function () {
      $overlay.find('.qep-sheet-check').prop('checked', false);
      updatePrintBtn();
    });

    $footer.find('.qep-print-btn').on('click', function () {
      var selectedIds = [];
      $overlay.find('.qep-sheet-check:checked').each(function () {
        selectedIds.push($(this).val());
      });
      closePicker();
      _printSheetsSequentially(selectedIds, printOpts);
    });

    updatePrintBtn();
  }


  // ─── Load sheet list via Qlik Capabilities API ───────────────────────────

  /**
   * Fetches the list of sheets from the current Qlik app.
   * Supports both promise-style (Qlik Sense ≥ 3.x) and callback-style APIs.
   *
   * @param {object}   app       — qlik.currApp() result
   * @param {Function} callback  — fn(err, sheets[]) where sheet = { id, title }
   */
  function _loadSheets (app, callback) {
    try {
      var result = app.getObjectList('sheet');

      if (result && typeof result.then === 'function') {
        // Promise-style (modern Qlik Sense)
        result.then(function (model) {
          var items = _safeGet(model, ['layout', 'qAppObjectList', 'qItems']) || [];
          callback(null, _mapSheets(items));
        }).catch(function (err) {
          callback(err, []);
        });
      } else {
        // Callback-style fallback
        app.getObjectList('sheet', function (model) {
          var items = _safeGet(model, ['layout', 'qAppObjectList', 'qItems']) || [];
          callback(null, _mapSheets(items));
        });
      }
    } catch (err) {
      callback(err, []);
    }
  }

  /** Maps raw Qlik sheet objects to { id, title } */
  function _mapSheets (items) {
    return items
      .filter(function (item) { return item && item.qInfo && item.qInfo.qId; })
      .map(function (item) {
        return {
          id:    item.qInfo.qId,
          title: (item.qMeta && item.qMeta.title) || 'Sans titre'
        };
      });
  }


  // ─── Sequential multi-sheet printing ─────────────────────────────────────

  /**
   * Navigates to each sheet in order, waits for Qlik to render it, prints,
   * then moves to the next one.  Falls back to printing the current sheet
   * if the array is empty or navigation is unavailable.
   *
   * @param {string[]} sheetIds  — ordered array of Qlik sheet IDs
   * @param {object}   opts      — same options as _triggerPrint()
   */
  function _printSheetsSequentially (sheetIds, opts) {
    if (!sheetIds || sheetIds.length === 0) {
      _triggerPrint(opts);
      return;
    }

    var index = 0;
    var nav   = qlik.navigation;

    function printNext () {
      if (index >= sheetIds.length) { return; }

      var sheetId = sheetIds[index++];

      // Navigate to the chosen sheet
      if (nav && typeof nav.gotoSheet === 'function') {
        nav.gotoSheet(sheetId);
      }

      // Allow Qlik ~3 s to finish rendering before opening the print dialog
      setTimeout(function () {
        var cleanup = function () {
          window.removeEventListener('afterprint', cleanup);
          // Brief pause before navigating to the next sheet
          if (index < sheetIds.length) {
            setTimeout(printNext, 800);
          }
        };
        window.addEventListener('afterprint', cleanup);
        _triggerPrint(opts);
      }, 3000);
    }

    printNext();
  }


  // ─── Core print logic ─────────────────────────────────────────────────────

  /**
   * Injects a temporary <style> tag with @media print rules that produce a
   * clean output matching the chosen target, orientation, and colour mode.
   * Cleans up automatically after the print dialog is dismissed.
   *
   * Supports three targets:
   *   'sheet'    — full Qlik sheet, chrome hidden
   *   'viewport' — exactly what is visible on screen (no scroll artifacts)
   *   'object'   — only the Qlik grid cell containing this extension
   *
   * @param {object} opts
   * @param {string}  opts.target       'sheet' | 'viewport' | 'object'
   * @param {string}  opts.orientation  'landscape' | 'portrait'
   * @param {string}  opts.colorMode    'color' | 'grayscale'
   * @param {boolean} opts.hideSelf
   * @param {jQuery}  opts.$container
   */
  function _triggerPrint (opts) {
    var STYLE_ID = 'qep-print-style';
    $('#' + STYLE_ID).remove();

    // Common chrome selectors to hide on every sheet / viewport print
    var chromeSelectors = [
      '.qv-header',
      '.qv-toolbar',
      '.qv-footer',
      '.qv-side-panel',
      '.qs-toolbar',
      '.qs-navigation',
      '.navigation-bar',
      'header',
      'nav',
      '#hub-header',
      '#sn-ui-blockers',
      '.sheet-interaction-overlay'
    ].join(',');

    var grayscale = opts.colorMode === 'grayscale'
      ? '* { -webkit-filter: grayscale(100%); filter: grayscale(100%); }'
      : '';

    var selfRule = opts.hideSelf
      ? '.qep-wrapper { display: none !important; }'
      : '';

    var hideRule   = '';
    var targetRule = '';
    var pageMargin = '10mm';

    if (opts.target === 'viewport') {
      // ── Viewport mode ───────────────────────────────────────────────────
      // Reproduce exactly what is visible on screen: capture the current
      // scrolled position and clip the output to window dimensions.
      var vw = window.innerWidth;
      var vh = window.innerHeight;

      hideRule = chromeSelectors + ' { display: none !important; }';
      pageMargin = '0';

      // Freeze the viewport: prevent the browser from reflowing / paginating
      targetRule = [
        'html, body {',
        '  width: '  + vw + 'px !important;',
        '  height: ' + vh + 'px !important;',
        '  overflow: hidden !important;',
        '}',
        // The main Qlik sheet canvas containers — clip to the visible area
        '.qv-canvas, .qv-sheet-container, .qv-stage {',
        '  max-width:  ' + vw + 'px !important;',
        '  max-height: ' + vh + 'px !important;',
        '  overflow: hidden !important;',
        '}',
        // Suppress scroll-bar space so content is not displaced
        '::-webkit-scrollbar { display: none !important; }'
      ].join('\n');

    } else if (opts.target === 'sheet') {
      // ── Full-sheet mode ─────────────────────────────────────────────────
      hideRule = chromeSelectors + ' { display: none !important; }';

    } else {
      // ── Single-object mode ──────────────────────────────────────────────
      hideRule = 'body > * { display: none !important; }';
      targetRule = '.qep-print-target { display: block !important; }';
    }

    var css = [
      '@media print {',
      '  @page { size: A4 ' + opts.orientation + '; margin: ' + pageMargin + '; }',
      hideRule  ? ('  ' + hideRule)  : '',
      targetRule ? ('  ' + targetRule) : '',
      grayscale,
      selfRule,
      '  html, body { background: white !important; }',
      '  .qv-inner-object, .qv-viz { box-shadow: none !important; border: none !important; }',
      '}'
    ].filter(Boolean).join('\n');

    $('<style>', { id: STYLE_ID, type: 'text/css' }).text(css).appendTo('head');

    // Mark the ancestor grid cell for object-only mode
    var $ancestor = null;
    if (opts.target === 'object') {
      $ancestor = opts.$container
        .closest('.qv-gridcell, .qv-object, .qs-object-container, [class*="gridcell"]');
      if ($ancestor.length) {
        $ancestor.addClass('qep-print-target');
      }
    }

    var cleanup = function () {
      $('#' + STYLE_ID).remove();
      if ($ancestor && $ancestor.length) {
        $ancestor.removeClass('qep-print-target');
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    window.print();
  }


  // ─── Utilities ───────────────────────────────────────────────────────────

  function _escapeHtml (str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

  /**
   * Safely traverses a nested object by an array of keys.
   * Returns undefined (not an error) if any key is missing.
   */
  function _safeGet (obj, keys) {
    return keys.reduce(function (o, k) {
      return o && typeof o === 'object' ? o[k] : undefined;
    }, obj);
  }

}); // end define
