#!/usr/bin/env python3
"""Build every Woltron visual asset from source.

The mascot is an original robot K9 drawn parametrically in `robodog.py`
(pure SVG gradients, no filters, so cairosvg and browsers render it the same).
Each state swaps the LED eye glyphs, ear pose, jaw and head tilt, and the
mascot SVGs carry CSS visor animations (blink, glint, scan, standby pulse);
the PNGs are the static first frame. The head alone is used for the app icon,
favicon and tray. Food stickers on the banner are
Microsoft Fluent Emoji (MIT). The wordmark is Fredoka (OFL) converted to
outlines so every SVG is self-contained.

Requirements:  pip install cairosvg pillow fonttools
Usage:         python3 assets/scripts/build_assets.py      (from the repo root)
"""
import io
import os
import re
import sys

import cairosvg
from PIL import Image

sys.dont_write_bytecode = True  # keep assets/scripts free of __pycache__
import robodog  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'source', 'fluent-emoji')
FONT = os.path.join(ROOT, 'assets', 'source', 'fonts', 'Fredoka-Variable.ttf')
WEB = os.path.join(ROOT, 'apps', 'web', 'public')

# ── palette (apps/web/DESIGN.md) ───────────────────────────────────────────
FUR = '#f6efe9'
FUR_DEEP = '#efe4dc'
INK = '#2b1a33'
INK_2 = '#6a5870'
PLUM_DEEP = '#1b1220'


def out(*parts):
    p = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def read(name):
    with open(os.path.join(SRC, name)) as f:
        return f.read()


def write(path, text):
    with open(path, 'w') as f:
        f.write(text)


def render(svg, w, h=None):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=h or w)
    return Image.open(io.BytesIO(png)).convert('RGBA')


# ── SVG plumbing ─────────────────────────────────────────────────────────
def prefixed(svg, prefix):
    """Split a Fluent SVG into (body, defs) with every id namespaced."""
    for i in sorted(set(re.findall(r'id="([^"]+)"', svg)), key=len, reverse=True):
        svg = svg.replace(f'id="{i}"', f'id="{prefix}{i}"')
        svg = svg.replace(f'url(#{i})', f'url(#{prefix}{i})')
        svg = svg.replace(f'href="#{i}"', f'href="#{prefix}{i}"')
    inner = re.sub(r'^.*?<svg[^>]*>', '', svg, flags=re.S)
    inner = re.sub(r'</svg>\s*$', '', inner.strip())
    m = re.search(r'<defs>(.*)</defs>', inner, flags=re.S)
    return re.sub(r'<defs>.*</defs>', '', inner, flags=re.S), (m.group(1) if m else '')


class Defs:
    """Collects <defs> so each embedded emoji is defined once per document."""

    def __init__(self):
        self.parts, self.seen = [], set()

    def add(self, key, text):
        if key not in self.seen:
            self.seen.add(key)
            self.parts.append(text)

    def __str__(self):
        return ''.join(self.parts)


def emoji(defs, name, x, y, size, rotate=0, opacity=1.0):
    """Place a 32×32 Fluent emoji with its top-left at (x, y), `size` px wide."""
    key = name.replace('_color.svg', '')
    prefix = f'{key[:6]}_'
    body, d = prefixed(read(name), prefix)
    defs.add(prefix, d)
    rot = f' rotate({rotate} 16 16)' if rotate else ''
    op = f' opacity="{opacity}"' if opacity != 1 else ''
    return f'<g transform="translate({x} {y}) scale({size / 32}){rot}"{op}>{body}</g>'


def svg_doc(w, h, inner, defs='', size=None, viewbox=None):
    sw, sh = size or (w, h)
    vb = viewbox or f'0 0 {w} {h}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}" '
            f'viewBox="{vb}" fill="none">\n<defs>{defs}</defs>\n{inner}\n</svg>\n')


# ── mascot states (512×512 canvas) ─────────────────────────────────────────
STATES = robodog.STATES


def mascot_svg(state):
    """Animated mascot SVG (CSS in <style>); cairosvg ignores the animation, so the
    PNG rendered from the same file is the static first frame."""
    d, body = robodog.robodog(state)
    return svg_doc(512, 512, body, robodog.anim_style(state) + d)


def icon_head(x, y, size, **kw):
    """The simplified head (robodog.ICON_VIEWBOX) fitted into a size×size box at (x, y)."""
    vx, vy, vw, _ = (float(v) for v in robodog.ICON_VIEWBOX.split())
    k = size / vw
    _, body = robodog.head_icon(**kw)
    return f'<g transform="translate({x - vx * k:.2f} {y - vy * k:.2f}) scale({k:.4f})">{body}</g>'


# ── wordmark (Fredoka → outlines) ──────────────────────────────────────────
_font_cache = {}


def font(weight=650):
    if weight not in _font_cache:
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
        f = TTFont(FONT)
        _font_cache[weight] = instancer.instantiateVariableFont(f, {'wght': weight, 'wdth': 100})
    return _font_cache[weight]


def text_path(text, x, y, size, fill, weight=650, tracking=0.0):
    """Return (svg <path>, advance width) for `text` with baseline at y."""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    f = font(weight)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f['head'].unitsPerEm
    s = size / upm
    pen_x = 0.0
    paths = []
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        sp = SVGPathPen(gs)
        tp = TransformPen(sp, (s, 0, 0, -s, x + pen_x, y))
        gs[gname].draw(tp)
        paths.append(sp.getCommands())
        pen_x += gs[gname].width * s + tracking * size
    return f'<path d="{" ".join(paths)}" fill="{fill}"/>', pen_x - tracking * size


def wordmark(x, y, size, fill=INK, weight=650):
    """"Woltron" with the tennis ball as the "o" (as in the web app's <Wordmark/>).
    Returns (svg, advance) with the baseline at y."""
    w, wadv = text_path('W', x, y, size, fill, weight)
    r = size * 0.27
    gap = size * 0.03
    cx = x + wadv + gap + r
    ball = robodog.tennis_ball(round(cx, 1), round(y - size * 0.255, 1), round(r, 1), 'r_')
    rest, radv = text_path('ltron', cx + r + gap, y, size, fill, weight)
    return w + ball + rest, wadv + 2 * gap + 2 * r + radv


# ── app icon ───────────────────────────────────────────────────────────────
ICON_DEFS = f"""
<linearGradient id="i_bg" x1="0.2" y1="0" x2="0.8" y2="1">
  <stop offset="0" stop-color="#4a2f57"/><stop offset="0.55" stop-color="{INK}"/><stop offset="1" stop-color="{PLUM_DEEP}"/>
</linearGradient>
<radialGradient id="i_glow" cx="0.5" cy="0.46" r="0.5">
  <stop offset="0" stop-color="{robodog.BALL}" stop-opacity="0.42"/><stop offset="0.5" stop-color="{robodog.BALL}" stop-opacity="0.12"/>
  <stop offset="1" stop-color="{robodog.BALL}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="i_edge" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<radialGradient id="i_shadow"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
"""


def icon_svg(full_bleed=False, head=700):
    """1024 canvas: plum tile, chartreuse halo, the simplified head.
    full_bleed → maskable/apple-touch (square, head kept inside the safe zone)."""
    if full_bleed:
        bg = '<rect width="1024" height="1024" fill="url(#i_bg)"/>'
    else:
        bg = ('<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#i_bg)"/>'
              '<rect x="66" y="66" width="892" height="892" rx="198" fill="none" stroke="url(#i_edge)" stroke-width="4"/>')
    halo = '<circle cx="512" cy="500" r="430" fill="url(#i_glow)"/>'
    x = 512 - head / 2
    y = 512 - head / 2 + head * 0.02
    shadow = f'<ellipse cx="512" cy="{y + head * 0.97:.0f}" rx="{head * 0.32:.0f}" ry="{head * 0.05:.0f}" fill="url(#i_shadow)"/>'
    d, _ = robodog.head_icon()
    return svg_doc(1024, 1024, bg + halo + shadow + icon_head(x, y, head), d + ICON_DEFS)


def favicon_svg():
    """Simplified head, tight viewBox, crisp at 16–32 px."""
    d, body = robodog.head_icon(glow_eyes=False)
    return svg_doc(32, 32, body, d, viewbox=robodog.ICON_VIEWBOX)


def tray_template(size):
    """Monochrome macOS menu-bar template: black head, visor knocked out, eyes solid."""
    svg = svg_doc(32, 32, robodog.head_template(), viewbox=robodog.ICON_VIEWBOX)
    return render(svg, size * 4).resize((size, size), Image.LANCZOS)


# ── brand: logo + banner + stickers ────────────────────────────────────────
def logo_svg():
    H = 140
    head = 132
    word, adv = wordmark(head + 18, 104, 100)
    d, _ = robodog.head_icon()
    inner = icon_head(0, (H - head) / 2, head) + word
    return svg_doc(round(head + 18 + adv + 8), H, inner, d)


def banner_svg():
    W, H = 1280, 400
    defs = Defs()
    bg = f"""
<rect width="{W}" height="{H}" fill="{FUR}"/>
<circle cx="234" cy="200" r="240" fill="url(#b_sun)"/>
<path d="M0 330 C 240 290, 420 380, 700 340 S 1120 300, 1280 340 V400 H0Z" fill="{FUR_DEEP}"/>
"""
    stickers = [
        ('pizza_color.svg', 1086, 36, 92, 14, 1),
        ('steaming_bowl_color.svg', 1170, 150, 84, -10, 1),
        ('sushi_color.svg', 1076, 214, 76, 8, 1),
        ('taco_color.svg', 1000, 312, 60, -14, 1),
        ('dumpling_color.svg', 1180, 296, 64, 12, 1),
        ('bone_color.svg', 980, 52, 52, -24, 1),
    ]
    st = ''.join(emoji(defs, n, x, y, s, r, o) for n, x, y, s, r, o in stickers)
    md, mbody = robodog.robodog('happy', shadow=True)
    mascot = f'<g transform="translate(44 10) scale(0.74)">{mbody}</g>'
    word, adv = wordmark(470, 206, 150)
    tag, _ = text_path('Your very good food-fetching dog', 0, 0, 34, INK_2, weight=500)
    text = word + f'<g transform="translate(476 286)">{tag}</g>'
    under = (f'<path d="M478 236 Q {478 + adv / 2:.0f} 252 {470 + adv:.0f} 232" stroke="{INK}" stroke-width="13" '
             f'stroke-linecap="round" fill="none" opacity="0.9"/>'
             f'<path d="M478 236 Q {478 + adv / 2:.0f} 252 {470 + adv:.0f} 232" stroke="{robodog.BALL}" stroke-width="7" '
             f'stroke-linecap="round" fill="none"/>')
    bdefs = f"""<radialGradient id="b_sun" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="{robodog.BALL}" stop-opacity="0.55"/><stop offset="0.6" stop-color="{robodog.BALL}" stop-opacity="0.18"/><stop offset="1" stop-color="{robodog.BALL}" stop-opacity="0"/></radialGradient>"""
    return svg_doc(W, H, bg + st + mascot + under + text, md + bdefs + str(defs))


STICKERS = {
    'bone': 'bone_color.svg', 'bowl': 'bowl_with_spoon_color.svg', 'ramen': 'steaming_bowl_color.svg',
    'pizza': 'pizza_color.svg', 'sushi': 'sushi_color.svg', 'burger': 'hamburger_color.svg',
    'taco': 'taco_color.svg', 'dumpling': 'dumpling_color.svg', 'takeout': 'takeout_box_color.svg',
    'paws': 'paw_prints_color.svg',
}


# ── main ───────────────────────────────────────────────────────────────────
def save_png(img, *parts):
    img.save(out(*parts), optimize=True)


def main():
    # mascot
    for s in STATES:
        svg = mascot_svg(s)
        write(out('apps', 'web', 'public', 'mascot', f'{s}.svg'), svg)
        save_png(render(svg, 512), 'apps', 'web', 'public', 'mascot', f'{s}.png')

    # icons
    icon = icon_svg()
    write(out('assets', 'icon', 'icon.svg'), icon)
    big = render(icon, 1024)
    save_png(big, 'assets', 'icon', 'icon.png')
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        # tiny sizes use a fuller crop so the head isn't lost inside the tile's margin
        src = icon_svg(head=780) if size <= 32 else icon
        save_png(render(src, size), 'assets', 'icon', 'png', f'{size}x{size}.png')
    big.save(out('assets', 'icon', 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    try:
        big.save(out('assets', 'icon', 'icon.icns'))
    except Exception as e:  # pragma: no cover
        print('icns skipped:', e)
    save_png(render(icon, 192), 'apps', 'web', 'public', 'icons', 'icon-192.png')
    save_png(render(icon, 512), 'apps', 'web', 'public', 'icons', 'icon-512.png')
    save_png(render(icon_svg(full_bleed=True, head=600), 512), 'apps', 'web', 'public', 'icons', 'maskable-512.png')
    # apple touch: opaque, full-bleed (iOS rounds corners itself)
    apple = render(icon_svg(full_bleed=True, head=720), 180)
    bgc = Image.new('RGBA', apple.size, INK)
    bgc.alpha_composite(apple)
    save_png(bgc.convert('RGB'), 'apps', 'web', 'public', 'icons', 'apple-touch-icon.png')
    fav = favicon_svg()
    write(out('apps', 'web', 'public', 'favicon.svg'), fav)
    save_png(render(fav, 32), 'apps', 'web', 'public', 'icons', 'favicon-32.png')

    # tray
    save_png(render(fav, 16), 'assets', 'tray', 'tray.png')
    save_png(render(fav, 32), 'assets', 'tray', 'tray@2x.png')
    save_png(tray_template(16), 'assets', 'tray', 'trayTemplate.png')
    save_png(tray_template(32), 'assets', 'tray', 'trayTemplate@2x.png')

    # brand
    logo = logo_svg()
    write(out('assets', 'brand', 'logo.svg'), logo)
    w = int(re.search(r'width="(\d+)"', logo).group(1))
    save_png(render(logo, w * 4, 140 * 4), 'assets', 'brand', 'logo.png')
    banner = banner_svg()
    write(out('assets', 'brand', 'banner.svg'), banner)
    save_png(render(banner, 1280, 400), 'assets', 'brand', 'banner.png')
    save_png(render(banner, 2560, 800), 'assets', 'brand', 'banner@2x.png')
    for name, src in STICKERS.items():
        body, d = prefixed(read(src), 's_')
        svg = svg_doc(32, 32, body, d, size=(256, 256))
        write(out('assets', 'brand', 'stickers', f'{name}.svg'), svg)
        save_png(render(svg, 256), 'assets', 'brand', 'stickers', f'{name}.png')
    print('assets built')


if __name__ == '__main__':
    main()
