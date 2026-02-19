/**
 * QLik_Extension_Printer.js
 *
 * Qlik Sense Visualization Extension — Sheet / Object Printer
 *
 * Renders a configurable print button inside a Qlik Sense visualization panel.
 * When clicked the button:
 *   1. Hides every element on the page EXCEPT the current Qlik sheet wrapper.
 *   2. Calls window.print() so the browser print dialog opens with a clean,
 *      sheet-only layout (landscape by default, matching Qlik's own print output).
 *   3. Restores the page to its normal state immediately after the dialog closes.
 *
 * No server-side component required.  Works in both QlikSense Enterprise (QSE)
 * and QlikSense on Windows (QAP).
 *
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
              { value: 'sheet',  label: 'Entire sheet'     },
              { value: 'object', label: 'This object only' }
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
              { value: 'color',       label: 'Full colour'  },
              { value: 'grayscale',   label: 'Grayscale'    }
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

    definition:         definition,
    initialProperties:  initialProperties,
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

      var props = layout.props || {};
      var label       = props.buttonLabel       || 'Print / Export PDF';
      var showIcon    = props.buttonIcon        !== false;
      var target      = props.printTarget       || 'sheet';
      var orientation = props.orientation       || 'landscape';
      var colorMode   = props.colorMode         || 'color';
      var hideSelf    = props.hideSelf          !== false;

      // ── Render the button ──────────────────────────────────────────────

      var iconHtml = showIcon
        ? '<svg class="qep-icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3z' +
            'M16 19H8v-5h8v5zm1-11H7V4h10v4z"/>' +
          '</svg>'
        : '';

      $element.empty().append(
        '<div class="qep-wrapper">' +
          '<button class="qep-btn" type="button">' +
            iconHtml +
            '<span class="qep-label">' + _escapeHtml(label) + '</span>' +
          '</button>' +
        '</div>'
      );

      // ── Wire up click handler ──────────────────────────────────────────

      var self = this;
      $element.find('.qep-btn').on('click', function () {
        _triggerPrint({
          target:      target,
          orientation: orientation,
          colorMode:   colorMode,
          hideSelf:    hideSelf,
          $container:  $element
        });
      });

      return qlik.Promise.resolve();
    }

  }; // end return

  // ─── Print logic ─────────────────────────────────────────────────────────

  /**
   * Inject a temporary <style> tag that tells the browser what to show
   * or hide during printing, then opens the system print dialog.
   * Cleans up after the dialog closes.
   *
   * @param {object} opts
   */
  function _triggerPrint (opts) {
    var STYLE_ID = 'qep-print-style';

    // Remove any leftover style from a previous (failed) print
    $('#' + STYLE_ID).remove();

    var grayscale = opts.colorMode === 'grayscale'
      ? '*{ -webkit-filter:grayscale(100%); filter:grayscale(100%); }'
      : '';

    var hideSelectors;

    if (opts.target === 'sheet') {
      // Show the entire Qlik sheet; hide chrome, nav, toolbar, etc.
      hideSelectors = [
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

    } else {
      // "This object only" — hide everything on the page, then reveal
      // the Qlik object that owns the extension button.
      hideSelectors = 'body > *';
    }

    // Self-hiding: remove the print button element itself from print output
    var selfRule = opts.hideSelf
      ? '.qep-wrapper { display:none !important; }'
      : '';

    // Build the print stylesheet
    var css = [
      '@media print {',
      '  @page { size: A4 ' + opts.orientation + '; margin: 10mm; }',
      '  ' + hideSelectors + ' { display:none !important; }',
      grayscale,
      selfRule,

      // If printing one object, un-hide just the Qlik grid cell that contains us.
      // Qlik wraps each object in a <div class="qv-gridcell"> or similar.
      opts.target === 'object'
        ? '  .qep-print-target { display:block !important; }'
        : '',

      // General print hygiene
      '  html, body { background:white !important; }',
      '  .qv-inner-object, .qv-viz { box-shadow:none !important; border:none !important; }',
      '}'
    ].join('\n');

    var $style = $('<style>', { id: STYLE_ID, type: 'text/css' }).text(css);
    $('head').append($style);

    // If printing only this object, mark its ancestor grid cell
    var $ancestor = null;
    if (opts.target === 'object') {
      $ancestor = opts.$container
        .closest('.qv-gridcell, .qv-object, .qs-object-container, [class*="gridcell"]');
      if ($ancestor.length) {
        $ancestor.addClass('qep-print-target');
      }
    }

    // Open the browser print dialog
    // afterprint fires when the dialog is dismissed (print or cancel)
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

  // ─── Utility ─────────────────────────────────────────────────────────────

  function _escapeHtml (str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

}); // end define
