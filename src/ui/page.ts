/**
 * TOVI — the UI's single HTML page.
 *
 * Kept as a string for the same reason report/html.ts is: `tsc` copies no
 * assets, so a separate .html file would not survive the build into `dist/`.
 *
 * No framework and no CDN. The page is served from loopback by a tool whose
 * whole claim is determinism; a build step and a network dependency would both
 * be a poor trade for what this is.
 *
 * ====================================================================
 * DESIGN RULE — the config format is not the interface.
 * ====================================================================
 *
 * The first version of this page exposed TOVI's config directly: a JSON
 * textarea for elements and a free-text field for the section. It was unusable
 * by anyone who did not already know the data model, and it made an entire
 * class of error possible — typing a section name that matched no element,
 * because the two were independent strings.
 *
 * So the page owns a small state object and renders controls from it:
 *
 *   - Elements are a table, built by clicking layers. Never hand-typed JSON.
 *   - The section is a <select> over the elements that exist, so it cannot
 *     name something absent.
 *   - Layers Figma cannot measure are not addable at all.
 *
 * The JSON view survives as an advanced disclosure for people who want it.
 * Adding a control that takes a raw config value as free text is a regression.
 */

export const UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOVI</title>
<style>
  :root {
    color-scheme: light dark;
    --ground: #fbfbfc; --surface: #fff; --sunken: #f4f5f7; --line: #e5e7eb;
    --ink: #16181d; --ink-2: #6b7280;
    --accent: #0052cc; --accent-soft: #e8f0fd;
    --error: #dc2626; --warn: #b45309; --ok: #15803d;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #0f1115; --surface: #161a21; --sunken: #11141a; --line: #272c36;
      --ink: #e6e8ec; --ink-2: #9aa2b1;
      --accent: #5d9dff; --accent-soft: #152439;
      --error: #f87171; --warn: #fbbf24; --ok: #4ade80;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding-inline: 20px; padding-block: 24px 64px; }
  header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.01em; }
  .sub { color: var(--ink-2); font-size: 13px; margin: 0; }
  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--ink-2); margin: 0 0 10px; font-weight: 600;
  }
  .panel {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 10px; padding: 16px; margin-top: 16px;
  }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; min-width: 0; }
  .field.narrow { flex: 0 0 110px; }
  label { font-size: 12px; color: var(--ink-2); }
  input, select, textarea {
    font: inherit; color: inherit; background: var(--ground);
    border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px;
    min-width: 0; width: 100%;
  }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; min-height: 160px; }
  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  button {
    font: inherit; font-weight: 600; cursor: pointer;
    background: var(--accent); color: #fff; border: 0;
    border-radius: 6px; padding: 8px 16px; white-space: nowrap;
  }
  button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
  button.icon {
    background: transparent; color: var(--ink-2); border: 1px solid var(--line);
    padding: 3px 9px; font-weight: 400; line-height: 1.4;
  }
  button.icon:hover { color: var(--error); border-color: var(--error); }
  button:disabled { opacity: .45; cursor: default; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--ink-2); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--line);
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .chip {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
  }
  .chip.error { background: var(--error); color: #fff; }
  .chip.warning { background: var(--warn); color: #fff; }
  .chip.info { background: var(--ink-2); color: #fff; }
  .verdict { font-size: 15px; font-weight: 700; margin: 0; }
  .verdict.pass { color: var(--ok); }
  .verdict.fail { color: var(--error); }
  .muted { color: var(--ink-2); }
  .note {
    border-left: 3px solid var(--warn); background: var(--accent-soft);
    padding: 10px 12px; border-radius: 0 6px 6px 0; font-size: 13px; margin-top: 12px;
  }
  .note.bad { border-left-color: var(--error); }
  .note.good { border-left-color: var(--ok); }
  .note b { display: block; margin-bottom: 3px; }
  .scroll { overflow-x: auto; }
  .empty {
    text-align: center; color: var(--ink-2); font-size: 13px;
    padding: 22px 12px; background: var(--sunken); border-radius: 8px;
  }
  .pick { cursor: pointer; }
  .pick:hover { background: var(--accent-soft); }
  .pick.disabled { cursor: not-allowed; opacity: .5; }
  .pick.disabled:hover { background: transparent; }
  .pick.added { opacity: .55; }
  .stats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 8px; }
  .stat { font-size: 12px; color: var(--ink-2); }
  .stat b { display: block; font-size: 17px; color: var(--ink); font-variant-numeric: tabular-nums; }
  details { margin-top: 14px; }
  summary { cursor: pointer; font-size: 12px; color: var(--ink-2); }
  .slug { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .tiny { font-size: 11px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>TOVI</h1>
    <p class="sub">Compare a Figma design against a live page.</p>
  </header>

  <div id="env"></div>

  <section class="panel">
    <h2>1 &middot; The page to check</h2>
    <div class="row">
      <div class="field">
        <label for="url">Live URL</label>
        <input id="url" type="url" placeholder="https://example.com/" autocomplete="off">
      </div>
      <div class="field">
        <label for="fileKey">Figma file key</label>
        <input id="fileKey" type="text" placeholder="from the file URL" autocomplete="off">
      </div>
      <div class="field narrow">
        <label for="vw">Width</label>
        <input id="vw" type="number" value="1440" min="1" step="1">
      </div>
      <div class="field narrow">
        <label for="vh">Height</label>
        <input id="vh" type="number" value="900" min="1" step="1">
      </div>
    </div>
    <p class="sub" style="margin-top:10px">
      The width should match the width of the Figma frame you are comparing against.
    </p>
  </section>

  <section class="panel">
    <h2>2 &middot; Pick the layers to check</h2>
    <div class="row">
      <div class="field">
        <label for="lpage">Page</label>
        <input id="lpage" type="text" placeholder="all pages" autocomplete="off">
      </div>
      <div class="field">
        <label for="lsearch">Layer name contains</label>
        <input id="lsearch" type="text" placeholder="hero" autocomplete="off">
      </div>
      <div class="field narrow">
        <label for="ldepth">Depth</label>
        <input id="ldepth" type="number" value="4" min="1" step="1">
      </div>
      <button id="browse" class="ghost" type="button">Browse layers</button>
    </div>
    <div id="layers"></div>
  </section>

  <section class="panel">
    <h2>3 &middot; What will be checked</h2>
    <div id="elements"></div>

    <div class="row" style="margin-top:14px">
      <div class="field">
        <label for="section">Measure positions relative to</label>
        <select id="section"></select>
      </div>
      <button id="run" type="button" disabled>Run check</button>
    </div>
    <p class="sub" style="margin-top:8px">
      Figma canvas coordinates and browser viewport coordinates are unrelated, so
      every position is measured relative to this container instead &mdash; usually
      the outermost frame of the section you are checking.
    </p>

    <details>
      <summary>Advanced &mdash; edit as JSON</summary>
      <textarea id="json" spellcheck="false"></textarea>
      <div class="row" style="margin-top:8px">
        <button id="applyJson" class="ghost" type="button">Apply JSON</button>
        <span id="jsonNote" class="sub"></span>
      </div>
    </details>
  </section>

  <section class="panel" id="resultPanel" hidden>
    <h2>Results</h2>
    <div id="results"></div>
  </section>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };

  /**
   * Everything the page knows. Controls render from this; nothing reads a
   * config value back out of a free-text field.
   */
  var state = { elements: [], section: '' };

  /** Rendered layer rows. A real file returns thousands; nobody scrolls those. */
  var ROW_LIMIT = 250;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function note(target, message, kind) {
    target.innerHTML = '<div class="note ' + (kind || '') + '">' + message + '</div>';
    if (kind === 'bad' && target.scrollIntoView) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async function api(path, init) {
    var res = await fetch(path, init);
    var body = await res.json();
    if (!res.ok) throw new Error(body && body.error ? body.error : 'Request failed');
    return body;
  }

  /* ------------------------------------------------------------------ *
   * Elements
   * ------------------------------------------------------------------ */

  /** Turn a layer name into a slug usable as a data-figma-id attribute. */
  function slugify(name) {
    return String(name).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'element';
  }

  function uniqueSlug(base) {
    var slug = base;
    var n = 2;
    while (state.elements.some(function (e) { return e.figmaId === slug; })) {
      slug = base + '-' + n;
      n += 1;
    }
    return slug;
  }

  function addElement(nodeId, name) {
    if (state.elements.some(function (e) { return e.nodeId === nodeId; })) return;
    var element = { figmaId: uniqueSlug(slugify(name)), nodeId: nodeId, name: name, passes: '' };
    state.elements.push(element);
    // The first thing added is almost always the container being checked.
    if (!state.section) state.section = element.figmaId;
    renderElements();
  }

  function renderElements() {
    var box = $('elements');

    if (!state.elements.length) {
      box.innerHTML = '<p class="empty">Nothing selected yet. Browse layers above and ' +
        'click a row to add it.</p>';
    } else {
      var rows = state.elements.map(function (e, i) {
        return '<tr>' +
          '<td><input class="slug" data-edit="figmaId" data-i="' + i + '" value="' + esc(e.figmaId) + '"></td>' +
          '<td class="muted tiny">' + esc(e.name || '—') + '</td>' +
          '<td class="mono muted">' + esc(e.nodeId) + '</td>' +
          '<td><select data-edit="passes" data-i="' + i + '">' +
            '<option value=""' + (e.passes === '' ? ' selected' : '') + '>size, position and type</option>' +
            '<option value="geometry"' + (e.passes === 'geometry' ? ' selected' : '') + '>size and position only</option>' +
            '<option value="text"' + (e.passes === 'text' ? ' selected' : '') + '>type only</option>' +
          '</select></td>' +
          '<td><button class="icon" data-remove="' + i + '" type="button" ' +
            'aria-label="Remove ' + esc(e.figmaId) + '">Remove</button></td>' +
        '</tr>';
      }).join('');

      box.innerHTML =
        '<div class="scroll"><table><thead><tr>' +
        '<th>Tag on the page</th><th>Figma layer</th><th>Node id</th><th>Compare</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="sub" style="margin-top:10px">Each of these must carry a matching ' +
        '<code>data-figma-id</code> attribute in the page\\'s HTML. Rename the tag on the ' +
        'left to whatever the markup already uses.</p>';
    }

    renderSectionChoices();
    syncJson();
    $('run').disabled = state.elements.length === 0;
  }

  /**
   * The section is chosen from what exists, never typed.
   *
   * A free-text field here was the single worst thing about the first version:
   * it let the section name and the element slugs drift apart, and the failure
   * came back as a validation error from the server.
   */
  function renderSectionChoices() {
    var select = $('section');
    if (!state.elements.some(function (e) { return e.figmaId === state.section; })) {
      state.section = state.elements.length ? state.elements[0].figmaId : '';
    }
    select.innerHTML = state.elements.length
      ? state.elements.map(function (e) {
          return '<option value="' + esc(e.figmaId) + '"' +
            (e.figmaId === state.section ? ' selected' : '') + '>' + esc(e.figmaId) + '</option>';
        }).join('')
      : '<option value="">add a layer first</option>';
    select.disabled = !state.elements.length;
  }

  $('elements').addEventListener('input', function (event) {
    var field = event.target.getAttribute('data-edit');
    if (!field) return;
    var element = state.elements[Number(event.target.getAttribute('data-i'))];
    if (!element) return;

    element[field] = event.target.value;
    if (field === 'figmaId') {
      // Keep the section pointing at this element if it was the one selected.
      renderSectionChoices();
      syncJson();
    }
  });

  $('elements').addEventListener('click', function (event) {
    var index = event.target.getAttribute('data-remove');
    if (index === null) return;
    state.elements.splice(Number(index), 1);
    renderElements();
  });

  $('section').addEventListener('change', function () { state.section = $('section').value; });

  /* ------------------------------------------------------------------ *
   * Config
   * ------------------------------------------------------------------ */

  function currentConfig() {
    var config = {
      url: $('url').value.trim(),
      section: state.section,
      viewport: { width: Number($('vw').value), height: Number($('vh').value) },
      elements: state.elements.map(function (e) {
        var out = { figmaId: e.figmaId, nodeId: e.nodeId };
        // "" means both passes, which is the server's default, so omit it.
        if (e.passes) out.passes = [e.passes];
        return out;
      })
    };

    // Omit rather than send empty: an absent key falls back to FIGMA_FILE_KEY
    // on the server, but an empty string is a validation error.
    var fileKey = $('fileKey').value.trim();
    if (fileKey) config.figmaFileKey = fileKey;

    return config;
  }

  function syncJson() {
    $('json').value = JSON.stringify(currentConfig(), null, 2);
  }

  $('applyJson').addEventListener('click', function () {
    try {
      var config = JSON.parse($('json').value);
      applyConfig(config);
      $('jsonNote').textContent = 'Applied.';
    } catch (err) {
      $('jsonNote').textContent = 'Not valid JSON: ' + err.message;
    }
  });

  function applyConfig(config) {
    $('url').value = config.url || '';
    if (config.figmaFileKey) $('fileKey').value = config.figmaFileKey;
    if (config.viewport) {
      $('vw').value = config.viewport.width;
      $('vh').value = config.viewport.height;
    }
    state.elements = (config.elements || []).map(function (e) {
      return {
        figmaId: e.figmaId,
        nodeId: e.nodeId,
        name: e.name || '',
        passes: Array.isArray(e.passes) && e.passes.length === 1 ? e.passes[0] : ''
      };
    });
    state.section = config.section || '';
    renderElements();
  }

  /* ------------------------------------------------------------------ *
   * Environment
   * ------------------------------------------------------------------ */

  async function loadEnv() {
    try {
      var health = await api('/api/health');
      if (!health.hasToken) {
        note($('env'),
          '<b>No Figma token</b>Set FIGMA_TOKEN in your environment and restart ' +
          'tovi ui. It is read by the server and never sent to this page.', 'bad');
      }
      if (health.fileKeyFromEnv) $('fileKey').value = health.fileKeyFromEnv;

      var loaded = await api('/api/config');
      if (loaded.config) applyConfig(loaded.config);
      else renderElements();
      if (loaded.error) note($('env'), esc(loaded.error), 'bad');
    } catch (err) {
      note($('env'), esc(err.message), 'bad');
      renderElements();
    }
  }

  /* ------------------------------------------------------------------ *
   * Layers
   * ------------------------------------------------------------------ */

  $('browse').addEventListener('click', async function () {
    var box = $('layers');
    box.innerHTML = '<p class="sub" style="margin-top:12px">Loading…</p>';
    var q = new URLSearchParams({
      file: $('fileKey').value.trim(),
      page: $('lpage').value.trim(),
      search: $('lsearch').value.trim(),
      depth: $('ldepth').value
    });
    try {
      renderLayers(await api('/api/layers?' + q.toString()));
    } catch (err) {
      note(box, esc(err.message), 'bad');
    }
  });

  function renderLayers(data) {
    if (!data.rows.length) {
      $('layers').innerHTML = '<p class="sub" style="margin-top:12px">No layers matched. ' +
        'Pages in this file: ' + esc(data.pages.join(', ')) + '</p>';
      return;
    }

    var shown = data.rows.slice(0, ROW_LIMIT);
    var rows = shown.map(function (row) {
      // Figma reports no box for pages and for hidden or detached nodes. They
      // cannot be measured, so they cannot be compared — say so here rather
      // than letting the run fail on them later.
      var measurable = row.width !== undefined && row.height !== undefined;
      var already = state.elements.some(function (e) { return e.nodeId === row.nodeId; });
      var size = measurable ? Math.round(row.width) + '×' + Math.round(row.height)
        : '<span class="tiny">cannot be measured</span>';
      var cls = 'pick' + (measurable ? (already ? ' added' : '') : ' disabled');

      return '<tr class="' + cls + '" data-node="' + esc(row.nodeId) + '"' +
        ' data-name="' + esc(row.name) + '" data-ok="' + (measurable ? '1' : '') + '">' +
        '<td class="mono">' + esc(row.nodeId) + '</td>' +
        '<td class="mono muted tiny">' + esc(row.type) + '</td>' +
        '<td>' + '&nbsp;'.repeat(row.depth * 3) + esc(row.name) +
          (already ? ' <span class="muted tiny">· added</span>' : '') + '</td>' +
        '<td class="mono muted tiny">' + size + '</td></tr>';
    }).join('');

    var caption = esc(data.fileName) + ' — ' + data.rows.length + ' layers';
    caption += data.rows.length > ROW_LIMIT
      ? ', showing the first ' + ROW_LIMIT + '. Narrow with a page, a name, or a smaller depth.'
      : '. Click a row to add it.';

    $('layers').innerHTML =
      '<p class="sub" style="margin:12px 0 6px">' + caption + '</p>' +
      '<div class="scroll"><table><thead><tr>' +
      '<th>Node id</th><th>Type</th><th>Layer</th><th>Size</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  $('layers').addEventListener('click', function (event) {
    var tr = event.target.closest('.pick');
    if (!tr) return;
    if (!tr.getAttribute('data-ok')) {
      note($('layers').querySelector('p') ? $('layers') : $('layers'),
        '<b>' + esc(tr.dataset.name) + ' cannot be measured</b>' +
        'Figma reports no size for it — pages, hidden layers and detached nodes have ' +
        'no box, so there is nothing to compare. Pick a frame inside it instead.', 'bad');
      return;
    }
    addElement(tr.dataset.node, tr.dataset.name);
    tr.classList.add('added');
  });

  /* ------------------------------------------------------------------ *
   * Run
   * ------------------------------------------------------------------ */

  $('run').addEventListener('click', async function () {
    var button = $('run');
    button.disabled = true;
    button.textContent = 'Running…';
    $('resultPanel').hidden = false;
    $('results').innerHTML = '<p class="sub">Fetching the design and loading the page…</p>';

    try {
      var config = currentConfig();
      if (!config.url) throw new Error('Enter the live URL to check.');

      var data = await api('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: config })
      });
      renderReport(data.report);
    } catch (err) {
      note($('results'), esc(err.message), 'bad');
    } finally {
      button.disabled = false;
      button.textContent = 'Run check';
    }
  });

  function renderReport(report) {
    var s = report.summary;

    // The most common first-run outcome by far: the page is not tagged yet.
    // Reported as one fact rather than N identical failures.
    var missing = report.elements.filter(function (el) {
      return el.issues.some(function (i) { return i.property === 'missingInLive'; });
    });
    var banner = '';
    if (missing.length === report.elements.length && report.elements.length) {
      banner = '<div class="note bad"><b>Nothing on the page is tagged yet</b>' +
        'None of the ' + report.elements.length + ' elements were found. Each one needs a ' +
        '<code>data-figma-id</code> attribute in the page\\'s HTML matching the tag ' +
        'shown in the table above. Until the markup carries them, there is nothing ' +
        'to compare against.</div>';
    }

    var head =
      '<p class="verdict ' + report.status + '">' + report.status.toUpperCase() + '</p>' +
      '<div class="stats">' +
        '<span class="stat"><b>' + s.elementsChecked + '</b>elements</span>' +
        '<span class="stat"><b>' + s.elementsPassed + '</b>passed</span>' +
        '<span class="stat"><b>' + s.elementsFailed + '</b>failed</span>' +
        '<span class="stat"><b>' + s.errorCount + '</b>errors</span>' +
        '<span class="stat"><b>' + s.warningCount + '</b>warnings</span>' +
      '</div>' + banner;

    var sections = report.elements.filter(function (el) { return el.issues.length; })
      .map(function (el) {
        var rows = el.issues.map(function (i) {
          var delta = i.delta === undefined ? '—'
            : (i.delta > 0 ? '+' : '') + i.delta +
              (i.tolerance === undefined ? '' : ' <span class="muted">/ ' + i.tolerance + '</span>');
          return '<tr>' +
            '<td><span class="chip ' + i.severity + '">' + i.severity + '</span></td>' +
            '<td class="mono">' + esc(i.property) +
              (i.detail ? '<br><span class="muted tiny">' + esc(i.detail) + '</span>' : '') + '</td>' +
            '<td class="mono">' + esc(i.expected) + '</td>' +
            '<td class="mono">' + esc(i.actual) + '</td>' +
            '<td class="mono">' + delta + '</td></tr>';
        }).join('');

        return '<h2 style="margin-top:18px">' + esc(el.figmaId) + '</h2>' +
          '<div class="scroll"><table><thead><tr>' +
          '<th></th><th>Property</th><th>Design</th><th>Live</th><th>Delta / tol</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>';
      }).join('');

    $('results').innerHTML = head +
      (sections || '<p class="sub" style="margin-top:14px">Everything matched within tolerance.</p>');
  }

  loadEnv();
})();
</script>
</body>
</html>
`;
