/**
 * TOVI — the UI's single HTML page.
 *
 * Kept as a string for the same reason report/html.ts is: `tsc` copies no
 * assets, so a separate .html file would not survive the build into `dist/`.
 *
 * No framework and no CDN. The page is served from loopback by a tool whose
 * whole claim is determinism; a build step and a network dependency would both
 * be a poor trade for what amounts to three forms and a table.
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
    --ground: #fbfbfc; --surface: #fff; --line: #e5e7eb;
    --ink: #16181d; --ink-2: #6b7280;
    --accent: #0052cc; --accent-soft: #e8f0fd;
    --error: #dc2626; --warn: #b45309; --ok: #15803d;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #0f1115; --surface: #161a21; --line: #272c36;
      --ink: #e6e8ec; --ink-2: #9aa2b1;
      --accent: #5d9dff; --accent-soft: #152439;
      --error: #f87171; --warn: #fbbf24; --ok: #4ade80;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; background: var(--ground); color: var(--ink);
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
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; min-height: 180px; }
  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  button {
    font: inherit; font-weight: 600; cursor: pointer;
    background: var(--accent); color: #fff; border: 0;
    border-radius: 6px; padding: 8px 16px;
  }
  button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
  button:disabled { opacity: .5; cursor: default; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--ink-2); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--line);
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .chip {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
  }
  .chip.error { background: var(--error); color: #fff; }
  .chip.warning { background: var(--warn); color: #fff; }
  .chip.info { background: var(--ink-2); color: #fff; }
  .verdict { font-size: 15px; font-weight: 700; }
  .verdict.pass { color: var(--ok); }
  .verdict.fail { color: var(--error); }
  .muted { color: var(--ink-2); }
  .note {
    border-left: 3px solid var(--warn); background: var(--accent-soft);
    padding: 10px 12px; border-radius: 0 6px 6px 0; font-size: 13px; margin-top: 12px;
  }
  .note.bad { border-left-color: var(--error); }
  .scroll { overflow-x: auto; }
  .pick { cursor: pointer; }
  .pick:hover { background: var(--accent-soft); }
  .stats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 6px; }
  .stat { font-size: 12px; color: var(--ink-2); }
  .stat b { display: block; font-size: 17px; color: var(--ink); font-variant-numeric: tabular-nums; }
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
    <h2>Run a check</h2>
    <div class="row">
      <div class="field">
        <label for="url">Live URL</label>
        <input id="url" type="url" placeholder="https://example.com/" autocomplete="off">
      </div>
      <div class="field">
        <label for="fileKey">Figma file key</label>
        <input id="fileKey" type="text" placeholder="AbCdEf123456" autocomplete="off">
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
    <div class="row" style="margin-top:12px">
      <div class="field">
        <label for="section">Section container (figmaId)</label>
        <input id="section" type="text" placeholder="hero" autocomplete="off">
      </div>
      <button id="run" type="button">Run check</button>
    </div>
    <p class="sub" style="margin-top:10px">
      Every element's position is measured relative to the section container, so
      Figma canvas coordinates and browser viewport coordinates are never compared
      directly. The section must appear in the elements below.
    </p>
  </section>

  <section class="panel">
    <h2>Elements</h2>
    <p class="sub" style="margin-bottom:8px">
      One entry per tagged element. <code>figmaId</code> is a label you choose and must match the
      element's <code>data-figma-id</code>; <code>nodeId</code> comes from Figma.
    </p>
    <textarea id="elements" spellcheck="false"></textarea>
  </section>

  <section class="panel">
    <h2>Find node ids</h2>
    <div class="row">
      <div class="field">
        <label for="lpage">Page (optional)</label>
        <input id="lpage" type="text" placeholder="Men's Basketball" autocomplete="off">
      </div>
      <div class="field">
        <label for="lsearch">Name contains (optional)</label>
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

  <section class="panel" id="resultPanel" hidden>
    <h2>Results</h2>
    <div id="results"></div>
  </section>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function note(target, message, bad) {
    target.innerHTML = '<div class="note' + (bad ? ' bad' : '') + '">' + esc(message) + '</div>';
  }

  async function api(path, init) {
    var res = await fetch(path, init);
    var body = await res.json();
    if (!res.ok) throw new Error(body && body.error ? body.error : 'Request failed');
    return body;
  }

  /* ---------- environment ---------- */

  async function loadEnv() {
    try {
      var health = await api('/api/health');
      if (!health.hasToken) {
        note($('env'),
          'No FIGMA_TOKEN in this environment. Set it and restart tovi ui — ' +
          'the token is read by the server and never sent to this page.', true);
      }
      if (health.fileKeyFromEnv) $('fileKey').value = health.fileKeyFromEnv;

      var loaded = await api('/api/config');
      if (loaded.config) applyConfig(loaded.config);
      else if (loaded.error) note($('env'), loaded.error, true);
    } catch (err) {
      note($('env'), err.message, true);
    }
  }

  function applyConfig(config) {
    $('url').value = config.url || '';
    $('fileKey').value = config.figmaFileKey || $('fileKey').value;
    $('section').value = config.section || '';
    if (config.viewport) {
      $('vw').value = config.viewport.width;
      $('vh').value = config.viewport.height;
    }
    $('elements').value = JSON.stringify(config.elements || [], null, 2);
  }

  function currentConfig() {
    var elements;
    try {
      elements = JSON.parse($('elements').value || '[]');
    } catch (err) {
      throw new Error('Elements is not valid JSON: ' + err.message);
    }
    return {
      url: $('url').value.trim(),
      figmaFileKey: $('fileKey').value.trim(),
      section: $('section').value.trim(),
      viewport: { width: Number($('vw').value), height: Number($('vh').value) },
      elements: elements
    };
  }

  /* ---------- layers ---------- */

  $('browse').addEventListener('click', async function () {
    var box = $('layers');
    box.innerHTML = '<p class="sub">Loading…</p>';
    var q = new URLSearchParams({
      file: $('fileKey').value.trim(),
      page: $('lpage').value.trim(),
      search: $('lsearch').value.trim(),
      depth: $('ldepth').value
    });
    try {
      var data = await api('/api/layers?' + q.toString());
      renderLayers(data);
    } catch (err) {
      note(box, err.message, true);
    }
  });

  function renderLayers(data) {
    if (!data.rows.length) {
      $('layers').innerHTML = '<p class="sub">No layers matched. Pages: ' +
        esc(data.pages.join(', ')) + '</p>';
      return;
    }
    var rows = data.rows.map(function (row) {
      var size = row.width !== undefined
        ? Math.round(row.width) + '×' + Math.round(row.height) : '—';
      return '<tr class="pick" data-node="' + esc(row.nodeId) + '" data-name="' + esc(row.name) + '">' +
        '<td class="mono">' + esc(row.nodeId) + '</td>' +
        '<td class="mono muted">' + esc(row.type) + '</td>' +
        '<td>' + '&nbsp;'.repeat(row.depth * 3) + esc(row.name) + '</td>' +
        '<td class="mono muted">' + size + '</td></tr>';
    }).join('');

    $('layers').innerHTML =
      '<p class="sub" style="margin:12px 0 0">' + esc(data.fileName) + ' — ' +
        data.rows.length + ' layers. Click a row to add it to the elements above.</p>' +
      '<div class="scroll"><table><thead><tr>' +
      '<th>node id</th><th>type</th><th>name</th><th>size</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    Array.prototype.forEach.call($('layers').querySelectorAll('.pick'), function (tr) {
      tr.addEventListener('click', function () { addElement(tr.dataset.node, tr.dataset.name); });
    });
  }

  /** Turn a layer name into a slug usable as both figmaId and data-figma-id. */
  function slugify(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'element';
  }

  function addElement(nodeId, name) {
    var list;
    try {
      list = JSON.parse($('elements').value || '[]');
    } catch (err) {
      alert('Elements is not valid JSON, so nothing was added: ' + err.message);
      return;
    }
    if (list.some(function (e) { return e.nodeId === nodeId; })) return;

    var base = slugify(name);
    var slug = base;
    var n = 2;
    while (list.some(function (e) { return e.figmaId === slug; })) { slug = base + '-' + n++; }

    list.push({ figmaId: slug, nodeId: nodeId });
    $('elements').value = JSON.stringify(list, null, 2);
    if (!$('section').value.trim()) $('section').value = slug;
  }

  /* ---------- run ---------- */

  $('run').addEventListener('click', async function () {
    var button = $('run');
    button.disabled = true;
    button.textContent = 'Running…';
    $('resultPanel').hidden = false;
    $('results').innerHTML = '<p class="sub">Launching Chromium and fetching the design…</p>';

    try {
      var data = await api('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: currentConfig() })
      });
      renderReport(data.report);
    } catch (err) {
      note($('results'), err.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Run check';
    }
  });

  function renderReport(report) {
    var s = report.summary;
    var head =
      '<p class="verdict ' + report.status + '">' + report.status.toUpperCase() + '</p>' +
      '<div class="stats">' +
        '<span class="stat"><b>' + s.elementsChecked + '</b>elements</span>' +
        '<span class="stat"><b>' + s.elementsPassed + '</b>passed</span>' +
        '<span class="stat"><b>' + s.elementsFailed + '</b>failed</span>' +
        '<span class="stat"><b>' + s.errorCount + '</b>errors</span>' +
        '<span class="stat"><b>' + s.warningCount + '</b>warnings</span>' +
      '</div>';

    var sections = report.elements.filter(function (el) { return el.issues.length; })
      .map(function (el) {
        var rows = el.issues.map(function (i) {
          var delta = i.delta === undefined ? '—'
            : (i.delta > 0 ? '+' : '') + i.delta +
              (i.tolerance === undefined ? '' : ' <span class="muted">/ ' + i.tolerance + '</span>');
          return '<tr>' +
            '<td><span class="chip ' + i.severity + '">' + i.severity + '</span></td>' +
            '<td class="mono">' + esc(i.property) + (i.detail ? '<br><span class="muted">' + esc(i.detail) + '</span>' : '') + '</td>' +
            '<td class="mono">' + esc(i.expected) + '</td>' +
            '<td class="mono">' + esc(i.actual) + '</td>' +
            '<td class="mono">' + delta + '</td></tr>';
        }).join('');

        return '<h2 style="margin-top:18px">' + esc(el.figmaId) + '</h2>' +
          '<div class="scroll"><table><thead><tr>' +
          '<th></th><th>property</th><th>design</th><th>live</th><th>delta / tol</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>';
      }).join('');

    $('results').innerHTML = head +
      (sections || '<p class="sub" style="margin-top:14px">Every element matched within tolerance.</p>');
  }

  loadEnv();
})();
</script>
</body>
</html>
`;
