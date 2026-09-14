/**
 * TOVI — the UI's single HTML page.
 *
 * Kept as a string for the same reason report/html.ts is: `tsc` copies no
 * assets, so a separate .html file would not survive the build into `dist/`.
 *
 * ====================================================================
 * DESIGN RULES — read before adding a control.
 * ====================================================================
 *
 * 1. THE CONFIG FORMAT IS NOT THE INTERFACE. The first version exposed it
 *    directly — a JSON textarea for elements, a free-text box for the section —
 *    and it was unusable by anyone who did not already know the data model. The
 *    page owns a state object and renders controls from it. `figmaId` is an
 *    internal key and is never shown.
 *
 * 2. OFFER A CHOICE, DO NOT ASK FOR A VALUE. Anything with a knowable set of
 *    options is a <select> populated in the background: the Figma page, the
 *    viewport, the depth. A text input is a last resort for things only the
 *    user knows — the URL, and a CSS selector.
 *
 * 3. NOTHING THAT CAN DISAGREE WITH ITSELF. The section is chosen from the
 *    elements that exist, so it cannot name something absent. Two independent
 *    strings for the same thing is the bug pattern this page keeps hitting.
 *
 * 4. LONG LISTS SCROLL IN PLACE. A real file returns thousands of layers;
 *    the browser sits in its own fixed-height pane so the page stays navigable.
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
  .wrap { max-width: 1060px; margin: 0 auto; padding-inline: 20px; padding-block: 24px 64px; }
  header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.01em; }
  .sub { color: var(--ink-2); font-size: 13px; margin: 0; }
  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--ink-2); margin: 0 0 12px; font-weight: 600;
  }
  .panel {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 10px; padding: 16px; margin-top: 14px;
  }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 190px; min-width: 0; }
  .field.narrow { flex: 0 0 130px; }
  label { font-size: 12px; color: var(--ink-2); }
  input, select {
    font: inherit; color: inherit; background: var(--ground);
    border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px;
    min-width: 0; width: 100%;
  }
  input.mono, textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  textarea {
    width: 100%; min-height: 150px; background: var(--ground); color: inherit;
    border: 1px solid var(--line); border-radius: 6px; padding: 8px;
  }
  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  button {
    font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap;
    background: var(--accent); color: #fff; border: 0; border-radius: 6px; padding: 8px 16px;
  }
  button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
  button.link {
    background: none; border: 0; color: var(--accent); padding: 0;
    font-size: 12px; font-weight: 500; text-decoration: underline;
  }
  button.icon {
    background: transparent; color: var(--ink-2); border: 1px solid var(--line);
    padding: 3px 9px; font-weight: 400; font-size: 12px;
  }
  button.icon:hover { color: var(--error); border-color: var(--error); }
  button:disabled { opacity: .45; cursor: default; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--ink-2); font-weight: 600; padding: 7px 8px; border-bottom: 1px solid var(--line);
    background: var(--surface); position: sticky; top: 0; z-index: 1;
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  /* Rule 4: the layer list scrolls in its own pane, never the whole page. */
  .listpane {
    max-height: 340px; overflow: auto; border: 1px solid var(--line);
    border-radius: 8px; margin-top: 10px; background: var(--ground);
  }
  .listpane th { background: var(--ground); }
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
  .tiny { font-size: 11px; }
  .note {
    border-left: 3px solid var(--warn); background: var(--accent-soft);
    padding: 10px 12px; border-radius: 0 6px 6px 0; font-size: 13px; margin-top: 12px;
  }
  .note.bad { border-left-color: var(--error); }
  .note b { display: block; margin-bottom: 3px; }
  .scroll { overflow-x: auto; }
  .empty {
    text-align: center; color: var(--ink-2); font-size: 13px;
    padding: 22px 12px; background: var(--sunken); border-radius: 8px;
  }
  .pick { cursor: pointer; }
  .pick:hover { background: var(--accent-soft); }
  .pick.disabled { cursor: not-allowed; opacity: .45; }
  .pick.disabled:hover { background: transparent; }
  .pick.added { opacity: .5; }
  .hit { font-size: 11px; font-weight: 600; white-space: nowrap; }
  .hit.ok { color: var(--ok); }
  .hit.bad { color: var(--error); }
  .hit.warn { color: var(--warn); }
  .stats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 8px; }
  .stat { font-size: 12px; color: var(--ink-2); }
  .stat b { display: block; font-size: 17px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .filemeta { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13px; }
  details { margin-top: 14px; }
  summary { cursor: pointer; font-size: 12px; color: var(--ink-2); }
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
      <div class="field" style="flex:1 1 320px">
        <label for="url">Live URL</label>
        <input id="url" type="url" placeholder="https://example.com/page/" autocomplete="off">
      </div>
      <div class="field narrow">
        <label for="preset">Screen size</label>
        <select id="preset">
          <option value="1440x900">Desktop · 1440</option>
          <option value="1728x1080">Desktop · 1728</option>
          <option value="1280x800">Laptop · 1280</option>
          <option value="768x1024">Tablet · 768</option>
          <option value="390x844">Phone · 390</option>
          <option value="custom">Custom…</option>
        </select>
      </div>
      <div class="field narrow" id="customSize" hidden>
        <label for="vw">Width &times; height</label>
        <div class="row" style="gap:6px">
          <input id="vw" type="number" value="1440" min="1" step="1" style="flex:1">
          <input id="vh" type="number" value="900" min="1" step="1" style="flex:1">
        </div>
      </div>
    </div>
    <p class="sub" style="margin-top:10px" id="fileLine">Loading the Figma file…</p>
  </section>

  <section class="panel">
    <h2>2 &middot; Pick the layers to check</h2>
    <div class="row">
      <div class="field">
        <label for="lpage">Figma page</label>
        <select id="lpage"><option value="">loading…</option></select>
      </div>
      <div class="field">
        <label for="lsearch">Layer name contains</label>
        <input id="lsearch" type="text" placeholder="hero" autocomplete="off">
      </div>
      <div class="field narrow">
        <label for="ldepth">How deep</label>
        <select id="ldepth">
          <option value="1">Top level</option>
          <option value="2">2 levels</option>
          <option value="3" selected>3 levels</option>
          <option value="4">4 levels</option>
          <option value="5">5 levels</option>
        </select>
      </div>
      <button id="browse" class="ghost" type="button">Show layers</button>
    </div>
    <div id="layers"></div>
  </section>

  <section class="panel">
    <h2>3 &middot; What gets checked</h2>
    <div id="elements"></div>

    <datalist id="selhints"></datalist>

    <div class="row" style="margin-top:14px">
      <div class="field">
        <label for="section">Measure positions relative to</label>
        <select id="section"></select>
      </div>
      <button id="test" class="ghost" type="button" disabled>Test selectors</button>
      <button id="run" type="button" disabled>Run check</button>
    </div>
    <p class="sub" style="margin-top:8px">
      Figma canvas coordinates and browser viewport coordinates are unrelated, so
      every position is measured relative to this container instead.
    </p>

    <details>
      <summary>Advanced &mdash; view or paste the config</summary>
      <textarea id="json" spellcheck="false"></textarea>
      <div class="row" style="margin-top:8px">
        <button id="applyJson" class="ghost" type="button">Apply</button>
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

  var state = { elements: [], section: '', fileKey: '', pages: [], probe: {} };
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

  /* ---------- viewport presets (rule 2: choose, don't type) ---------- */

  $('preset').addEventListener('change', function () {
    var value = $('preset').value;
    $('customSize').hidden = value !== 'custom';
    if (value !== 'custom') {
      var parts = value.split('x');
      $('vw').value = parts[0];
      $('vh').value = parts[1];
    }
    syncJson();
  });

  /* ---------- elements ---------- */

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

  function defaultSelector(figmaId) { return '[data-figma-id="' + figmaId + '"]'; }

  /**
   * The selectors worth trying for a layer, best first.
   *
   * Guessing one and hoping is what made a first run fail with
   * missingInLive on every page that had never heard of TOVI. The attribute
   * is the most durable pairing and stays first, but a page that was built
   * from the design usually already carries the layer name as a class — so
   * try that too, and let the page decide which is real.
   *
   * Deterministic derivations of the layer name only. This resolves to an
   * explicit selector that is written into the config and shown in the table,
   * so a run stays reproducible and the user can always overrule it.
   */
  function candidateSelectors(slug) {
    return ['[data-figma-id="' + slug + '"]', '.' + slug, '#' + slug];
  }

  function addElement(nodeId, name) {
    if (state.elements.some(function (e) { return e.nodeId === nodeId; })) return;
    var slug = uniqueSlug(slugify(name));
    state.elements.push({
      figmaId: slug, nodeId: nodeId, name: name,
      selector: defaultSelector(slug), passes: '',
      // While true, the selector is ours to replace with whatever the page
      // says actually matches. One keystroke from the user ends that.
      auto: true
    });
    if (!state.section) state.section = slug;
    renderElements();
    scheduleResolve();
  }

  function renderElements() {
    var box = $('elements');

    if (!state.elements.length) {
      box.innerHTML = '<p class="empty">Nothing picked yet. Show the layers above and ' +
        'click the ones you want checked.</p>';
    } else {
      var rows = state.elements.map(function (e, i) {
        var probe = state.probe[e.selector];
        var status = '<span class="muted tiny">—</span>';
        if (probe) {
          if (probe.invalid) status = '<span class="hit bad">not valid CSS</span>';
          else if (probe.count === 1) status = '<span class="hit ok">1 match</span>';
          else if (probe.count === 0) status = '<span class="hit bad">no match</span>';
          else status = '<span class="hit warn">' + probe.count + ' matches</span>';
        }

        return '<tr>' +
          '<td>' + esc(e.name || e.figmaId) + '</td>' +
          '<td><input class="mono" data-edit="selector" data-i="' + i + '" ' +
            'value="' + esc(e.selector) + '" spellcheck="false" list="selhints">' +
            (probe && probe.describes
              ? '<div class="muted tiny" style="margin-top:3px">' + esc(probe.describes) + '</div>'
              : '') + '</td>' +
          '<td>' + status + '</td>' +
          '<td><select data-edit="passes" data-i="' + i + '">' +
            '<option value=""' + (e.passes === '' ? ' selected' : '') + '>size, position, type</option>' +
            '<option value="geometry"' + (e.passes === 'geometry' ? ' selected' : '') + '>size and position</option>' +
            '<option value="text"' + (e.passes === 'text' ? ' selected' : '') + '>type only</option>' +
          '</select></td>' +
          '<td><button class="icon" data-remove="' + i + '" type="button">Remove</button></td>' +
        '</tr>';
      }).join('');

      box.innerHTML =
        '<div class="scroll"><table><thead><tr>' +
        '<th style="width:24%">Figma layer</th><th>How to find it on the page</th>' +
        '<th style="width:11%">Found?</th><th style="width:18%">Compare</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="sub" style="margin-top:10px">TOVI looks for each layer on the page ' +
        'itself &mdash; first a <code>data-figma-id</code> attribute, then a class or id ' +
        'matching the layer name. Whatever it settles on is shown above and goes into the ' +
        'config, so you can always overrule it: any CSS selector works, like ' +
        '<code>.hero__title</code> or <code>main .lop-column</code>. Edit one and TOVI ' +
        'stops rewriting it.</p>';
    }

    renderSectionChoices();
    syncJson();
    $('run').disabled = state.elements.length === 0;
    $('test').disabled = state.elements.length === 0;
  }

  /** Rule 3: the section is picked from what exists, never typed. */
  function renderSectionChoices() {
    var select = $('section');
    if (!state.elements.some(function (e) { return e.figmaId === state.section; })) {
      state.section = state.elements.length ? state.elements[0].figmaId : '';
    }
    select.innerHTML = state.elements.length
      ? state.elements.map(function (e) {
          return '<option value="' + esc(e.figmaId) + '"' +
            (e.figmaId === state.section ? ' selected' : '') + '>' +
            esc(e.name || e.figmaId) + '</option>';
        }).join('')
      : '<option value="">pick a layer first</option>';
    select.disabled = !state.elements.length;
  }

  // change, not input: a URL is only worth loading once it is finished
  // being typed. Layers picked before the URL was known resolve here.
  $('url').addEventListener('change', function () {
    syncJson();
    scheduleResolve();
  });

  $('elements').addEventListener('input', function (event) {
    var field = event.target.getAttribute('data-edit');
    if (!field) return;
    var element = state.elements[Number(event.target.getAttribute('data-i'))];
    if (!element) return;
    element[field] = event.target.value;
    // Their selector, their call. Auto-resolution must never overwrite it.
    if (field === 'selector') element.auto = false;
    syncJson();
    // A stale "1 match" next to an edited selector would be a lie.
    if (field === 'selector' && !state.probe[element.selector]) renderElements();
  });

  $('elements').addEventListener('click', function (event) {
    var index = event.target.getAttribute('data-remove');
    if (index === null) return;
    state.elements.splice(Number(index), 1);
    renderElements();
  });

  $('section').addEventListener('change', function () {
    state.section = $('section').value;
    syncJson();
  });

  /* ---------- config ---------- */

  function currentConfig() {
    var config = {
      url: $('url').value.trim(),
      section: state.section,
      viewport: { width: Number($('vw').value), height: Number($('vh').value) },
      elements: state.elements.map(function (e) {
        var out = { figmaId: e.figmaId, nodeId: e.nodeId };
        if (e.selector && e.selector !== defaultSelector(e.figmaId)) out.selector = e.selector;
        if (e.passes) out.passes = [e.passes];
        return out;
      })
    };
    if (state.fileKey) config.figmaFileKey = state.fileKey;
    return config;
  }

  function syncJson() { $('json').value = JSON.stringify(currentConfig(), null, 2); }

  $('applyJson').addEventListener('click', function () {
    try {
      applyConfig(JSON.parse($('json').value));
      $('jsonNote').textContent = 'Applied.';
    } catch (err) {
      $('jsonNote').textContent = 'Not valid JSON: ' + err.message;
    }
  });

  function applyConfig(config) {
    $('url').value = config.url || '';
    if (config.figmaFileKey) state.fileKey = config.figmaFileKey;
    if (config.viewport) {
      $('vw').value = config.viewport.width;
      $('vh').value = config.viewport.height;
      var match = config.viewport.width + 'x' + config.viewport.height;
      var known = Array.prototype.some.call($('preset').options, function (o) { return o.value === match; });
      $('preset').value = known ? match : 'custom';
      $('customSize').hidden = known;
    }
    state.elements = (config.elements || []).map(function (e) {
      return {
        figmaId: e.figmaId, nodeId: e.nodeId, name: e.name || e.figmaId,
        selector: e.selector || defaultSelector(e.figmaId),
        // A selector written in the config was chosen deliberately; only the
        // implied default is ours to replace.
        auto: !e.selector,
        passes: Array.isArray(e.passes) && e.passes.length === 1 ? e.passes[0] : ''
      };
    });
    state.section = config.section || '';
    renderElements();
    scheduleResolve();
  }

  /* ---------- startup: resolve the file in the background ---------- */

  async function start() {
    renderElements();
    try {
      var health = await api('/api/health');
      if (!health.hasToken) {
        note($('env'), '<b>No Figma token</b>Set FIGMA_TOKEN in your environment and ' +
          'restart tovi ui. It is read by the server and never sent to this page.', 'bad');
        $('fileLine').textContent = '';
        return;
      }
      if (health.fileKeyFromEnv) state.fileKey = health.fileKeyFromEnv;

      var loaded = await api('/api/config');
      if (loaded.config) applyConfig(loaded.config);

      await loadPages();
    } catch (err) {
      note($('env'), esc(err.message), 'bad');
    }
  }

  /** Fetch the file's pages so the page control is a choice, not a guess. */
  async function loadPages() {
    try {
      var data = await api('/api/layers?depth=1' +
        (state.fileKey ? '&file=' + encodeURIComponent(state.fileKey) : ''));
      state.pages = data.pages || [];
      $('lpage').innerHTML = '<option value="">All pages</option>' +
        state.pages.map(function (p) {
          return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
        }).join('');
      $('fileLine').innerHTML = 'Figma file: <b>' + esc(data.fileName) + '</b> · ' +
        state.pages.length + ' pages ' +
        '<button class="link" id="changeFile" type="button">use a different file</button>';
      $('changeFile').addEventListener('click', changeFile);
    } catch (err) {
      $('fileLine').innerHTML = '<span class="muted">Could not read the Figma file: ' +
        esc(err.message) + '</span> ' +
        '<button class="link" id="changeFile" type="button">use a different file</button>';
      $('changeFile').addEventListener('click', changeFile);
    }
  }

  function changeFile() {
    var key = window.prompt('Figma file key — the segment after /design/ in the file URL', state.fileKey);
    if (key === null) return;
    state.fileKey = key.trim();
    $('fileLine').textContent = 'Loading the Figma file…';
    loadPages();
  }

  /* ---------- layers ---------- */

  $('browse').addEventListener('click', async function () {
    var box = $('layers');
    box.innerHTML = '<p class="sub" style="margin-top:12px">Loading…</p>';
    var q = new URLSearchParams({
      file: state.fileKey,
      page: $('lpage').value,
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
      $('layers').innerHTML = '<p class="sub" style="margin-top:12px">No layers matched.</p>';
      return;
    }

    var rows = data.rows.slice(0, ROW_LIMIT).map(function (row) {
      // Figma reports no box for pages and for hidden or detached nodes. They
      // cannot be measured, so they cannot be compared.
      var measurable = row.width !== undefined && row.height !== undefined;
      var already = state.elements.some(function (e) { return e.nodeId === row.nodeId; });
      var size = measurable ? Math.round(row.width) + '×' + Math.round(row.height)
        : '<span class="tiny">no size</span>';

      return '<tr class="pick' + (measurable ? (already ? ' added' : '') : ' disabled') + '"' +
        ' data-node="' + esc(row.nodeId) + '" data-name="' + esc(row.name) + '"' +
        ' data-ok="' + (measurable ? '1' : '') + '">' +
        '<td>' + '&nbsp;'.repeat(row.depth * 3) + esc(row.name) +
          (already ? ' <span class="muted tiny">· picked</span>' : '') + '</td>' +
        '<td class="mono muted tiny">' + esc(row.type) + '</td>' +
        '<td class="mono muted tiny">' + size + '</td></tr>';
    }).join('');

    var caption = data.rows.length + ' layers';
    caption += data.rows.length > ROW_LIMIT
      ? ', showing the first ' + ROW_LIMIT + ' — narrow by page, name or depth.'
      : ' — click the ones you want checked.';

    $('layers').innerHTML =
      '<p class="sub" style="margin:12px 0 0">' + caption + '</p>' +
      '<div class="listpane"><table><thead><tr>' +
      '<th>Layer</th><th style="width:18%">Type</th><th style="width:18%">Size</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  $('layers').addEventListener('click', function (event) {
    var tr = event.target.closest('.pick');
    if (!tr) return;
    if (!tr.getAttribute('data-ok')) {
      window.alert(tr.dataset.name + ' has no size in Figma — pages, hidden layers and ' +
        'detached nodes cannot be measured, so there is nothing to compare. ' +
        'Pick a frame inside it instead.');
      return;
    }
    addElement(tr.dataset.node, tr.dataset.name);
    tr.classList.add('added');
  });

  /* ---------- selector probe ---------- */

  /**
   * Ask the page which selectors match, without running a check.
   *
   * A full run costs a browser launch and every Figma node; this costs one
   * page load and answers the only question that matters while authoring.
   */
  /**
   * Load the page once, then let it settle every selector it can.
   *
   * An element the user has not touched is probed with all of its candidates
   * and adopts whichever matches exactly one node. An element the user has
   * edited is probed with that selector alone and never rewritten — their
   * answer beats ours even when ours would have matched.
   */
  async function probeAndResolve() {
    var url = $('url').value.trim();
    if (!url || !state.elements.length) return;

    var wanted = [];
    state.elements.forEach(function (e) {
      var list = e.auto ? candidateSelectors(e.figmaId) : [e.selector];
      list.forEach(function (s) { if (s && wanted.indexOf(s) === -1) wanted.push(s); });
    });

    var data = await api('/api/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: url,
        viewport: { width: Number($('vw').value), height: Number($('vh').value) },
        selectors: wanted
      })
    });

    state.probe = {};
    data.matches.forEach(function (m) { state.probe[m.selector] = m; });

    state.elements.forEach(function (e) {
      if (!e.auto) return;
      var candidates = candidateSelectors(e.figmaId);
      // Exactly one match is the only outcome a check can use. Two matches is
      // as unusable as none, so it is not adopted.
      for (var i = 0; i < candidates.length; i += 1) {
        var hit = state.probe[candidates[i]];
        if (hit && hit.count === 1) { e.selector = candidates[i]; return; }
      }
      e.selector = candidates[0];
    });

    // Offer the page's own sections as completions, so a selector can be
    // chosen rather than guessed.
    $('selhints').innerHTML = (data.candidates || []).map(function (c) {
      return '<option value="' + esc(c.selector) + '">' + esc(c.describes) + '</option>';
    }).join('');

    renderElements();
  }

  /**
   * Resolve after a burst of layer picks, not during it.
   *
   * Clicking six layers should cost one page load, not six.
   */
  var resolveTimer = null;
  function scheduleResolve() {
    if (!$('url').value.trim()) return;
    if (resolveTimer) clearTimeout(resolveTimer);
    resolveTimer = setTimeout(function () {
      resolveTimer = null;
      probeAndResolve().catch(function () {
        // Silent: this is a convenience pass the user did not ask for. The
        // explicit button reports properly, and a run says what it could not
        // find. Failing loudly here would put an error on the screen for
        // someone who has not finished typing a URL.
      });
    }, 600);
  }

  $('test').addEventListener('click', async function () {
    var button = $('test');
    var url = $('url').value.trim();
    if (!url) { note($('env'), 'Enter the live URL first.', 'bad'); return; }

    button.disabled = true;
    button.textContent = 'Testing…';
    try {
      await probeAndResolve();
    } catch (err) {
      note($('env'), esc(err.message), 'bad');
    } finally {
      button.disabled = state.elements.length === 0;
      button.textContent = 'Test selectors';
    }
  });

  /* ---------- run ---------- */

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
    var byId = {};
    state.elements.forEach(function (e) { byId[e.figmaId] = e; });

    var missing = report.elements.filter(function (el) {
      return el.issues.some(function (i) { return i.property === 'missingInLive'; });
    });

    var banner = '';
    if (missing.length === report.elements.length && report.elements.length) {
      banner = '<div class="note bad"><b>None of these were found on the page</b>' +
        'Nothing was compared — TOVI could not locate the elements, so this says ' +
        'nothing yet about whether the build matches the design. It tried a ' +
        '<code>data-figma-id</code> attribute, then a class and an id named after each ' +
        'layer. Inspect the element you meant and put its real selector in the table ' +
        'above; <b>Test selectors</b> confirms a selector without spending a Figma call.' +
        '</div>';
    } else if (missing.length) {
      banner = '<div class="note"><b>' + missing.length + ' of ' + report.elements.length +
        ' were not found</b>' + missing.map(function (el) {
          var e = byId[el.figmaId];
          return '<code>' + esc(e ? e.selector : el.figmaId) + '</code>';
        }).join(', ') + '</div>';
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
        var e = byId[el.figmaId];
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

        return '<h2 style="margin-top:18px">' + esc(e ? e.name : el.figmaId) + '</h2>' +
          '<div class="scroll"><table><thead><tr>' +
          '<th></th><th>Property</th><th>Design</th><th>Live</th><th>Delta / tol</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>';
      }).join('');

    $('results').innerHTML = head +
      (sections || '<p class="sub" style="margin-top:14px">Everything matched within tolerance.</p>');
  }

  start();
})();
</script>
</body>
</html>
`;
