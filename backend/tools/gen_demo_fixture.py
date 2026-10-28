import json, sys
sys.path.insert(0, ".")
from services.chunking import chunk_text
from services.embeddings import HashingEmbedder
long = " ".join(f"Sentence number {i} talks about cats, kernels and the FastAPI backend." for i in range(40))
noPunct = "word " * 400
texts = [
  "Short note.",
  "First paragraph about cats.\n\nSecond paragraph about dogs and the Moon.\r\n\n  Third\t\tone  spaced.",
  long, noPunct,
  "Para one is here. " * 30 + "\n\n" + "Para two follows. " * 30,
]
e = HashingEmbedder()
cases = []
for t in texts:
    chunks = chunk_text(t)
    cases.append({"text": t, "chunks": chunks, "vectors": [[round(float(x), 6) for x in e.embed_documents([c])[0]] for c in chunks[:2]]})
q = ["How long do cats sleep?", "FastAPI streaming backend", "ÄÖ café 123 THE"]
queries = [{"text": s, "vector": [round(float(x), 6) for x in e.embed_query(s)]} for s in q]
json.dump({"cases": cases, "queries": queries}, open("/home/user/AI-chat-application/frontend/src/demo/parity.fixture.json", "w"))
