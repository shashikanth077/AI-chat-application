from diagrams import box, region, arrow, svg_wrap

def architecture():
    b = ''
    b += region(10, 10, 250, 380, 'Browser')
    b += box(28, 50, 214, 56, 'bl', 'React 19 + TypeScript', 'Vite build, App.tsx state')
    b += box(28, 124, 214, 56, 'bl', 'Services', 'fetch, SSE reader, CRUD')
    b += box(28, 198, 214, 56, 'bl', 'Demo API (optional)', 'VITE_DEMO builds only')
    b += box(28, 272, 214, 56, 'gy', 'localStorage', 'active chat id, theme, demo data')
    b += region(330, 10, 300, 380, 'FastAPI backend')
    b += box(348, 50, 264, 56, 'pu', 'Middleware + routes', 'headers, body cap, CORS, rate limits')
    b += box(348, 124, 264, 56, 'rd', 'Guardrails', 'secrets refused, PII masked, output guard')
    b += box(348, 198, 264, 56, 'pu', 'RAG + LangChain', 'rewrite, retriever, prompt, chain')
    b += box(348, 272, 264, 56, 'pu', 'Streaming + storage', 'SSE frames, SQLAlchemy sessions')
    b += region(680, 10, 230, 380, 'Data and providers')
    b += box(698, 50, 194, 56, 'gr', 'SQLite', 'source of truth: chats, docs, citations')
    b += box(698, 124, 194, 56, 'am', 'Qdrant (optional)', 'vectors; SQLite is the truth')
    b += box(698, 198, 194, 56, 'gy', 'Chat model', 'OpenAI or any compatible API')
    b += box(698, 272, 194, 56, 'gy', 'Embedder', 'fastembed bge-small, or hashing')
    b += arrow(242, 78, 346, 78, 'JSON / SSE', cls='ar')
    b += arrow(346, 152, 242, 152, None, dashed=True)
    b += arrow(612, 78, 696, 78, 'SQL')
    b += arrow(612, 152, 696, 152, 'vectors')
    b += arrow(612, 226, 696, 226, 'HTTPS')
    b += arrow(612, 300, 696, 300, 'local')
    return svg_wrap(b, 920, 400, 'Architecture: browser, backend, data and providers')

def stack():
    rows = [
      ('Client', 'bl', ['React 19', 'TypeScript', 'Vite 8', 'react-markdown + remark-gfm', 'lowlight (highlighting)', 'Vitest + Testing Library', 'Playwright (smoke)']),
      ('API', 'pu', ['FastAPI', 'Pydantic v2', 'Server-Sent Events', 'rate limits (in-house)', 'Guardrails (regex + checksums)', 'uvicorn']),
      ('AI and RAG', 'am', ['LangChain core + ChatOpenAI', 'LCEL chains and retrievers', 'OpenAI-compatible APIs', 'fastembed (bge-small)', 'Qdrant via langchain-qdrant', 'pypdf']),
      ('Data', 'gr', ['SQLAlchemy 2', 'SQLite (default)', 'Qdrant (optional)', 'numpy vectors']),
      ('Delivery', 'gy', ['GitHub Actions (ci.yml, deploy-demo.yml)', 'GitHub Pages (demo)', 'Docker Compose (Qdrant)', 'pytest 206 · Vitest 172']),
    ]
    b = ''
    y = 14
    for label, cls, items in rows:
        b += region(10, y, 900, 84, label)
        n = len(items)
        w = (880 - (n - 1) * 10) / n
        for i, it in enumerate(items):
            b += box(20 + i * (w + 10), y + 28, w, 44, cls, it, None, title_size=11.5)
        y += 96
    return svg_wrap(b, 920, y + 4, 'Technology stack by layer')

def data_model():
    b = ''
    b += region(10, 10, 300, 210, 'SQLite (source of truth)')
    b += box(24, 44, 272, 52, 'gr', 'conversations', 'id · title · created_at · updated_at')
    b += box(24, 116, 272, 52, 'gr', 'messages', 'id · conversation_id · role · content (masked) · client_id')
    b += box(24, 168, 272, 40, 'gr', 'message_sources', 'citation snapshot: n · filename · text · score')
    b += arrow(160, 96, 160, 116, '1 : many')
    b += region(330, 10, 300, 210, 'Documents')
    b += box(344, 44, 272, 52, 'gr', 'documents', 'id · filename · size · chunk_count · embedding_model')
    b += box(344, 116, 272, 52, 'gr', 'chunks', 'id · document_id · position · text · embedding (bytes)')
    b += arrow(480, 96, 480, 116, '1 : many')
    b += region(650, 10, 260, 210, 'Qdrant (optional)')
    b += box(664, 44, 232, 52, 'am', 'collection chunks_<model>', 'one per embedding model')
    b += box(664, 116, 232, 52, 'am', 'point (uuid5 of doc:position)', 'vector + payload')
    b += box(664, 168, 232, 40, 'am', 'payload', 'page_content · metadata{document_id, filename, position}')
    b += arrow(780, 96, 780, 116, 'one per chunk')
    b += region(10, 240, 900, 110, 'Rules that keep the stores in agreement')
    b += '<text class="s" x="30" y="268" font-size="12">1. SQLite decides what exists. Search ignores any point whose document is not stored.</text>'
    b += '<text class="s" x="30" y="288" font-size="12">2. Upload writes points first and removes them if the SQLite commit fails. Delete commits SQLite first.</text>'
    b += '<text class="s" x="30" y="308" font-size="12">3. Stored vectors are reused by reindex: nothing is embedded twice. Stored text is already masked.</text>'
    b += '<text class="s" x="30" y="328" font-size="12">4. Citation snapshots are copies, so an answer keeps its evidence after the document is deleted.</text>'
    return svg_wrap(b, 920, 370, 'Data model: SQLite tables and the Qdrant collection')

def guardrails():
    layers = [
      ('Browser', 'Input limits, double-submit guard, client checks', 'gy'),
      ('Rate limits and body cap', 'Per client, per minute; 2.5 MB; 413 and 429', 'am'),
      ('Pydantic validation', 'Roles, lengths, ids; 422 before any handler runs', 'pu'),
      ('Input guardrails', 'Secrets refused (422); personal data masked before storing', 'rd'),
      ('Server-owned context', 'History from the database, system prompt on the server', 'pu'),
      ('Output guardrails', 'Secrets and personal data masked while streaming', 'rd'),
      ('Storage and logs', 'Masked text only; log filter; no message text logged', 'gr'),
    ]
    b = ''
    y = 14
    for name, desc, cls in layers:
        b += box(20, y, 300, 46, cls, name, None, title_size=12)
        b += f'<text class="s" x="342" y="{y+28}" font-size="12">{desc}</text>'
        y += 58
    return svg_wrap(b, 920, y + 6, 'Guardrail layers from browser to storage')

def deployment():
    b = ''
    b += region(10, 10, 250, 330, 'Visitor browser')
    b += box(26, 54, 218, 60, 'gy', 'GitHub Pages', 'demo: static, no backend')
    b += box(26, 134, 218, 60, 'bl', 'Browser: full stack', 'frontend build, VITE_API_URL')
    b += region(300, 10, 330, 330, 'Your server (optional)')
    b += box(318, 54, 294, 52, 'pu', 'TLS proxy', 'the only public entry; sets X-Forwarded-For')
    b += box(318, 126, 294, 52, 'pu', 'uvicorn main:app', 'CORS_ORIGINS, TRUST_PROXY=true')
    b += box(318, 198, 294, 52, 'gr', 'SQLite file', 'on a persistent disk')
    b += box(318, 270, 294, 52, 'am', 'Qdrant container', '127.0.0.1 only, QDRANT_API_KEY')
    b += region(660, 10, 250, 330, 'External')
    b += box(676, 54, 218, 60, 'gy', 'Model provider', 'API key only in backend .env')
    b += box(676, 134, 218, 60, 'gy', 'GitHub', 'repo, Actions, Pages')
    b += arrow(244, 84, 316, 84, 'static demo')
    b += arrow(244, 164, 316, 152, 'HTTPS /api')
    b += arrow(612, 152, 674, 164, 'HTTPS')
    b += arrow(612, 210, 318, 224, None, dashed=True)
    b += arrow(612, 296, 318, 296, None, dashed=True)
    b += '<text class="s" x="30" y="370" font-size="12">Keys stay on the server. The demo has no key, no server and no shared data.</text>'
    return svg_wrap(b, 920, 390, 'Deployment topologies: demo and full stack')

def pyramid():
    levels = [
      (520, 'Manual + smoke', 'Playwright smoke test (full stack and demo); manual checklists', 'gy'),
      (430, 'Integration', 'FastAPI TestClient with SQLite and in-memory Qdrant; full suite on both', 'pu'),
      (340, 'Component', 'Vitest + Testing Library: composer, markdown, dialogs, sidebar', 'bl'),
      (250, 'Unit', 'Detectors and checksums, chunking, SSE parsing, citations, export', 'gr'),
    ]
    b = ''
    y = 16
    for width, name, desc, cls in levels:
        x = (920 - width) / 2
        b += box(x, y, width, 70, cls, name, None, title_size=13)
        b += f'<text class="s" x="460" y="{y+92}" text-anchor="middle" font-size="12">{desc}</text>'
        y += 100
    return svg_wrap(b, 920, y + 8, 'Testing pyramid')
