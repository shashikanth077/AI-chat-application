# Source for the technology and flow guide

`AI-Chat-Tech-and-Flow-Guide.html` (interactive) and `.pdf` (print) are generated from these files.
Edit the content here, then regenerate:

```bash
cd docs/guide-src
python3 build.py                     # writes ../AI-Chat-Tech-and-Flow-Guide.html
NODE_PATH=$(npm root -g) node render-pdf.cjs   # writes ../AI-Chat-Tech-and-Flow-Guide.pdf
```

- `flows.py`: the sequence flows (participants, arrows, explanations, code references).
- `static_diagrams.py`: architecture, stack, data model, guardrails, deployment and testing diagrams.
- `content.py`: the stack table, file map, configuration, API table and limits.
- `diagrams.py`: SVG helpers. Arrow kinds: `n` request, `ret` response, `db` database write, `err` failure.
