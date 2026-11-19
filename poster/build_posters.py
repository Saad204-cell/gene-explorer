"""Generates three self-contained poster HTML files with inline, data-driven SVG figures."""
import math, os, sys
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else "."

MAG, ORA, YEL, TEA = "#E63986", "#FF8A3D", "#FFD23F", "#1EC8B0"
INDIGO = "#141235"

# ---------------------------------------------------------------- helpers
def hex2rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def rgb2hex(c): return "#%02X%02X%02X" % tuple(int(round(v)) for v in c)
def mix(a, b, t):
    a, b = hex2rgb(a), hex2rgb(b); return rgb2hex([a[i] + (b[i]-a[i])*t for i in range(3)])
def diverging(v, low, mid, high, vmax=2.0):
    t = max(-1, min(1, v / vmax))
    return mix(mid, high, t) if t >= 0 else mix(mid, low, -t)
f = lambda x: f"{x:.1f}"

# ---------------------------------------------------------------- data
rng = np.random.default_rng(11)
N_ROWS, N_COLS = 14, 8           # 14 genes x 8 samples (4 control | 4 treated)
rows = []
for kind, n in (("up", 5), ("down", 5), ("flat", 4)):
    for _ in range(n):
        ctrl_mu, trt_mu = {"up": (-1.1, 1.5), "down": (1.0, -1.4), "flat": (rng.normal(0, .5), rng.normal(0, .5))}[kind]
        rows.append(np.r_[rng.normal(ctrl_mu, .38, 4), rng.normal(trt_mu, .38, 4)])
rows = np.array(rows); rng.shuffle(rows)

def upgma(X):
    """Average-linkage clustering. Returns (leaf_order, nodes) where nodes are (left, right, height)."""
    n = len(X); D = np.linalg.norm(X[:, None] - X[None], axis=2)
    clusters = {i: [i] for i in range(n)}; nodes = {}; nxt = n
    while len(clusters) > 1:
        keys = list(clusters); best = None
        for i, a in enumerate(keys):
            for b in keys[i+1:]:
                d = D[np.ix_(clusters[a], clusters[b])].mean()
                if best is None or d < best[0]: best = (d, a, b)
        d, a, b = best
        nodes[nxt] = (a, b, d); clusters[nxt] = clusters.pop(a) + clusters.pop(b); nxt += 1
    root = nxt - 1
    def order(k): return [k] if k < n else order(nodes[k][0]) + order(nodes[k][1])
    return order(root), nodes, root

LEAF_ORDER, NODES, ROOT = upgma(rows)
HEAT = rows[LEAF_ORDER]

# volcano points
NV = 340
fc = np.clip(rng.normal(0, 1.25, NV), -4.6, 4.6)
pv = np.clip((np.abs(fc) ** 1.65) * 1.05 * rng.uniform(.45, 1.25, NV) + rng.exponential(.35, NV), 0, 9.4)

# ---------------------------------------------------------------- figure builders
def heatmap(x0, y0, cw, ch, dw, low, mid, high, line, gap=2, cond=(None, None), lw=2.5):
    """Heat map with a row dendrogram on its left. Returns svg string."""
    out = []
    hx = x0 + dw + 8                       # heat map left edge
    top = y0 + (16 if cond[0] else 0)
    if cond[0]:                             # condition colour bar over the columns
        for j in range(N_COLS):
            out.append(f'<rect x="{f(hx + j*cw)}" y="{f(y0)}" width="{f(cw-gap)}" height="8" fill="{cond[0] if j < 4 else cond[1]}"/>')
    for i, r in enumerate(HEAT):
        for j, v in enumerate(r):
            out.append(f'<rect x="{f(hx + j*cw)}" y="{f(top + i*ch)}" width="{f(cw-gap)}" height="{f(ch-gap)}" fill="{diverging(v, low, mid, high)}"/>')
    # dendrogram
    n = N_ROWS; maxh = NODES[ROOT][2]
    ypos = {leaf: top + k*ch + (ch-gap)/2 for k, leaf in enumerate(LEAF_ORDER)}
    xpos = {leaf: x0 + dw for leaf in LEAF_ORDER}
    def place(k):
        if k < n: return
        a, b, h = NODES[k]; place(a); place(b)
        ypos[k] = (ypos[a] + ypos[b]) / 2; xpos[k] = x0 + dw * (1 - h / maxh)
    place(ROOT)
    segs = []
    for k, (a, b, h) in NODES.items():
        x = xpos[k]
        segs.append(f"M{f(xpos[a])} {f(ypos[a])}H{f(x)}V{f(ypos[b])}H{f(xpos[b])}")
    segs.append(f"M{f(xpos[ROOT])} {f(ypos[ROOT])}H{f(x0-10)}")
    out.append(f'<path d="{" ".join(segs)}" fill="none" stroke="{line}" stroke-width="{lw}" stroke-linejoin="miter"/>')
    return "\n".join(out)

def volcano(x0, y0, w, h, up, down, grey, axis, grey_op=.55, r=4.6, thr=None):
    out = []
    X = lambda v: x0 + (v + 4.8) / 9.6 * w
    Y = lambda v: y0 + h - v / 9.6 * h
    thr = thr or axis
    # axes + ticks
    out.append(f'<path d="M{f(x0)} {f(y0)}V{f(y0+h)}H{f(x0+w)}" fill="none" stroke="{axis}" stroke-width="2.5"/>')
    ticks = []
    for v in (-4, -2, 0, 2, 4): ticks.append(f"M{f(X(v))} {f(y0+h)}v8")
    for v in (2, 4, 6, 8): ticks.append(f"M{f(x0)} {f(Y(v))}h-8")
    out.append(f'<path d="{" ".join(ticks)}" stroke="{axis}" stroke-width="2.5"/>')
    # significance thresholds
    out.append(f'<path d="M{f(X(-1))} {f(y0)}V{f(y0+h)}M{f(X(1))} {f(y0)}V{f(y0+h)}M{f(x0)} {f(Y(1.3))}H{f(x0+w)}" stroke="{thr}" stroke-width="1.6" stroke-dasharray="6 6" opacity=".8"/>')
    sig_up = (fc > 1) & (pv > 1.3); sig_dn = (fc < -1) & (pv > 1.3); ns = ~(sig_up | sig_dn)
    for i in np.where(ns)[0]:
        out.append(f'<circle cx="{f(X(fc[i]))}" cy="{f(Y(pv[i]))}" r="{r-1.2}" fill="{grey}" opacity="{grey_op}"/>')
    for mask, col in ((sig_dn, down), (sig_up, up)):
        for i in np.where(mask)[0]:
            out.append(f'<circle cx="{f(X(fc[i]))}" cy="{f(Y(pv[i]))}" r="{r}" fill="{col}" opacity=".92"/>')
    return "\n".join(out)

def helix(x0, y0, length, amp, turns, vertical, c1, c2, rungs, sw=5, rung_w=4, back_op=.55):
    """DNA double helix. vertical: runs down from (x0,y0) with x0 = centre line."""
    steps = 240; pa, pb = [], []
    for s in range(steps + 1):
        t = s / steps * length; ph = 2 * math.pi * turns * s / steps
        a, b = amp * math.sin(ph), amp * math.sin(ph + math.pi)
        pa.append((x0 + a, y0 + t) if vertical else (x0 + t, y0 + a))
        pb.append((x0 + b, y0 + t) if vertical else (x0 + t, y0 + b))
    path = lambda pts: "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    out = [f'<path d="{path(pb)}" fill="none" stroke="{c2}" stroke-width="{sw}" stroke-linecap="round" opacity="{back_op}"/>']
    n_r = int(turns * 10)
    for k in range(1, n_r):
        s = k / n_r; ph = 2 * math.pi * turns * s; t = s * length
        a, b = amp * math.sin(ph), amp * math.sin(ph + math.pi)
        if abs(a - b) < amp * .35: continue
        col = rungs[k % len(rungs)]
        if vertical: out.append(f'<line x1="{f(x0+a)}" y1="{f(y0+t)}" x2="{f(x0+b)}" y2="{f(y0+t)}" stroke="{col}" stroke-width="{rung_w}" stroke-linecap="round"/>')
        else: out.append(f'<line x1="{f(x0+t)}" y1="{f(y0+a)}" x2="{f(x0+t)}" y2="{f(y0+b)}" stroke="{col}" stroke-width="{rung_w}" stroke-linecap="round"/>')
    out.append(f'<path d="{path(pa)}" fill="none" stroke="{c1}" stroke-width="{sw}" stroke-linecap="round"/>')
    return "\n".join(out)

TREE = (0, [(1.0, [(1.2, [(.8, [(1.1, None), (.9, None)]), (1.6, None)]), (1.3, [(.9, None), (1.0, None)])]),
            (1.6, [(1.0, [(.8, None), (1.2, None)]), (1.9, None)])])
def tree(x0, y0, w, h, line, tips, sw=2.5, r=5.5):
    """Rectangular phylogenetic tree, root on the left."""
    leaves = []
    def count(n): return 1 if n[1] is None else sum(count(c) for c in n[1])
    def depth(n): return n[0] + (0 if n[1] is None else max(depth(c) for c in n[1]))
    nl, md = count(TREE), depth(TREE)
    sx = w / md; sy = h / (nl - 1); segs = []; idx = [0]
    def draw(n, xs):
        x = xs + n[0] * sx
        if n[1] is None:
            y = y0 + idx[0] * sy; idx[0] += 1; leaves.append((x, y)); return y
        ys = [draw(c, x) for c in n[1]]
        segs.append(f"M{f(x)} {f(min(ys))}V{f(max(ys))}")
        for c, yc in zip(n[1], ys): segs.append(f"M{f(x)} {f(yc)}H{f(x + c[0]*sx)}")
        return sum(ys) / len(ys)
    yr = draw(TREE, x0)
    segs.append(f"M{f(x0-12)} {f(yr)}H{f(x0)}")
    out = [f'<path d="{" ".join(segs)}" fill="none" stroke="{line}" stroke-width="{sw}"/>']
    for k, (x, y) in enumerate(leaves):
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="{tips[k % len(tips)]}"/>')
    return "\n".join(out)

ICON = {
    "chat": '<path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M8 10.5h8"/>',
    "code": '<polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/>',
    "case": '<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8.5 7V4.5h7V7M3 12.5h18"/>',
}
def icon(name, color, size=26):
    return (f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>')

def cellstrip(colors, w=18, h=18, gap=3):
    cells = "".join(f'<rect x="{k*(w+gap)}" y="0" width="{w}" height="{h}" fill="{c}"/>' for k, c in enumerate(colors))
    return f'<svg width="{len(colors)*(w+gap)-gap}" height="{h}" aria-hidden="true">{cells}</svg>'

def cellstrip_v(colors, w=16, h=16, gap=4):
    cells = "".join(f'<rect x="0" y="{k*(h+gap)}" width="{w}" height="{h}" fill="{c}"/>' for k, c in enumerate(colors))
    return f'<svg width="{w}" height="{len(colors)*(h+gap)-gap}" aria-hidden="true">{cells}</svg>'

# ---------------------------------------------------------------- shared text
MAST = ("MUHAMMAD SAAD JAVED", "BIOINFORMATICS ANALYST")
HEADLINE = "Your Data, Analyzed."
COVER = "STUCK WITH YOUR DATA?"
SUB = "I’ll analyze it and turn it into results you can publish and defend."
SERVICES = [
    ("GENE EXPRESSION", MAG, "DIFFERENTIAL EXPRESSION", "RNA-seq, DEGs, heat maps and volcano plots"),
    ("GENOMICS", ORA, "SEQUENCING DATA", "NGS, genomes and variant analysis"),
    ("MOLECULAR", TEA, "SEQUENCE &amp; PROTEIN", "alignment, phylogenetics and structure analysis"),
    ("STATISTICS", YEL, "STATS &amp; FIGURES", "lab results, graphs and publication-ready plots"),
]
STRIP = ["Publication-ready figures", "Methods write-up", "Results explained"]
AFFIL = "BS Biotechnology, Riphah International University, Faisalabad"
CONTACT = [("chat", "WhatsApp 0349-1740382"), ("code", "github.com/Saad204-cell"),
           ("case", "linkedin.com/in/muhammad-saad-javed-840bb1295")]

def page(title, fonts, css, body):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?{fonts}&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1080px;height:1350px;overflow:hidden}}
.poster{{position:relative;width:1080px;height:1350px;overflow:hidden}}
.ic{{flex:none;display:block}}
{css}
</style>
</head>
<body>
{body}
</body>
</html>
"""

def write(name, html):
    with open(os.path.join(OUT, name), "w") as fh: fh.write(html)

# ================================================================ V1  Midnight Journal
def v1():
    BG, WHITE, MUTED = INDIGO, "#FFFFFF", "#C9C6E8"
    line = "#8F8BC4"
    svg = f'''<svg class="art" width="1080" height="440" viewBox="0 0 1080 440" aria-hidden="true">
  <rect x="610" y="0" width="414" height="276" fill="#1C1A45"/>
  <rect x="610" y="0" width="414" height="276" fill="none" stroke="#3A3775" stroke-width="2"/>
  {volcano(652, 22, 348, 226, MAG, TEA, "#8B88A8", line, thr="#5D5A99")}
  {heatmap(56, 8, 46, 24, 84, TEA, "#2A275C", MAG, line, cond=(TEA, MAG))}
  {helix(566, -10, 460, 22, 3.6, True, "#FFFFFF", "#8F8BC4", [MAG, ORA, YEL, TEA], sw=4.5, rung_w=3.5)}
  {tree(830, 334, 172, 96, line, [MAG, ORA, TEA, YEL], sw=2.5, r=5.5)}
</svg>'''
    cards = "".join(f'''
    <article class="card" style="--c:{c}">
      <span class="tag" style="background:{c}">{tag}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
    </article>''' for tag, c, title, desc in SERVICES)
    contact = "".join(f'<li>{icon(i, YEL)}<span>{t}</span></li>' for i, t in CONTACT)
    css = f"""
body{{background:{BG}}}
.poster{{background:{BG};color:{WHITE};font-family:Inter,sans-serif;padding:44px 56px 0}}
.mast{{display:flex;justify-content:space-between;align-items:baseline;font-size:20px;font-weight:600;letter-spacing:.16em}}
.mast .sep{{color:{MAG};padding:0 .4em}}
.mast .rt{{color:{MUTED}}}
.rule{{height:0;border-top:1.5px solid #5D5A99;margin-top:14px}}
.rule2{{height:0;border-top:1.5px solid #5D5A99;margin-top:4px}}
h1{{font-family:'Playfair Display',serif;font-weight:700;font-size:104px;line-height:1;letter-spacing:-.015em;margin:24px 0 22px -4px}}
h1 em{{font-style:italic;color:{YEL}}}
.hero{{position:relative;height:490px;margin:0 -56px}}
.art{{position:absolute;left:0;top:0}}
.cover{{position:absolute;left:40px;bottom:0;width:740px;background:{BG};padding:16px 24px 16px 28px;border-left:8px solid {MAG}}}
.cover h2{{font-family:'Bebas Neue',sans-serif;font-weight:400;font-size:84px;line-height:.92;letter-spacing:.01em;white-space:nowrap}}
.cover p{{font-family:'Playfair Display',serif;font-style:italic;font-size:28px;line-height:1.3;color:{MUTED};margin-top:10px;text-wrap:balance}}
.services{{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}}
.card{{background:#1C1A45;border-top:5px solid var(--c);padding:16px 20px 18px}}
.tag{{display:inline-block;color:{BG};font-size:18px;font-weight:800;letter-spacing:.1em;padding:4px 10px 3px;line-height:1.2}}
.card h3{{font-family:'Bebas Neue',sans-serif;font-weight:400;font-size:40px;line-height:1;letter-spacing:.02em;margin-top:12px}}
.card p{{font-size:19px;line-height:1.35;color:{MUTED};margin-top:6px}}
.strip{{display:flex;justify-content:center;gap:18px;align-items:center;margin-top:26px;padding:11px 0;border-top:1.5px solid #3A3775;border-bottom:1.5px solid #3A3775;font-size:21px;font-weight:600;letter-spacing:.02em}}
.strip .dot{{color:{ORA}}}
footer{{display:flex;justify-content:space-between;align-items:center;margin-top:26px}}
.affil{{width:330px;font-size:20px;line-height:1.4;color:{MUTED};border-left:5px solid {TEA};padding-left:16px}}
.issue{{border:2px solid {WHITE};padding:6px 18px;width:600px}}
.issue ul{{list-style:none}}
.issue li{{display:flex;align-items:center;gap:12px;font-size:20px;line-height:1.25;padding:6px 0;white-space:nowrap}}
.issue li+li{{border-top:1px solid #3A3775}}
"""
    body = f'''<div class="poster">
  <header class="mast"><span>{MAST[0]}<span class="sep">|</span><span class="rt">{MAST[1]}</span></span></header>
  <div class="rule"></div><div class="rule2"></div>
  <h1>Your Data, <em>Analyzed.</em></h1>
  <section class="hero">
    {svg}
    <div class="cover"><h2>{COVER}</h2><p>{SUB}</p></div>
  </section>
  <section class="services">{cards}
  </section>
  <div class="strip">{f'<span class="dot">•</span>'.join(f"<span>{s}</span>" for s in STRIP)}</div>
  <footer>
    <p class="affil">{AFFIL}</p>
    <div class="issue"><ul>{contact}</ul></div>
  </footer>
</div>'''
    write("poster-v1-midnight.html", page("Your Data, Analyzed", "family=Bebas+Neue&family=Inter:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,700;1,400;1,700", css, body))

# ================================================================ V2  Lab Paper
def v2():
    BG, INK, INK2 = "#F4EFE6", INDIGO, "#3E3A63"
    PANEL = "#E9E2D4"
    MAG_D, TEA_D = "#C2185B", "#0E8F7E"   # darker accents for thin marks on paper
    line = "#3E3A63"
    svg = f'''<svg class="art" width="1080" height="420" viewBox="0 0 1080 420" aria-hidden="true">
  <rect x="0" y="0" width="1080" height="420" fill="{PANEL}"/>
  {volcano(96, 28, 380, 262, MAG_D, TEA_D, "#9E98AE", line, grey_op=.6, thr="#8A84A6")}
  {heatmap(574, 22, 44, 20, 78, TEA_D, "#FFFFFF", MAG_D, line, cond=(TEA_D, MAG_D), gap=2)}
  {tree(842, 334, 160, 72, line, [MAG_D, ORA, TEA_D, INK], sw=2.2, r=4.5)}
  {helix(-10, 336, 560, 14, 4.5, False, INK, "#7D7899", [MAG_D, ORA, TEA_D, YEL], sw=3.6, rung_w=3)}
</svg>'''
    items = "".join(f'''
    <article class="item">
      <span class="tag" style="background:{c}">{tag}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
    </article>''' for tag, c, title, desc in SERVICES)
    contact = "".join(f'<li>{icon(i, INK)}<span>{t}</span></li>' for i, t in CONTACT)
    cells = cellstrip_v([TEA_D, "#5BB8A8", "#A9D9CF", "#F2B3CB", "#E5739D", MAG_D], w=14, h=14, gap=4)
    css = f"""
body{{background:{BG}}}
.poster{{background:{BG};color:{INK};font-family:Inter,sans-serif;padding:40px 56px 0}}
.mast{{text-align:center;font-size:20px;font-weight:700;letter-spacing:.2em}}
.mast .sep{{color:{MAG_D};padding:0 .5em}}
.rule{{border-top:4px solid {INK};margin-top:14px}}
.rule2{{border-top:1.5px solid {INK};margin-top:4px}}
h1{{font-family:'DM Serif Display',serif;font-weight:400;font-size:104px;line-height:1;text-align:center;letter-spacing:-.012em;margin:24px 0 24px;white-space:nowrap}}
h1 em{{font-style:italic;color:{MAG_D}}}
.hero{{position:relative;height:512px;margin:0 -56px}}
.art{{position:absolute;left:0;top:0}}
.cover{{position:absolute;left:56px;top:378px;right:56px}}
.cover h2{{display:inline-block;font-family:'Oswald',sans-serif;font-weight:700;font-size:62px;line-height:1;letter-spacing:.01em;background:{INK};color:#FFFFFF;padding:10px 24px 12px;white-space:nowrap;box-shadow:10px 10px 0 {MAG}}}
.cover p{{font-family:'DM Serif Display',serif;font-style:italic;font-size:28px;line-height:1.2;color:{INK};margin-top:18px;white-space:nowrap}}
.services{{display:grid;grid-template-columns:1fr 1fr;margin-top:24px;border-top:1.5px solid {INK}}}
.item{{padding:18px 28px 18px 0;border-bottom:1.5px solid {INK}}}
.item:nth-child(even){{padding:18px 0 18px 28px;border-left:1.5px solid {INK}}}
.tag{{display:inline-block;color:{INK};font-size:18px;font-weight:800;letter-spacing:.1em;padding:4px 10px 3px;line-height:1.2}}
.item h3{{font-family:'Oswald',sans-serif;font-weight:700;font-size:34px;line-height:1.05;letter-spacing:.01em;margin-top:12px}}
.item p{{font-size:20px;line-height:1.35;color:{INK2};margin-top:6px}}
.strip{{display:flex;justify-content:center;gap:16px;margin-top:28px;padding:13px 0;background:{INK};color:#FFFFFF;font-size:21px;font-weight:600;margin-left:-56px;margin-right:-56px}}
.strip .dot{{color:{YEL}}}
footer{{display:flex;justify-content:space-between;align-items:center;margin-top:28px}}
.affil{{width:330px;font-size:20px;line-height:1.4;color:{INK2};border-top:4px solid {INK};padding-top:10px}}
.issue{{border:2px solid {INK};width:600px;background:#FFFFFF;display:flex}}
.issue .bar{{display:flex;align-items:center;padding:10px 12px;border-right:1.5px solid {INK}}}
.issue ul{{list-style:none;padding:6px 16px}}
.issue li{{display:flex;align-items:center;gap:12px;font-size:20px;line-height:1.25;padding:5px 0;white-space:nowrap}}
"""
    body = f'''<div class="poster">
  <header class="mast">{MAST[0]}<span class="sep">|</span>{MAST[1]}</header>
  <div class="rule"></div><div class="rule2"></div>
  <h1>Your Data, <em>Analyzed.</em></h1>
  <section class="hero">
    {svg}
    <div class="cover"><h2>{COVER}</h2><p data-bg="{BG}">{SUB}</p></div>
  </section>
  <section class="services">{items}
  </section>
  <div class="strip">{f'<span class="dot">•</span>'.join(f"<span>{s}</span>" for s in STRIP)}</div>
  <footer>
    <p class="affil">{AFFIL}</p>
    <div class="issue"><div class="bar">{cells}</div><ul>{contact}</ul></div>
  </footer>
</div>'''
    write("poster-v2-paper.html", page("Your Data, Analyzed", "family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;600;700;800&family=Oswald:wght@600;700", css, body))

# ================================================================ V3  Deep Teal Blocks
def v3():
    BG, WHITE, MUTED, DARK = "#0B2C30", "#FFFFFF", "#BFE3DE", "#10152B"
    line = "#7FB5AE"
    top_svg = f'''<svg class="side" width="300" height="190" viewBox="0 0 300 190" aria-hidden="true">
  {tree(30, 12, 250, 166, line, [MAG, ORA, YEL, TEA], sw=2.8, r=7)}
</svg>'''
    hero_svg = f'''<svg class="art" width="1080" height="470" viewBox="0 0 1080 470" aria-hidden="true">
  <rect x="40" y="0" width="340" height="300" fill="#082226"/>
  <rect x="40" y="0" width="340" height="300" fill="none" stroke="#2C5A5F" stroke-width="2"/>
  {volcano(80, 24, 278, 238, MAG, TEA, "#7E9A98", line, grey_op=.6, thr="#3F7178", r=4.2)}
  {heatmap(448, 0, 60, 24, 90, TEA, "#14393E", MAG, line, cond=(TEA, MAG), gap=3, lw=2.8)}
  {helix(46, 366, 300, 22, 2.6, False, WHITE, line, [MAG, ORA, YEL, TEA], sw=4.5, rung_w=3.5)}
</svg>'''
    tiles = "".join(f'''
    <article class="tile" style="background:{c}">
      <span class="tag" style="color:{c}">{tag}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
    </article>''' for tag, c, title, desc in SERVICES)
    contact = "".join(f'<li>{icon(i, YEL)}<span>{t}</span></li>' for i, t in CONTACT)
    grad = f"linear-gradient(90deg,{TEA},{YEL} 40%,{ORA} 65%,{MAG})"
    css = f"""
body{{background:{BG}}}
.poster{{background:{BG};color:{WHITE};font-family:Inter,sans-serif;padding:40px 40px 0}}
.poster::before{{content:"";position:absolute;left:0;top:0;right:0;height:10px;background:{grad}}}
.mast{{font-size:20px;font-weight:700;letter-spacing:.18em;margin-top:6px}}
.mast .sep{{color:{YEL};padding:0 .45em}}
.mast .rt{{color:{MUTED}}}
.rule{{border-top:1.5px solid #3F7178;margin-top:14px}}
.head{{position:relative;height:212px}}
h1{{font-family:'Playfair Display',serif;font-weight:800;font-size:102px;line-height:.98;letter-spacing:-.02em;margin-top:14px}}
h1 em{{display:block;font-style:italic;color:{YEL}}}
.side{{position:absolute;right:0;top:22px}}
.hero{{position:relative;height:458px;margin:6px -40px 0}}
.art{{position:absolute;left:0;top:0}}
.cover{{position:absolute;right:40px;bottom:0;width:650px;background:{BG};padding:16px 0 0 26px;border-top:8px solid {YEL};text-align:right}}
.cover h2{{font-family:'Bebas Neue',sans-serif;font-weight:400;font-size:80px;line-height:.92;letter-spacing:.01em;white-space:nowrap}}
.cover p{{font-family:'Playfair Display',serif;font-style:italic;font-size:28px;line-height:1.3;color:{MUTED};margin-top:10px;text-wrap:balance}}
.services{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}}
.tile{{color:{DARK};padding:16px 20px 18px}}
.tag{{display:inline-block;background:{DARK};font-size:18px;font-weight:800;letter-spacing:.1em;padding:4px 10px 3px;line-height:1.2}}
.tile h3{{font-family:'Bebas Neue',sans-serif;font-weight:400;font-size:42px;line-height:1;letter-spacing:.02em;margin-top:12px}}
.tile p{{font-size:19px;line-height:1.35;font-weight:600;margin-top:4px}}
.strip{{display:flex;justify-content:center;gap:16px;margin:18px -40px 0;padding:12px 0;background:{YEL};color:{DARK};font-size:21px;font-weight:700}}
footer{{display:flex;justify-content:space-between;align-items:center;margin-top:18px}}
.affil{{width:360px;font-size:20px;line-height:1.4;color:{MUTED};border-left:6px solid {TEA};padding-left:16px}}
.issue{{border:2px solid {MUTED};padding:6px 18px;width:600px;background:#082226}}
.issue ul{{list-style:none}}
.issue li{{display:flex;align-items:center;gap:12px;font-size:20px;line-height:1.25;padding:6px 0;white-space:nowrap}}
.issue li+li{{border-top:1px solid #2C5A5F}}
"""
    body = f'''<div class="poster">
  <header class="mast">{MAST[0]}<span class="sep">|</span><span class="rt">{MAST[1]}</span></header>
  <div class="rule"></div>
  <div class="head">
    <h1>Your Data, <em>Analyzed.</em></h1>
    {top_svg}
  </div>
  <section class="hero">
    {hero_svg}
    <div class="cover"><h2>{COVER}</h2><p>{SUB}</p></div>
  </section>
  <section class="services">{tiles}
  </section>
  <div class="strip">{f'<span>•</span>'.join(f"<span>{s}</span>" for s in STRIP)}</div>
  <footer>
    <p class="affil">{AFFIL}</p>
    <div class="issue"><ul>{contact}</ul></div>
  </footer>
</div>'''
    write("poster-v3-teal.html", page("Your Data, Analyzed", "family=Bebas+Neue&family=Inter:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,800;1,400;1,800", css, body))

v1(); v2(); v3()
print("ok")
