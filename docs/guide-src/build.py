import html, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from diagrams import sequence, esc
from flows import FLOWS
from static_diagrams import architecture, stack, data_model, guardrails, deployment, pyramid
from content import STACK, FILES, ENV, ENDPOINTS, LIMITS

import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'AI-Chat-Tech-and-Flow-Guide.html')

SECTIONS = [
  ('overview', '1. System overview'),
  ('stack', '2. Technology stack'),
  ('repo', '3. Repository map'),
  ('data', '4. Data model and vector store'),
  ('flows', '5. End-to-end application flows'),
  ('security', '6. Security and guardrails'),
  ('deploy', '7. Deployment'),
  ('quality', '8. Testing and quality gates'),
  ('config', '9. Configuration reference'),
  ('api', '10. API reference'),
  ('limits', '11. Limits and verification status'),
]

def table(headers, rows, cls=''):
    h = ''.join(f'<th>{esc(x)}</th>' for x in headers)
    body = ''.join('<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in r) + '</tr>' for r in rows)
    return f'<div class="tw"><table class="{cls}"><tr>{h}</tr>{body}</table></div>'

def flow_block(i, f):
    parts = f['parts']
    svg = sequence(parts, [(a, b, lbl, k) for a, b, lbl, k, _, _ in f['steps']], f['id'])
    names = {k: lbl for k, lbl, _ in parts}
    items = []
    for n, (a, b, lbl, k, expl, code) in enumerate(f['steps']):
        items.append(
            f'<li class="si" data-step="{n}"><span class="sn">{n+1}</span>'
            f'<div><b>{esc(names[a])} → {esc(names[b])}</b>: {esc(lbl)}'
            f'<p>{esc(expl)}</p><code class="ref">{esc(code)}</code></div></li>')
    return f'''
<section class="flow" id="flow-{f["id"]}" data-flow="{f["id"]}">
  <h3>5.{i+1} {esc(f["title"])}</h3>
  <p class="sum">{esc(f["summary"])}</p>
  <div class="ctrl no-print">
    <button type="button" data-act="prev">◀ Prev</button>
    <button type="button" data-act="next">Next ▶</button>
    <button type="button" data-act="play">▶ Play</button>
    <button type="button" data-act="all">Show all</button>
    <span class="cnt"></span>
  </div>
  <div class="dwrap">{svg}</div>
  <ol class="steps">{''.join(items)}</ol>
</section>'''

def build():
    toc = ''.join(f'<li><a href="#{sid}">{esc(t)}</a></li>' for sid, t in SECTIONS)
    flow_list = ''.join(f'<li><a href="#flow-{f["id"]}">{esc(f["title"])}</a></li>' for f in FLOWS)
    flows_html = ''.join(flow_block(i, f) for i, f in enumerate(FLOWS))
    stack_rows = [list(r) for r in STACK]
    limits = ''.join(f'<li>{esc(x)}</li>' for x in LIMITS)

    body = f'''
<header class="cover">
  <p class="kicker">AI Chat application · reference guide</p>
  <h1>Technology stack and end-to-end application flows</h1>
  <p class="lead">How the application is built and how every important request travels through it, from a click in the browser, through the guardrails and the retrieval, to the model and back. Diagrams are drawn from the code in this repository.</p>
  <div class="cover-actions no-print">
    <button type="button" id="theme">Dark mode</button>
    <button type="button" id="expandAll">Expand flows</button>
  </div>
  <nav class="toc" aria-label="Contents">
    <h2>Contents</h2>
    <ol>{toc}</ol>
    <h3>Flows</h3>
    <ol class="flows-toc">{flow_list}</ol>
  </nav>
</header>

<section id="overview" class="sec">
  <h2>1. System overview</h2>
  <p>AI Chat is a full-stack chat application. A React and TypeScript interface streams answers from a FastAPI backend. The backend calls an OpenAI-compatible model through LangChain. Conversations and uploaded documents are stored in SQLite. Answers can be grounded in the user's documents and cite them. Document vectors can optionally live in Qdrant. A separate, fully simulated demo runs on GitHub Pages with no server.</p>
  <div class="dwrap">{architecture()}</div>
  <div class="grid3">
    <div class="card"><h4>Browser</h4><p>State and orchestration in <code>App.tsx</code>. Talks to the API with <code>fetch</code> and reads the SSE stream.</p></div>
    <div class="card"><h4>Backend</h4><p>Routes validate input, run the guardrails, do the retrieval and stream the reply. Saves what was shown.</p></div>
    <div class="card"><h4>Data and providers</h4><p>SQLite is the source of truth. Qdrant, the model and the embedder are replaceable parts behind small interfaces.</p></div>
  </div>
</section>

<section id="stack" class="sec">
  <h2>2. Technology stack</h2>
  <p>The stack by layer. The table below it is searchable: type a name to filter.</p>
  <div class="dwrap">{stack()}</div>
  <div class="filter no-print"><label for="stackq">Filter the table</label><input id="stackq" type="search" placeholder="e.g. qdrant, react, langchain" /></div>
  <div class="tw"><table id="stackt"><tr><th>Layer</th><th>Technology</th><th>Version or requirement</th><th>Purpose</th><th>Where in the repo</th></tr>
  {''.join('<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in r) + '</tr>' for r in stack_rows)}
  </table></div>
  <div class="card"><h4>Why these choices</h4><ul>
    <li><b>FastAPI + Pydantic</b>: typed validation at the boundary; the route never runs with bad input.</li>
    <li><b>SSE, not WebSockets</b>: one-way token streams over plain HTTP; the browser's built-in reader is enough.</li>
    <li><b>SQLite first</b>: one file, no server, transactional, and fast enough for a single application. PostgreSQL is a configuration change later.</li>
    <li><b>LangChain where it adds a standard interface</b>: the model, the chain, the retrievers and the vector store. Chunking, the prompt escaping and the citations stay in our code, because they are security- and demo-critical.</li>
    <li><b>Qdrant as an option, not a requirement</b>: it adds a service. The default keeps the application runnable with no extra infrastructure.</li>
    <li><b>Vitest and pytest</b>: the tests run without keys or network, so CI is deterministic.</li>
  </ul></div>
</section>

<section id="repo" class="sec">
  <h2>3. Repository map</h2>
  {table(['Path', 'What it does'], FILES)}
</section>

<section id="data" class="sec">
  <h2>4. Data model and vector store</h2>
  <p>Two sets of data with one rule: SQLite decides what exists. Qdrant only answers "which chunks are close to this question".</p>
  <div class="dwrap">{data_model()}</div>
</section>

<section id="flows" class="sec">
  <h2>5. End-to-end application flows</h2>
  <p>Each flow is a sequence diagram. Use <b>Next</b> or <b>Play</b> to highlight one step at a time, or click a step in the list. In the PDF, every step is shown. Arrow colours: blue is a request, grey dashed is a response, green is a database write, red is a failure path.</p>
  {flows_html}
</section>

<section id="security" class="sec">
  <h2>6. Security and guardrails</h2>
  <p>Defence in layers. Each layer stops one class of problem, and none is treated as complete on its own.</p>
  <div class="dwrap">{guardrails()}</div>
  {table(['Concern', 'Control', 'Where'], [
    ('Secrets typed or pasted', 'Refused with 422; the text returns to the box; nothing stored or sent', 'guardrails/checks.py'),
    ('Personal data typed or uploaded', 'Masked before storing, chunking and embedding', 'guardrails/checks.py, routers/documents.py'),
    ('Secrets or personal data in a reply', 'Masked while streaming; the saved reply is the masked one', 'guardrails/checks.py: guard_stream'),
    ('Prompt injection through documents', 'Escaped <sources> block in the user turn; system prompt says sources are untrusted; a warning on upload', 'services/rag.py'),
    ('Floods and oversized bodies', 'Rate limits (429) and a 2.5 MB cap (413)', 'guardrails/hardening.py'),
    ('Leaking provider errors', 'Fixed, friendly messages; upstream text never returned', 'services/llm.py: _translate'),
    ('Browser attacks on replies', 'Markdown without raw HTML, images or javascript: links; security headers on the API', 'Markdown.tsx, hardening.py'),
    ('Vector store exposure', 'Qdrant bound to localhost, API key required by compose; no per-user access control', 'docker-compose.yml'),
    ('No authentication', 'Not built. Required before public deployment', 'docs/DEPLOY.md'),
  ])}
</section>

<section id="deploy" class="sec">
  <h2>7. Deployment</h2>
  <p>Two targets. The demo is safe to publish because it has nothing to protect. The full stack holds a key and user data and is run by you, behind TLS, with the settings below.</p>
  <div class="dwrap">{deployment()}</div>
  <div class="card"><h4>Full-stack checklist</h4><ol>
    <li>Set <code>OPENAI_API_KEY</code> and <code>OPENAI_MODEL</code> in the server's environment, never in the frontend build.</li>
    <li>Set <code>CORS_ORIGINS</code> to the exact frontend origin.</li>
    <li>If Qdrant: set <code>QDRANT_API_KEY</code>, run <code>docker compose up -d qdrant</code>, set <code>VECTOR_STORE=qdrant</code> and <code>QDRANT_URL</code>, then run <code>tools/reindex_qdrant.py --prune</code>.</li>
    <li>Keep the database and the Qdrant volume on persistent disks; back up both.</li>
    <li>Set <code>TRUST_PROXY=true</code> only if your own proxy overwrites <code>X-Forwarded-For</code>.</li>
    <li>Run the smoke test against the deployed site before announcing it.</li>
  </ol></div>
</section>

<section id="quality" class="sec">
  <h2>8. Testing and quality gates</h2>
  <div class="dwrap">{pyramid()}</div>
  {table(['Gate', 'Command', 'What it proves', 'Count'], [
    ('Backend tests (SQLite)', 'pytest -q', 'Routes, guardrails, streaming, RAG, storage', '206'),
    ('Backend tests (Qdrant)', 'TEST_VECTOR_STORE=qdrant pytest -q', 'The same suite against an in-memory Qdrant', '206'),
    ('Frontend lint and types', 'npm run lint; npx tsc -b', 'Static checks', '—'),
    ('Frontend tests', 'npm test', 'Components, parsers, the demo port and its parity with the Python guardrails', '172'),
    ('Production build', 'npm run build', 'Bundles compile; demo variant with VITE_DEMO', '—'),
    ('Browser smoke', 'node e2e/smoke.cjs <url> [demo]', 'Send, regenerate, refresh, export, shortcuts, citations', '—'),
  ])}
  <div class="card"><h4>CI pipeline</h4><p><code>ci.yml</code> runs the backend and frontend gates on every push and pull request. <code>deploy-demo.yml</code> builds the demo on pushes to <code>main</code> and publishes it to GitHub Pages.</p></div>
</section>

<section id="config" class="sec">
  <h2>9. Configuration reference</h2>
  {table(['Variable', 'Where', 'Meaning'], ENV)}
</section>

<section id="api" class="sec">
  <h2>10. API reference</h2>
  {table(['Method', 'Path', 'Database effect', 'Notes'], ENDPOINTS)}
  <p class="small">Interactive documentation is served by FastAPI at <code>/docs</code> when the backend runs (not served in production, and not covered by the security header rules).</p>
</section>

<section id="limits" class="sec">
  <h2>11. Limits and verification status</h2>
  <p>What this guide and the test suite establish, and what they do not. Read this before relying on a claim above.</p>
  <ul class="limits">{limits}</ul>
</section>
<footer>AI Chat application · generated from the repository's code and manifests · see docs/AI-Chat-Flows-Guide.html for the code-level walkthrough</footer>
'''
    return body

CSS = r'''
:root { --bg:#f6f7fb; --surface:#fff; --text:#15181f; --muted:#5b6170; --line:#dfe3ec; --accent:#2563eb; --accent-soft:#e8efff;
  --c-bl:#2563eb; --c-pu:#7c3aed; --c-gr:#15803d; --c-am:#b45309; --c-rd:#b91c1c; --c-gy:#64748b;
  --soft-bl:#e8efff; --soft-pu:#f1ebff; --soft-gr:#e6f6ec; --soft-am:#fdf3e1; --soft-rd:#fdecec; --soft-gy:#eef1f5; --code:#0b1020; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg:#0f1420; --surface:#171e2d; --text:#e6e9f0; --muted:#9aa4b5; --line:#2a3347; --accent:#6ea8ff; --accent-soft:#1d2a47;
  --c-bl:#7fb0ff; --c-pu:#b49bff; --c-gr:#4ade80; --c-am:#fbbf24; --c-rd:#f87171; --c-gy:#94a3b8;
  --soft-bl:#1d2a47; --soft-pu:#261f3f; --soft-gr:#14301f; --soft-am:#3a2f12; --soft-rd:#3b1d22; --soft-gy:#1e2635; --code:#070a14; } }
:root[data-theme="dark"] {
  --bg:#0f1420; --surface:#171e2d; --text:#e6e9f0; --muted:#9aa4b5; --line:#2a3347; --accent:#6ea8ff; --accent-soft:#1d2a47;
  --c-bl:#7fb0ff; --c-pu:#b49bff; --c-gr:#4ade80; --c-am:#fbbf24; --c-rd:#f87171; --c-gy:#94a3b8;
  --soft-bl:#1d2a47; --soft-pu:#261f3f; --soft-gr:#14301f; --soft-am:#3a2f12; --soft-rd:#3b1d22; --soft-gy:#1e2635; --code:#070a14; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
main, body > header, body > footer { max-width: 980px; margin: 0 auto; padding: 0 22px; }
header.cover { padding-top: 36px; border-bottom: 3px solid var(--accent); margin-bottom: 26px; }
.kicker { color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; margin: 0; }
h1 { font-size: 30px; line-height: 1.2; margin: 6px 0 10px; }
h2 { font-size: 22px; margin: 0 0 12px; color: var(--text); border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 18px; margin: 28px 0 6px; }
h4 { margin: 0 0 6px; font-size: 15px; }
.lead { color: var(--muted); font-size: 16px; }
.sec { margin: 34px 0; break-inside: auto; }
.cover-actions { display:flex; gap:8px; margin: 14px 0; }
button { font: inherit; font-size: 13px; padding: 6px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 8px; cursor: pointer; }
button:hover { border-color: var(--accent); }
.toc { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 20px; margin: 18px 0 8px; }
.toc h2 { border: 0; font-size: 16px; margin: 0 0 4px; }
.toc h3 { font-size: 14px; margin: 12px 0 4px; color: var(--muted); }
.toc ol { margin: 0; padding-left: 20px; columns: 2; column-gap: 28px; }
.toc.flows-toc, ol.flows-toc { columns: 1; }
.toc a, a { color: var(--accent); text-decoration: none; }
.toc a:hover { text-decoration: underline; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; margin: 14px 0; break-inside: avoid; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.dwrap { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 14px 0; overflow-x: auto; break-inside: avoid; }
svg.dg { display: block; min-width: 640px; height: auto; }
svg .bx { stroke-width: 1.5; }
svg .bx.bl { fill: var(--soft-bl); stroke: var(--c-bl); } svg .bx.pu { fill: var(--soft-pu); stroke: var(--c-pu); }
svg .bx.gr { fill: var(--soft-gr); stroke: var(--c-gr); } svg .bx.am { fill: var(--soft-am); stroke: var(--c-am); }
svg .bx.rd { fill: var(--soft-rd); stroke: var(--c-rd); } svg .bx.gy { fill: var(--soft-gy); stroke: var(--c-gy); }
svg .t { fill: var(--text); } svg .s { fill: var(--muted); }
svg .rg { fill: none; stroke: var(--line); stroke-width: 1.5; stroke-dasharray: 4 4; } svg .rt { fill: var(--muted); }
svg .ar { stroke: var(--muted); stroke-width: 1.6; fill: none; } svg .el { fill: var(--muted); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; }
svg .ahd { fill: var(--muted); }
svg .ll { stroke: var(--line); stroke-width: 1.5; stroke-dasharray: 5 4; }
svg .m-n { stroke: var(--c-bl); stroke-width: 1.8; fill: none; } svg .m-n.ml { fill: var(--c-bl); stroke: none; }
svg .m-ret { stroke: var(--muted); stroke-width: 1.6; fill: none; } svg .m-ret.ml { fill: var(--muted); stroke: none; }
svg .m-db { stroke: var(--c-gr); stroke-width: 1.8; fill: none; } svg .m-db.ml { fill: var(--c-gr); stroke: none; }
svg .m-err { stroke: var(--c-rd); stroke-width: 1.8; fill: none; } svg .m-err.ml { fill: var(--c-rd); stroke: none; }
svg path.ahd, svg marker path { fill: var(--muted); }
svg .badge { fill: var(--surface); stroke: var(--accent); stroke-width: 1.5; } svg .bn { fill: var(--accent); }
svg .ml { paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
svg .st { transition: opacity .2s; }
.flow.playing svg .st:not(.on) { opacity: .22; }
.flow svg .st.on .badge { fill: var(--accent); } .flow svg .st.on .bn { fill: #fff; }
.ctrl { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin: 6px 0; }
.ctrl .cnt { color: var(--muted); font-size: 13px; margin-left: 6px; }
.steps { list-style: none; padding: 0; margin: 10px 0 0; }
.si { display:flex; gap: 12px; padding: 8px 10px; border-radius: 10px; border: 1px solid transparent; }
.si.on { background: var(--accent-soft); border-color: var(--accent); }
.sn { flex: 0 0 26px; height: 26px; border-radius: 50%; background: var(--accent); color:#fff; font-weight:700; font-size: 12px; display:flex; align-items:center; justify-content:center; }
.si p { margin: 2px 0 4px; color: var(--text); font-size: 14px; }
.ref { font-size: 12px; color: var(--muted); }
code { background: var(--soft-gy); padding: 1px 5px; border-radius: 5px; font-size: 0.9em; }
.sum { color: var(--muted); }
.tw { overflow-x: auto; margin: 10px 0; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--soft-gy); font-weight: 700; }
.filter { display:flex; gap:10px; align-items:center; margin: 8px 0; }
.filter input { flex: 1; font: inherit; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); }
.limits li { margin: 6px 0; }
.small { font-size: 13px; color: var(--muted); }
footer { color: var(--muted); font-size: 12px; text-align:center; margin: 40px auto 30px; }
@media (max-width: 720px) { .grid3 { grid-template-columns: 1fr; } .toc ol { columns: 1; } h1 { font-size: 24px; } }
@media print {
  body { background:#fff; color:#111; font-size: 11pt; }
  :root { --bg:#fff; --surface:#fff; --text:#111; --muted:#444; --line:#cfd5e0; }
  .no-print { display: none !important; }
  .sec { break-before: auto; }
  section.sec > h2, section.flow > h3 { break-after: avoid; }
  .flow { break-inside: auto; }
  .dwrap { break-inside: avoid; }
  .si { break-inside: avoid; }
  .flow.playing svg .st:not(.on) { opacity: 1; }
  .si.on { background: none; border-color: transparent; }
  .steps { display: block; }
  svg.dg { min-width: 0; }
  a { color: #1d4ed8; }
  button { display: none; }
}
'''

JS = r'''
(function () {
  var root = document.documentElement;
  var theme = null;
  try { theme = localStorage.getItem('guide-theme'); } catch (e) {}
  function applyTheme() {
    var dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'dark' : 'light';
    var b = document.getElementById('theme'); if (b) b.textContent = dark ? 'Light mode' : 'Dark mode';
  }
  var t = document.getElementById('theme');
  if (t) t.onclick = function () {
    theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('guide-theme', theme); } catch (e) {}
    applyTheme();
  };
  applyTheme();

  document.querySelectorAll('section.flow').forEach(function (flow) {
    var steps = Array.prototype.slice.call(flow.querySelectorAll('.st'));
    var items = Array.prototype.slice.call(flow.querySelectorAll('.si'));
    var cnt = flow.querySelector('.cnt');
    var cur = -1, timer = null;
    function show(i) {
      cur = Math.max(-1, Math.min(steps.length - 1, i));
      steps.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
      items.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
      flow.classList.toggle('playing', cur >= 0);
      if (cnt) cnt.textContent = cur >= 0 ? 'Step ' + (cur + 1) + ' of ' + steps.length : 'Overview: all steps';
      if (cur >= 0 && items[cur]) items[cur].scrollIntoView({ block: 'nearest' });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    flow.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.act;
        if (a === 'next') { stop(); show(cur + 1 >= steps.length ? 0 : cur + 1); }
        if (a === 'prev') { stop(); show(cur <= 0 ? steps.length - 1 : cur - 1); }
        if (a === 'all') { stop(); show(-1); }
        if (a === 'play') {
          if (timer) { stop(); return; }
          if (cur >= steps.length - 1) show(-1);
          timer = setInterval(function () {
            if (cur >= steps.length - 1) { stop(); return; }
            show(cur + 1);
          }, 1300);
        }
      });
    });
    items.forEach(function (it) {
      it.addEventListener('click', function () { stop(); show(+it.dataset.step); });
    });
    show(-1);
  });

  var expand = document.getElementById('expandAll');
  if (expand) expand.onclick = function () {
    document.querySelectorAll('section.flow').forEach(function (f) {
      var b = f.querySelector('[data-act="all"]'); if (b) b.click();
    });
  };

  var q = document.getElementById('stackq');
  if (q) q.addEventListener('input', function () {
    var needle = q.value.trim().toLowerCase();
    document.querySelectorAll('#stackt tr').forEach(function (tr, i) {
      if (i === 0) return;
      tr.style.display = !needle || tr.textContent.toLowerCase().indexOf(needle) !== -1 ? '' : 'none';
    });
  });
})();
'''

doc = f'''<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Chat: Technology Stack and End-to-End Flows</title>
<style>{CSS}</style>
</head>
<body>
<main>
{build()}
</main>
<script>{JS}</script>
</body>
</html>
'''
open(OUT, 'w').write(doc)
print('wrote', OUT, len(doc))
