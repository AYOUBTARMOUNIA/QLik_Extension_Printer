/**
 * QLik_Extension_Printer.js — v3.0
 *
 * Extension Qlik Sense — Panneau d'impression complet.
 * Toutes les options sont visibles et interactives dans le widget.
 *
 * IMPORTANT (bug fix vs v2): tous les var constants sont déclarés
 * AVANT le return{} pour éviter le code mort (dead code after return).
 * Les fonctions helper sont des function declarations (hoistées).
 */

define(['qlik', 'jquery'], function (qlik, $) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════════
     CONSTANTES — déclarées ici, avant return{}, toujours initialisées
     ══════════════════════════════════════════════════════════════════════════ */

  var I_PRINT =
    '<svg class="qi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3z' +
    'M16 19H8v-5h8v5zm1-11H7V4h10v4z"/></svg>';

  var I_SHEET =
    '<svg class="qi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z' +
    'M16 18H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';

  var I_MULTI =
    '<svg class="qi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2' +
    'h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

  var I_MON =
    '<svg class="qi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v2h12v-2l-1-1h3c1.1 0 2-.9 2-2' +
    'V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/></svg>';

  var I_OK =
    '<svg class="qi qi-sm" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

  var I_SEARCH =
    '<svg class="qi qi-sm" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

  /* ══════════════════════════════════════════════════════════════════════════
     ÉTAT — persistant entre les appels paint() pour chaque instance
     ══════════════════════════════════════════════════════════════════════════ */

  var _st = {}; // keyed by qId

  function getState (qId, props) {
    if (!_st[qId]) {
      _st[qId] = {
        mode:   'current',              // 'current' | 'multi'
        sheets: [],                     // [{id, title}]
        paper:  props.paper  || 'A4',
        orient: props.orient || 'landscape',
        scale:  props.scale  || '100',
        color:  props.color  || 'color',
        zone:   props.zone   || 'sheet',
        hide:   props.hide   !== false
      };
    }
    return _st[qId];
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PANNEAU PROPRIÉTÉS — valeurs par défaut uniquement
     ══════════════════════════════════════════════════════════════════════════ */

  var definition = {
    type: 'items',
    component: 'accordion',
    items: {
      cfg: {
        uses: 'settings',
        items: {
          btnLabel: {
            ref: 'props.btnLabel', label: 'Texte du bouton',
            type: 'string', defaultValue: 'Imprimer', expression: 'optional'
          },
          paper: {
            ref: 'props.paper', label: 'Taille par défaut',
            type: 'string', component: 'dropdown', defaultValue: 'A4',
            options: [
              { value: 'A4',     label: 'A4  (210×297 mm)'   },
              { value: 'A3',     label: 'A3  (297×420 mm)'   },
              { value: 'Letter', label: 'Letter (8.5×11 in)' },
              { value: 'Legal',  label: 'Legal  (8.5×14 in)' }
            ]
          },
          orient: {
            ref: 'props.orient', label: 'Orientation par défaut',
            type: 'string', component: 'radiobuttons', defaultValue: 'landscape',
            options: [
              { value: 'landscape', label: 'Paysage' },
              { value: 'portrait',  label: 'Portrait' }
            ]
          },
          scale: {
            ref: 'props.scale', label: 'Échelle par défaut',
            type: 'string', component: 'radiobuttons', defaultValue: '100',
            options: [
              { value: '100', label: '100 %' },
              { value: '90',  label: '90 %'  },
              { value: '75',  label: '75 %'  },
              { value: '50',  label: '50 %'  }
            ]
          },
          color: {
            ref: 'props.color', label: 'Rendu par défaut',
            type: 'string', component: 'radiobuttons', defaultValue: 'color',
            options: [
              { value: 'color', label: 'Couleur'          },
              { value: 'bw',    label: 'Niveaux de gris'  }
            ]
          },
          zone: {
            ref: 'props.zone', label: 'Zone par défaut',
            type: 'string', component: 'radiobuttons', defaultValue: 'sheet',
            options: [
              { value: 'sheet',  label: 'Feuille entière' },
              { value: 'screen', label: 'Vue écran'       }
            ]
          },
          hide: {
            ref: 'props.hide', label: 'Masquer le widget à l\'impression',
            type: 'boolean', defaultValue: true, component: 'switch',
            options: [{ value: true, label: 'Oui' }, { value: false, label: 'Non' }]
          }
        }
      }
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     EXTENSION — point d'entrée Qlik
     ══════════════════════════════════════════════════════════════════════════ */

  return {
    definition:        definition,
    initialProperties: { qHyperCubeDef: { qDimensions: [], qMeasures: [], qInitialDataFetch: [] } },
    support:           { snapshot: false, export: false, exportData: false },

    paint: function ($el, layout) {
      var self  = this;
      var props = layout.props || {};
      var qId   = layout.qInfo.qId;
      var state = getState(qId, props);
      var label = props.btnLabel || 'Imprimer';
      var app   = qlik.currApp(self);

      render($el, state, label);
      bindEvt($el, state, qId, app, label);

      return qlik.Promise.resolve();
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER — construit le HTML du panneau
     (function declarations → hoistées, accessibles depuis paint() ci-dessus)
     ══════════════════════════════════════════════════════════════════════════ */

  function render ($el, state, label) {
    var sel      = state.sheets || [];
    var isMulti  = state.mode === 'multi';
    var hasSel   = isMulti && sel.length > 0;

    /* ── Tags des feuilles choisies ──────────────────────────────────── */
    var tagsHtml = '';
    if (hasSel) {
      tagsHtml = '<div class="qep-tags">';
      sel.slice(0, 6).forEach(function (s) {
        tagsHtml += '<span class="qep-tag">' + x(s.title) + '</span>';
      });
      if (sel.length > 6) {
        tagsHtml += '<span class="qep-tag qep-tag-n">+' + (sel.length - 6) + '</span>';
      }
      tagsHtml += '</div>';
    }

    /* ── Label du bouton CTA ─────────────────────────────────────────── */
    var ctaTxt = hasSel
      ? x(label) + ' · ' + sel.length + ' feuille' + (sel.length > 1 ? 's' : '')
      : isMulti
        ? 'Choisir des feuilles\u2026'
        : x(label);
    var ctaDis = isMulti && !hasSel ? ' disabled' : '';

    /* ── HTML complet ────────────────────────────────────────────────── */
    $el.empty().html(
      '<div class="qep-panel">' +

        /* Header */
        '<div class="qep-hdr">' +
          I_PRINT +
          '<span class="qep-hdr-lbl">Impression</span>' +
        '</div>' +

        /* Section : feuilles */
        '<div class="qep-blk">' +
          '<div class="qep-blk-lbl">Feuilles \u00e0 imprimer</div>' +
          '<div class="qep-cards">' +

            '<button class="qep-card' + (state.mode === 'current' ? ' qep-on' : '') + '" data-mode="current">' +
              '<div class="qep-card-ico">' + I_SHEET + '</div>' +
              '<div class="qep-card-body">' +
                '<strong>Feuille courante</strong>' +
                '<span>La feuille visible</span>' +
              '</div>' +
              (state.mode === 'current' ? '<div class="qep-card-ck">' + I_OK + '</div>' : '') +
            '</button>' +

            '<button class="qep-card' + (isMulti ? ' qep-on' : '') + '" data-mode="multi">' +
              '<div class="qep-card-ico">' + I_MULTI + '</div>' +
              '<div class="qep-card-body">' +
                '<strong>Plusieurs feuilles</strong>' +
                '<span>' + (hasSel ? sel.length + ' s\u00e9lectionn\u00e9e' + (sel.length > 1 ? 's' : '') : 'Cliquer pour choisir') + '</span>' +
              '</div>' +
              (hasSel ? '<div class="qep-card-ck">' + I_OK + '</div>' : '') +
            '</button>' +

          '</div>' +
          tagsHtml +
        '</div>' +

        /* Section : format */
        '<div class="qep-blk">' +
          '<div class="qep-blk-lbl">Format de sortie</div>' +
          '<div class="qep-row3">' +

            '<div class="qep-fld">' +
              '<div class="qep-fld-lbl">Taille</div>' +
              sel3('paper', state.paper, [
                ['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter'], ['Legal', 'Legal']
              ]) +
            '</div>' +

            '<div class="qep-fld">' +
              '<div class="qep-fld-lbl">Sens</div>' +
              sel3('orient', state.orient, [
                ['landscape', 'Paysage \u2194'],
                ['portrait',  'Portrait \u2195']
              ]) +
            '</div>' +

            '<div class="qep-fld">' +
              '<div class="qep-fld-lbl">\u00c9chelle</div>' +
              sel3('scale', state.scale, [
                ['100', '100 %'], ['90', '90 %'], ['75', '75 %'], ['50', '50 %']
              ]) +
            '</div>' +

          '</div>' +
        '</div>' +

        /* Section : options */
        '<div class="qep-blk">' +
          '<div class="qep-blk-lbl">Options</div>' +

          '<div class="qep-opt-row">' +
            '<span class="qep-opt-k">Rendu</span>' +
            seg('color', state.color, [
              ['color', 'Couleur'],
              ['bw',    'Niveaux de gris']
            ]) +
          '</div>' +

          '<div class="qep-opt-row">' +
            '<span class="qep-opt-k">Zone</span>' +
            seg('zone', state.zone, [
              ['sheet',  I_SHEET + '<span>Feuille</span>'],
              ['screen', I_MON   + '<span>Vue \u00e9cran</span>']
            ]) +
          '</div>' +

        '</div>' +

        /* CTA */
        '<div class="qep-cta-z">' +
          '<button class="qep-cta"' + ctaDis + '>' +
            I_PRINT +
            '<span class="qep-cta-lbl">' + ctaTxt + '</span>' +
          '</button>' +
        '</div>' +

      '</div>' // .qep-panel
    );
  }

  /* ── Helpers HTML ─────────────────────────────────────────────────────── */

  function sel3 (key, cur, pairs) {
    var o = '<select class="qep-sel" data-key="' + key + '">';
    pairs.forEach(function (p) {
      o += '<option value="' + x(p[0]) + '"' + (p[0] === cur ? ' selected' : '') + '>' + x(p[1]) + '</option>';
    });
    return o + '</select>';
  }

  function seg (key, cur, pairs) {
    var o = '<div class="qep-seg" data-key="' + key + '">';
    pairs.forEach(function (p) {
      o += '<button class="qep-seg-b' + (p[0] === cur ? ' qep-on' : '') + '" data-val="' + x(p[0]) + '">' + p[1] + '</button>';
    });
    return o + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     EVENTS
     ══════════════════════════════════════════════════════════════════════════ */

  function bindEvt ($el, state, qId, app, label) {
    var $p = $el.find('.qep-panel');

    /* Cartes mode */
    $p.on('click', '.qep-card', function () {
      var mode = $(this).data('mode');
      if (mode === 'multi') {
        picker(app, state, function (sheets) {
          state.sheets = sheets;
          state.mode   = sheets.length ? 'multi' : 'current';
          _st[qId]     = state;
          render($el, state, label);
          bindEvt($el, state, qId, app, label);
        });
      } else {
        state.mode = 'current';
        _st[qId]   = state;
        render($el, state, label);
        bindEvt($el, state, qId, app, label);
      }
    });

    /* Selects */
    $p.on('change', '.qep-sel', function () {
      state[$(this).data('key')] = $(this).val();
      _st[qId] = state;
    });

    /* Segmented */
    $p.on('click', '.qep-seg-b', function () {
      var $seg = $(this).closest('.qep-seg');
      var key  = $seg.data('key');
      var val  = $(this).data('val');
      state[key] = val;
      _st[qId]   = state;
      $seg.find('.qep-seg-b').removeClass('qep-on');
      $(this).addClass('qep-on');
    });

    /* CTA */
    $p.on('click', '.qep-cta:not([disabled])', function () {
      /* Lire les selects en direct */
      $p.find('.qep-sel').each(function () {
        state[$(this).data('key')] = $(this).val();
      });
      var opts = {
        paper:  state.paper  || 'A4',
        orient: state.orient || 'landscape',
        scale:  state.scale  || '100',
        color:  state.color  || 'color',
        zone:   state.zone   || 'sheet',
        hide:   state.hide   !== false
      };
      if (state.mode === 'multi' && state.sheets.length) {
        printSeq(state.sheets.map(function (s) { return s.id; }), opts);
      } else {
        doPrint(opts);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL DE SÉLECTION DES FEUILLES
     ══════════════════════════════════════════════════════════════════════════ */

  function picker (app, state, onOk) {
    $('#qep-ov').remove();

    var $ov = $(
      '<div id="qep-ov" class="qep-ov" role="dialog" aria-modal="true" aria-label="S\u00e9lection des feuilles">' +
        '<div class="qep-dlg">' +

          '<div class="qep-dlg-hdr">' +
            '<h3 class="qep-dlg-title">Feuilles \u00e0 imprimer</h3>' +
            '<button class="qep-x" type="button" aria-label="Fermer">\u2715</button>' +
          '</div>' +

          '<div class="qep-dlg-srch">' +
            I_SEARCH +
            '<input class="qep-srch-in" type="text" placeholder="Rechercher une feuille\u2026" autocomplete="off">' +
          '</div>' +

          '<div class="qep-dlg-bdy">' +
            '<div class="qep-spin-w"><div class="qep-spin"></div><span>Chargement\u2026</span></div>' +
          '</div>' +

          '<div class="qep-dlg-ft">' +
            '<div class="qep-ft-l">' +
              '<button class="qep-ghost" data-a="all">Tout s\u00e9lectionner</button>' +
              '<button class="qep-ghost" data-a="none">Effacer</button>' +
            '</div>' +
            '<div class="qep-ft-r">' +
              '<button class="qep-ghost" data-a="cancel">Annuler</button>' +
              '<button class="qep-ok" data-a="ok" disabled>Confirmer (0)</button>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>'
    );

    $('body').append($ov);

    /* IDs pré-cochés */
    var prev = {};
    (state.sheets || []).forEach(function (s) { prev[s.id] = true; });

    function close () { $ov.remove(); }

    $ov.on('click', function (e) { if ($(e.target).is('#qep-ov')) { close(); } });
    $ov.find('.qep-x,[data-a="cancel"]').on('click', close);

    /* Chargement */
    loadSheets(app, function (err, sheets) {
      var $bdy = $ov.find('.qep-dlg-bdy').empty();

      if (err || !sheets || !sheets.length) {
        $bdy.html(
          '<div class="qep-dlg-err">' +
          (err
            ? 'Impossible de charger les feuilles.<br><small>' + x(String(err.message || err)) + '</small>'
            : 'Aucune feuille trouv\u00e9e dans l\u2019application.') +
          '</div>'
        );
        $ov.find('.qep-ok').text('Fermer').prop('disabled', false).on('click', close);
        return;
      }

      var $ul = $('<ul class="qep-ls"></ul>');
      sheets.forEach(function (s) {
        $ul.append(
          '<li class="qep-li" data-q="' + x(s.title.toLowerCase()) + '">' +
            '<label class="qep-li-lbl">' +
              '<input type="checkbox" class="qep-chk" value="' + x(s.id) + '" data-title="' + x(s.title) + '"' +
                (prev[s.id] ? ' checked' : '') + '>' +
              '<span class="qep-chk-ui"></span>' +
              '<span class="qep-li-txt">' + x(s.title) + '</span>' +
            '</label>' +
          '</li>'
        );
      });
      $bdy.append($ul);

      function upd () {
        var n = $ov.find('.qep-chk:checked').length;
        $ov.find('.qep-ok')
          .prop('disabled', n === 0)
          .text('Confirmer (' + n + ' feuille' + (n > 1 ? 's' : '') + ')');
      }

      $bdy.on('change', '.qep-chk', upd);

      $ov.find('.qep-srch-in').on('input', function () {
        var q = $(this).val().toLowerCase().trim();
        $ov.find('.qep-li').each(function () {
          $(this).toggle(!q || $(this).data('q').indexOf(q) !== -1);
        });
      });

      $ov.find('[data-a="all"]').on('click', function () {
        $ov.find('.qep-li:visible .qep-chk').prop('checked', true); upd();
      });
      $ov.find('[data-a="none"]').on('click', function () {
        $ov.find('.qep-chk').prop('checked', false); upd();
      });

      $ov.find('.qep-ok').on('click', function () {
        var picked = [];
        $ov.find('.qep-chk:checked').each(function () {
          picked.push({ id: $(this).val(), title: $(this).data('title') });
        });
        close();
        onOk(picked);
      });

      upd();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CHARGEMENT DES FEUILLES — 3 stratégies en cascade
     ══════════════════════════════════════════════════════════════════════════ */

  function loadSheets (app, cb) {
    var eng = app.model &&
      (app.model.enigmaModel || app.model.engine || app.model.engineApp);

    if (eng && typeof eng.createSessionObject === 'function') {
      eng.createSessionObject({
        qInfo: { qType: 'SheetList' },
        qAppObjectListDef: { qType: 'sheet', qData: { title: '/qMetaDef/title' } }
      })
      .then(function (obj) { return obj.getLayout(); })
      .then(function (lay) {
        var items = (lay.qAppObjectList && lay.qAppObjectList.qItems) || [];
        cb(null, items.map(mSheet));
      })
      .catch(function () { loadFb(app, cb); });
      return;
    }
    loadFb(app, cb);
  }

  function loadFb (app, cb) {
    try {
      var r = app.getObjectList('sheet');
      if (r && typeof r.then === 'function') {
        r.then(function (m) {
          cb(null, (sg(m, ['layout', 'qAppObjectList', 'qItems']) || []).map(mSheet));
        }).catch(function (e) { cb(e, []); });
      } else if (r) {
        var it = sg(r, ['layout', 'qAppObjectList', 'qItems']);
        if (it && it.length) { cb(null, it.map(mSheet)); }
        else {
          app.getObjectList('sheet', function (m) {
            cb(null, (sg(m, ['layout', 'qAppObjectList', 'qItems']) || []).map(mSheet));
          });
        }
      } else { cb(new Error('getObjectList returned nothing'), []); }
    } catch (e) { cb(e, []); }
  }

  function mSheet (i) {
    return {
      id:    i.qInfo.qId,
      title: (i.qMeta && i.qMeta.title) || (i.qData && i.qData.title) || 'Sans titre'
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     IMPRESSION
     ══════════════════════════════════════════════════════════════════════════ */

  function printSeq (ids, opts) {
    if (!ids || !ids.length) { doPrint(opts); return; }
    var idx = 0, nav = qlik.navigation;
    function next () {
      if (idx >= ids.length) { return; }
      var id = ids[idx++];
      if (nav && typeof nav.gotoSheet === 'function') { nav.gotoSheet(id); }
      setTimeout(function () {
        var done = function () {
          window.removeEventListener('afterprint', done);
          if (idx < ids.length) { setTimeout(next, 800); }
        };
        window.addEventListener('afterprint', done);
        doPrint(opts);
      }, 3000);
    }
    next();
  }

  function doPrint (opts) {
    var SID  = 'qep-ps';
    $('#' + SID).remove();

    var chrome =
      '.qv-header,.qv-toolbar,.qv-footer,.qv-side-panel,' +
      '.qs-toolbar,.qs-navigation,.navigation-bar,' +
      'header,nav,#hub-header,#sn-ui-blockers,.sheet-interaction-overlay';

    var sc  = String(opts.scale || '100').replace(/\D/g, '');
    var vw  = window.innerWidth;
    var vh  = window.innerHeight;
    var isV = opts.zone === 'screen';

    var css =
      '@media print {\n' +
      '@page { size: ' + (opts.paper || 'A4') + ' ' + (opts.orient || 'landscape') +
        '; margin: ' + (isV ? '0' : '10mm') + '; }\n' +
      chrome + ' { display: none !important; }\n' +
      (isV
        ? 'html,body{width:' + vw + 'px!important;height:' + vh + 'px!important;overflow:hidden!important}\n' +
          '.qv-canvas,.qv-sheet-container,.qv-stage{max-width:' + vw + 'px!important;max-height:' + vh + 'px!important;overflow:hidden!important}\n'
        : '') +
      (sc && sc !== '100' ? 'html{zoom:' + sc + '%!important}\n' : '') +
      (opts.color === 'bw' ? '*{-webkit-filter:grayscale(100%)!important;filter:grayscale(100%)!important}\n' : '') +
      '*,img,canvas,svg{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}\n' +
      (opts.hide ? '.qep-panel{display:none!important}\n' : '') +
      'html,body{background:#fff!important}\n' +
      '.qv-inner-object,.qv-viz{box-shadow:none!important;border:none!important}\n' +
      'img,canvas{image-rendering:high-quality!important}\n' +
      '}';

    $('<style id="' + SID + '">').text(css).appendTo('head');

    var done = function () {
      $('#' + SID).remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UTILITAIRES
     ══════════════════════════════════════════════════════════════════════════ */

  function x (s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function sg (o, keys) {
    return keys.reduce(function (v, k) {
      return v && typeof v === 'object' ? v[k] : undefined;
    }, o);
  }

}); // end define
