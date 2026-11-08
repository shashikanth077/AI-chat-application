"""SVG diagram helpers. Colours come from CSS classes so light and dark themes both work and print cleanly."""
import html

def esc(s):
    return html.escape(str(s), quote=True)

def box(x, y, w, h, cls, title, sub=None, title_size=13):
    out = f'<rect class="bx {cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="10"/>'
    cy = y + h / 2
    if sub:
        out += f'<text class="t" x="{x+w/2}" y="{cy-3}" text-anchor="middle" font-size="{title_size}" font-weight="700">{esc(title)}</text>'
        out += f'<text class="s" x="{x+w/2}" y="{cy+14}" text-anchor="middle" font-size="11">{esc(sub)}</text>'
    else:
        out += f'<text class="t" x="{x+w/2}" y="{cy+5}" text-anchor="middle" font-size="{title_size}" font-weight="700">{esc(title)}</text>'
    return out

def region(x, y, w, h, title):
    return (f'<rect class="rg" x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/>'
            f'<text class="rt" x="{x+14}" y="{y+20}" font-size="12" font-weight="700">{esc(title)}</text>')

def arrow(x1, y1, x2, y2, label=None, dashed=False, cls="ar"):
    dash = ' stroke-dasharray="6 4"' if dashed else ''
    out = f'<line class="{cls}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{dash} marker-end="url(#ah)"/>'
    if label:
        out += f'<text class="el" x="{(x1+x2)/2}" y="{(y1+y2)/2-6}" text-anchor="middle" font-size="10.5">{esc(label)}</text>'
    return out

def svg_wrap(body, w, h, label):
    return (f'<svg class="dg" viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="{esc(label)}">'
            f'<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M0,0 L10,5 L0,10 z" class="ahd"/></marker></defs>{body}</svg>')

def sequence(parts, steps, flow_id, width=760):
    """parts: [(key, label, css)], steps: [(src, dst, label, kind)] with kind in n|ret|db|err."""
    n = len(parts)
    left, right = 76, 76
    gap = (width - left - right) / (n - 1)
    xs = {k: left + i * gap for i, (k, _, _) in enumerate(parts)}
    row = 46
    top = 80
    h = top + len(steps) * row + 24
    out = []
    for k, label, css in parts:
        x = xs[k]
        out.append(f'<line class="ll" x1="{x}" y1="52" x2="{x}" y2="{h-10}"/>')
    for k, label, css in parts:
        x = xs[k]
        out.append(f'<rect class="bx {css}" x="{x-64}" y="8" width="128" height="40" rx="9"/>')
        out.append(f'<text class="t" x="{x}" y="33" text-anchor="middle" font-size="11.5" font-weight="700">{esc(label)}</text>')
    for i, (a, b, label, kind) in enumerate(steps):
        y = top + i * row
        cls = {'n': 'm-n', 'ret': 'm-ret', 'db': 'm-db', 'err': 'm-err'}[kind]
        out.append(f'<g class="st" data-step="{i}">')
        out.append(f'<circle class="badge" cx="20" cy="{y}" r="11"/><text class="bn" x="20" y="{y+4}" text-anchor="middle" font-size="11" font-weight="700">{i+1}</text>')
        if a == b:
            x = xs[a]
            out.append(f'<path class="{cls}" d="M{x},{y} h34 v14 h-34" fill="none" marker-end="url(#ah)"/>')
            out.append(f'<text class="ml {cls}" x="{x+40}" y="{y+4}" font-size="11">{esc(label)}</text>')
        else:
            x1, x2 = xs[a], xs[b]
            dashed = ' stroke-dasharray="6 4"' if kind == 'ret' else ''
            out.append(f'<line class="{cls}" x1="{x1}" y1="{y}" x2="{x2}" y2="{y}"{dashed} marker-end="url(#ah)"/>')
            mid = (x1 + x2) / 2
            out.append(f'<text class="ml {cls}" x="{mid}" y="{y-6}" text-anchor="middle" font-size="11.5">{esc(label)}</text>')
        out.append('</g>')
    return svg_wrap(''.join(out), width, h, f'Sequence diagram: {flow_id}')

