/**
 * QLik_Extension_Printer.js
 *
 * Qlik Sense Visualization Extension — Print Control Panel
 *
 * All print options (sheet selection, paper size, orientation, scale,
 * colour mode, zone) are rendered directly inside the extension widget.
 * No property panel navigation required for end users.
 *
 * UX flow:
 *   1. User sets options in the widget panel (selections persist in memory).
 *   2. User clicks "Imprimer" → print dialog opens immediately.
 *   3. For multi-sheet: user clicks the "Plusieurs feuilles" card, a picker
 *      modal opens, they select sheets, confirm, then click "Imprimer".
 *
 * AMD module — loaded by Qlik's RequireJS runtime.
 */

define(['qlik', 'jquery'], function (qlik, $) {
  'use strict';

  // ─── Per-instance UI state (survives paint() re-renders) ─────────────────

  var _uiState = {};

  function _getState (qId, props) {
    if (!_uiState[qId]) {
      _uiState[qId] = {
        sheetMode:      'current',          // 'current' | 'selected'
        selectedSheets: [],                 // [{id, title}]
        paperSize:      props.paperSize    || 'A4',
        orientation:    props.orientation  || 'landscape',
        printScale:     props.printScale   || '100',
        colorMode:      props.colorMode    || 'color',
        target:         props.printTarget  || 'sheet',
        hideSelf:       props.hideSelf     !== false
      };
    }
    return _uiState[qId];
  }

  // ─── Property panel definition (minimal — options live in the widget) ────

  var definition = {
    type: 'items',
    component: 'accordion',
    items: {
      appearance: {
        uses: 'settings',
        items: {

          buttonLabel: {
            ref:          'props.buttonLabel',
            label:        'Print button label',
            type:         'string',
            defaultValue: 'Imprimer',
            expression:   'optional'
          },

          buttonIcon: {
            ref:          'props.buttonIcon',
            label:        'Show printer icon on button',
            type:         'boolean',
            defaultValue: true,
            component:    'switch',
            options: [
              { value: true,  label: 'Yes' },
              { value: false, label: 'No'  }
            ]
          },

          // ── Default values (pre-fill the widget UI) ─────────────────

          printTarget: {
            ref:          'props.printTarget',
            label:        'Default zone',
            type:         'string',
            component:    'radiobuttons',
            defaultValue: 'sheet',
            options: [
              { value: 'sheet',    label: 'Entire sheet'         },
              { value: 'viewport', label: 'Visible area (écran)' }
            ]
          },

          paperSize: {
            ref:          'props.paperSize',
            label:        'Default paper size',
            type:         'string',
            component:    'dropdown',
            defaultValue: 'A4',
            options: [
              { value: 'A4',     label: 'A4  (210 × 297 mm)'   },
              { value: 'A3',     label: 'A3  (297 × 420 mm)'   },
              { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
              { value: 'Legal',  label: 'Legal  (8.5 × 14 in)' }
            ]
          },

          orientation: {
            ref:          'props.orientation',
            label:        'Default orientation',
            type:         'string',
            component:    'radiobuttons',
            defaultValue: 'landscape',
            options: [
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait',  label: 'Portrait'  }
            ]
          },

          printScale: {
            ref:          'props.printScale',
            label:        'Default scale',
            type:         'string',
            component:    'radiobuttons',
            defaultValue: '100',
            options: [
              { value: '100', label: '100 %' },
              { value: '90',  label: '90 %'  },
              { value: '75',  label: '75 %'  },
              { value: '50',  label: '50 %'  }
            ]
          },

          colorMode: {
            ref:          'props.colorMode',
            label:        'Default colour mode',
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
            label:        'Hide widget when printing',
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

  var initialProperties = {
    qHyperCubeDef: { qDimensions: [], qMeasures: [], qInitialDataFetch: [] }
  };

  // ─── Extension object ────────────────────────────────────────────────────

  return {

    definition:        definition,
    initialProperties: initialProperties,
    support: { snapshot: false, export: false, exportData: false },

    paint: function ($element, layout) {
      var self    = this;
      var props   = layout.props || {};
      var qId     = layout.qInfo.qId;
      var state   = _getState(qId, props);
      var label   = props.buttonLabel || 'Imprimer';
      var showIco = props.buttonIcon  !== false;
      var app     = qlik.currApp(self);

      _renderPanel($element, state, label, showIco);
      _bindEvents($element, state, qId, app, label, showIco);

      return qlik.Promise.resolve();
    }

  }; // end return


  // ─── Panel rendering ──────────────────────────────────────────────────────

  var _PRINTER_ICO =
    '<svg class="qep-ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6' +
      'c0-1.66-1.34-3-3-3zM16 19H8v-5h8v5zm1-11H7V4h10v4z"/>' +
    '</svg>';

  var _PAGES_ICO =
    '<svg class="qep-ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 6h16v2H4zm2-4h12v2H6zm14 8H4c-1.1 0-2 .9-2 2v8h4v-4h12v4h4v-8' +
      'c0-1.1-.9-2-2-2zm-2 6H6v-4h12v4z" opacity=".3"/>' +
      '<path d="M4 14h16v2H4zm16-6H4c-1.1 0-2 .9-2 2v8h4v-4h12v4h4v-8c0-1.1-.9-2-2-2z"/>' +
    '</svg>';

  var _SCREEN_ICO =
    '<svg class="qep-ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v2h12v-2l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>' +
    '</svg>';

  var _SHEET_ICO =
    '<svg class="qep-ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z' +
      'M16 18H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>' +
    '</svg>';

  /**
   * Builds the full control-panel HTML and injects it into $element.
   */
  function _renderPanel ($element, state, label, showIco) {
    var ss = state.selectedSheets || [];
    var hasSelection = state.sheetMode === 'selected' && ss.length > 0;

    // Sheet tags (preview of selected sheets)
    var tagsHtml = '';
    if (hasSelection) {
      tagsHtml = '<div class="qep-tags">';
      ss.slice(0, 5).forEach(function (s) {
        tagsHtml += '<span class="qep-tag">' + _escapeHtml(s.title) + '</span>';
      });
      if (ss.length > 5) {
        tagsHtml += '<span class="qep-tag qep-tag-more">+' + (ss.length - 5) + '</span>';
      }
      tagsHtml += '</div>';
    }

    var html =
      '<div class="qep-panel">' +

        // ── Section 1: Feuilles ─────────────────────────────────────
        '<div class="qep-section">' +
          '<div class="qep-section-head">Feuilles \u00e0 imprimer</div>' +
          '<div class="qep-mode-grid">' +

            '<button class="qep-mode-card' + (state.sheetMode === 'current' ? ' qep-active' : '') +
                '" data-mode="current">' +
              _SHEET_ICO +
              '<strong>Feuille courante</strong>' +
              '<small>La feuille visible maintenant</small>' +
            '</button>' +

            '<button class="qep-mode-card' + (state.sheetMode === 'selected' ? ' qep-active' : '') +
                '" data-mode="select">' +
              _PAGES_ICO +
              '<strong>Plusieurs feuilles</strong>' +
              (hasSelection
                ? '<small class="qep-count-ok">' + ss.length + ' feuille' + (ss.length > 1 ? 's' : '') + ' choisie' + (ss.length > 1 ? 's' : '') + '</small>'
                : '<small class="qep-count-empty">Cliquer pour choisir</small>') +
            '</button>' +

          '</div>' +
          tagsHtml +
        '</div>' +

        // ── Section 2: Format de sortie ──────────────────────────────
        '<div class="qep-section">' +
          '<div class="qep-section-head">Format de sortie</div>' +
          '<div class="qep-format-grid">' +

            '<div class="qep-field">' +
              '<label class="qep-field-lbl">Taille</label>' +
              '<select class="qep-select" data-key="paperSize">' +
                _opt('A4',     'A4',       state.paperSize) +
                _opt('A3',     'A3',       state.paperSize) +
                _opt('Letter', 'Letter',   state.paperSize) +
                _opt('Legal',  'Legal',    state.paperSize) +
              '</select>' +
            '</div>' +

            '<div class="qep-field">' +
              '<label class="qep-field-lbl">Orientation</label>' +
              '<select class="qep-select" data-key="orientation">' +
                _opt('landscape', 'Paysage \u2194', state.orientation) +
                _opt('portrait',  'Portrait \u2195', state.orientation) +
              '</select>' +
            '</div>' +

            '<div class="qep-field">' +
              '<label class="qep-field-lbl">\u00c9chelle</label>' +
              '<select class="qep-select" data-key="printScale">' +
                _opt('100', '100 %', state.printScale) +
                _opt('90',  '90 %',  state.printScale) +
                _opt('75',  '75 %',  state.printScale) +
                _opt('50',  '50 %',  state.printScale) +
              '</select>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // ── Section 3: Options ───────────────────────────────────────
        '<div class="qep-section">' +
          '<div class="qep-section-head">Options</div>' +

          '<div class="qep-opt-row">' +
            '<span class="qep-opt-lbl">Rendu</span>' +
            '<div class="qep-seg" data-key="colorMode">' +
              '<button class="qep-seg-btn' + (state.colorMode === 'color' ? ' qep-seg-on' : '') + '" data-val="color">Couleur</button>' +
              '<button class="qep-seg-btn' + (state.colorMode === 'grayscale' ? ' qep-seg-on' : '') + '" data-val="grayscale">Niveaux de gris</button>' +
            '</div>' +
          '</div>' +

          '<div class="qep-opt-row">' +
            '<span class="qep-opt-lbl">Zone</span>' +
            '<div class="qep-seg" data-key="target">' +
              '<button class="qep-seg-btn' + (state.target === 'sheet' ? ' qep-seg-on' : '') + '" data-val="sheet">' +
                _SHEET_ICO + '<span>Feuille enti\u00e8re</span>' +
              '</button>' +
              '<button class="qep-seg-btn' + (state.target === 'viewport' ? ' qep-seg-on' : '') + '" data-val="viewport">' +
                _SCREEN_ICO + '<span>Vue \u00e9cran</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

        '</div>' +

        // ── Print CTA ────────────────────────────────────────────────
        '<div class="qep-cta">' +
          '<button class="qep-cta-btn" ' +
              (state.sheetMode === 'selected' && !hasSelection ? 'disabled' : '') + '>' +
            (showIco ? _PRINTER_ICO : '') +
            '<span class="qep-cta-label">' +
              (state.sheetMode === 'selected' && !hasSelection
                ? 'Choisissez des feuilles\u2026'
                : _escapeHtml(label) +
                  (hasSelection ? ' (' + ss.length + ')' : '')) +
            '</span>' +
          '</button>' +
        '</div>' +

      '</div>'; // .qep-panel

    $element.empty().append(html);
  }

  /** Helper: build an <option> tag with selected flag. */
  function _opt (val, txt, current) {
    return '<option value="' + _escapeHtml(val) + '"' +
      (val === current ? ' selected' : '') + '>' +
      _escapeHtml(txt) + '</option>';
  }


  // ─── Event binding ────────────────────────────────────────────────────────

  function _bindEvents ($el, state, qId, app, label, showIco) {

    var $panel = $el.find('.qep-panel');

    // ── Mode cards: current / select ────────────────────────────────
    $panel.on('click', '.qep-mode-card', function () {
      var mode = $(this).data('mode');

      if (mode === 'select') {
        // Open the sheet picker — on confirm, switch to 'selected' mode
        _openSheetPicker(app, state, function (sheets) {
          state.selectedSheets = sheets;
          state.sheetMode = sheets.length ? 'selected' : 'current';
          _uiState[qId] = state;
          _renderPanel($el, state, label, showIco);
          _bindEvents($el, state, qId, app, label, showIco);
        });
      } else {
        state.sheetMode = 'current';
        _uiState[qId] = state;
        _renderPanel($el, state, label, showIco);
        _bindEvents($el, state, qId, app, label, showIco);
      }
    });

    // ── Selects (paperSize / orientation / printScale) ───────────────
    $panel.on('change', '.qep-select', function () {
      var key = $(this).data('key');
      var val = $(this).val();
      state[key] = val;
      _uiState[qId] = state;
      // Update CTA if needed (no full re-render required)
    });

    // ── Segmented controls (colorMode / target) ──────────────────────
    $panel.on('click', '.qep-seg-btn', function () {
      var $seg = $(this).closest('.qep-seg');
      var key  = $seg.data('key');
      var val  = $(this).data('val');
      state[key] = val;
      _uiState[qId] = state;
      $seg.find('.qep-seg-btn').removeClass('qep-seg-on');
      $(this).addClass('qep-seg-on');
    });

    // ── Print CTA ────────────────────────────────────────────────────
    $panel.on('click', '.qep-cta-btn:not([disabled])', function () {
      // Read live values from selects (may have changed without triggering paint)
      $panel.find('.qep-select').each(function () {
        var key = $(this).data('key');
        if (key) { state[key] = $(this).val(); }
      });

      var printOpts = {
        target:      state.target,
        orientation: state.orientation,
        paperSize:   state.paperSize,
        printScale:  state.printScale,
        colorMode:   state.colorMode,
        hideSelf:    state.hideSelf,
        $container:  $el
      };

      if (state.sheetMode === 'selected' && state.selectedSheets.length) {
        _printSheetsSequentially(
          state.selectedSheets.map(function (s) { return s.id; }),
          printOpts
        );
      } else {
        _triggerPrint(printOpts);
      }
    });
  }


  // ─── Sheet picker modal ───────────────────────────────────────────────────

  /**
   * Opens a modal where the user picks one or several sheets.
   * Calls onConfirm(selectedSheets) with the confirmed selection.
   * Does NOT trigger printing — that's the user's next step.
   *
   * @param {object}   app        — qlik.currApp(self)
   * @param {object}   state      — current UI state (for pre-checking existing selection)
   * @param {Function} onConfirm  — fn([{id, title}])
   */
  function _openSheetPicker (app, state, onConfirm) {
    $('#qep-overlay').remove();

    var $ov = $(
      '<div id="qep-overlay" class="qep-overlay" role="dialog" aria-modal="true"' +
          ' aria-labelledby="qep-dlg-title">' +
        '<div class="qep-dlg">' +
          '<div class="qep-dlg-head">' +
            '<h3 class="qep-dlg-title" id="qep-dlg-title">' +
              'S\u00e9lectionner les feuilles' +
            '</h3>' +
            '<button class="qep-dlg-close" type="button" aria-label="Fermer">\u2715</button>' +
          '</div>' +

          '<div class="qep-dlg-search">' +
            '<input type="text" class="qep-search-input" placeholder="Rechercher une feuille\u2026" autocomplete="off">' +
          '</div>' +

          '<div class="qep-dlg-body qep-dlg-loading">' +
            '<div class="qep-spinner"></div>' +
            '<span>Chargement\u2026</span>' +
          '</div>' +

          '<div class="qep-dlg-foot" style="display:none;">' +
            '<div class="qep-dlg-foot-left">' +
              '<button class="qep-ghost-btn qep-dlg-all"  type="button">Tout s\u00e9lectionner</button>' +
              '<button class="qep-ghost-btn qep-dlg-none" type="button">Effacer</button>' +
            '</div>' +
            '<div class="qep-dlg-foot-right">' +
              '<button class="qep-ghost-btn qep-dlg-cancel" type="button">Annuler</button>' +
              '<button class="qep-dlg-confirm" type="button" disabled>' +
                'Confirmer (0)' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    $('body').append($ov);

    function close () { $ov.remove(); }

    $ov.on('click', function (e) { if ($(e.target).is('#qep-overlay')) { close(); } });
    $ov.find('.qep-dlg-close, .qep-dlg-cancel').on('click', close);

    // Pre-checked IDs from existing selection
    var preChecked = {};
    (state.selectedSheets || []).forEach(function (s) { preChecked[s.id] = true; });

    _loadSheets(app, function (err, sheets) {
      var $body = $ov.find('.qep-dlg-body').removeClass('qep-dlg-loading').empty();
      var $foot = $ov.find('.qep-dlg-foot').show();

      if (err || !sheets || !sheets.length) {
        $body.html(
          '<div class="qep-dlg-err">' +
            (err
              ? 'Impossible de charger les feuilles.<br>' +
                '<small>' + _escapeHtml(String(err.message || err)) + '</small>'
              : 'Aucune feuille trouv\u00e9e.') +
          '</div>'
        );
        $foot.find('.qep-dlg-confirm')
          .text('Fermer')
          .prop('disabled', false)
          .on('click', close);
        return;
      }

      // Render list
      var listHtml = '<ul class="qep-dlg-list">';
      sheets.forEach(function (sheet, i) {
        var checked = preChecked[sheet.id] ? ' checked' : '';
        listHtml +=
          '<li class="qep-dlg-item" data-title="' + _escapeHtml(sheet.title.toLowerCase()) + '">' +
            '<label class="qep-dlg-label">' +
              '<input type="checkbox" class="qep-dlg-chk" value="' +
                _escapeHtml(sheet.id) + '" data-title="' + _escapeHtml(sheet.title) + '"' + checked + '>' +
              '<span class="qep-chk-box"></span>' +
              '<span class="qep-dlg-sheet-title">' + _escapeHtml(sheet.title) + '</span>' +
            '</label>' +
          '</li>';
      });
      listHtml += '</ul>';
      $body.html(listHtml);

      // Search filter
      $ov.find('.qep-search-input').on('input', function () {
        var q = $(this).val().toLowerCase().trim();
        $ov.find('.qep-dlg-item').each(function () {
          var match = !q || $(this).data('title').indexOf(q) !== -1;
          $(this).toggle(match);
        });
      });

      // Confirm button label
      function updateConfirm () {
        var n    = $ov.find('.qep-dlg-chk:checked').length;
        var $btn = $foot.find('.qep-dlg-confirm');
        $btn.prop('disabled', n === 0);
        $btn.text('Confirmer (' + n + ' feuille' + (n > 1 ? 's' : '') + ')');
      }

      $body.on('change', '.qep-dlg-chk', updateConfirm);

      $foot.find('.qep-dlg-all').on('click', function () {
        $ov.find('.qep-dlg-item:visible .qep-dlg-chk').prop('checked', true);
        updateConfirm();
      });
      $foot.find('.qep-dlg-none').on('click', function () {
        $ov.find('.qep-dlg-chk').prop('checked', false);
        updateConfirm();
      });

      $foot.find('.qep-dlg-confirm').on('click', function () {
        var picked = [];
        $ov.find('.qep-dlg-chk:checked').each(function () {
          picked.push({ id: $(this).val(), title: $(this).data('title') });
        });
        close();
        onConfirm(picked);
      });

      updateConfirm();
    });
  }


  // ─── Load sheet list — 3-strategy fallback ───────────────────────────────

  function _loadSheets (app, callback) {
    var enigma = app.model &&
      (app.model.enigmaModel || app.model.engine || app.model.engineApp);

    if (enigma && typeof enigma.createSessionObject === 'function') {
      enigma.createSessionObject({
        qInfo: { qType: 'SheetList' },
        qAppObjectListDef: {
          qType: 'sheet',
          qData: { title: '/qMetaDef/title' }
        }
      })
      .then(function (obj) { return obj.getLayout(); })
      .then(function (layout) {
        var items = (layout.qAppObjectList && layout.qAppObjectList.qItems) || [];
        callback(null, items.map(function (item) {
          return {
            id:    item.qInfo.qId,
            title: (item.qData && item.qData.title) ||
                   (item.qMeta && item.qMeta.title) ||
                   'Sans titre'
          };
        }));
      })
      .catch(function () { _loadSheetsFallback(app, callback); });
      return;
    }
    _loadSheetsFallback(app, callback);
  }

  function _loadSheetsFallback (app, callback) {
    try {
      var result = app.getObjectList('sheet');
      if (result && typeof result.then === 'function') {
        result
          .then(function (model) {
            var items = _safeGet(model, ['layout', 'qAppObjectList', 'qItems']) || [];
            callback(null, _mapSheets(items));
          })
          .catch(function (err) { callback(err, []); });
      } else if (result) {
        var items2 = _safeGet(result, ['layout', 'qAppObjectList', 'qItems']);
        if (items2 && items2.length) {
          callback(null, _mapSheets(items2));
        } else {
          app.getObjectList('sheet', function (model) {
            var it = _safeGet(model, ['layout', 'qAppObjectList', 'qItems']) || [];
            callback(null, _mapSheets(it));
          });
        }
      } else {
        callback(new Error('getObjectList returned nothing'), []);
      }
    } catch (err) { callback(err, []); }
  }

  function _mapSheets (items) {
    return items
      .filter(function (i) { return i && i.qInfo && i.qInfo.qId; })
      .map(function (i) {
        return {
          id:    i.qInfo.qId,
          title: (i.qMeta && i.qMeta.title) || (i.qData && i.qData.title) || 'Sans titre'
        };
      });
  }


  // ─── Sequential multi-sheet printing ─────────────────────────────────────

  function _printSheetsSequentially (sheetIds, opts) {
    if (!sheetIds || !sheetIds.length) { _triggerPrint(opts); return; }

    var index = 0;
    var nav   = qlik.navigation;

    function printNext () {
      if (index >= sheetIds.length) { return; }
      var id = sheetIds[index++];
      if (nav && typeof nav.gotoSheet === 'function') { nav.gotoSheet(id); }
      setTimeout(function () {
        var cleanup = function () {
          window.removeEventListener('afterprint', cleanup);
          if (index < sheetIds.length) { setTimeout(printNext, 800); }
        };
        window.addEventListener('afterprint', cleanup);
        _triggerPrint(opts);
      }, 3000);
    }
    printNext();
  }


  // ─── Core print logic ─────────────────────────────────────────────────────

  function _triggerPrint (opts) {
    var STYLE_ID = 'qep-print-style';
    $('#' + STYLE_ID).remove();

    var chrome = [
      '.qv-header', '.qv-toolbar', '.qv-footer', '.qv-side-panel',
      '.qs-toolbar', '.qs-navigation', '.navigation-bar',
      'header', 'nav', '#hub-header', '#sn-ui-blockers',
      '.sheet-interaction-overlay'
    ].join(',');

    var scale      = String(opts.printScale || '100').replace(/[^0-9]/g, '');
    var scaleRule  = scale !== '100' ? 'html { zoom: ' + scale + '% !important; }' : '';
    var paperSize  = opts.paperSize || 'A4';
    var pageMargin = '10mm';
    var hideRule   = '';
    var targetRule = '';

    if (opts.target === 'viewport') {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      hideRule   = chrome + ' { display: none !important; }';
      pageMargin = '0';
      targetRule = [
        'html, body { width: ' + vw + 'px !important; height: ' + vh + 'px !important; overflow: hidden !important; }',
        '.qv-canvas, .qv-sheet-container, .qv-stage { max-width: ' + vw + 'px !important; max-height: ' + vh + 'px !important; overflow: hidden !important; }',
        '::-webkit-scrollbar { display: none !important; }'
      ].join('\n');
    } else {
      hideRule = chrome + ' { display: none !important; }';
    }

    var css = [
      '@media print {',
      '  @page { size: ' + paperSize + ' ' + opts.orientation + '; margin: ' + pageMargin + '; }',
      hideRule   ? ('  ' + hideRule)   : '',
      targetRule ? ('  ' + targetRule) : '',
      scaleRule  ? ('  ' + scaleRule)  : '',
      '  *, img, canvas, svg { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
      opts.colorMode === 'grayscale'
        ? '  * { -webkit-filter: grayscale(100%) !important; filter: grayscale(100%) !important; }' : '',
      opts.hideSelf ? '  .qep-panel { display: none !important; }' : '',
      '  html, body { background: white !important; }',
      '  .qv-inner-object, .qv-viz { box-shadow: none !important; border: none !important; }',
      '  img, canvas { image-rendering: high-quality !important; }',
      '}'
    ].filter(Boolean).join('\n');

    $('<style>', { id: STYLE_ID, type: 'text/css' }).text(css).appendTo('head');

    var cleanup = function () {
      $('#' + STYLE_ID).remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }


  // ─── Utilities ───────────────────────────────────────────────────────────

  function _escapeHtml (str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _safeGet (obj, keys) {
    return keys.reduce(function (o, k) {
      return o && typeof o === 'object' ? o[k] : undefined;
    }, obj);
  }

}); // end define
