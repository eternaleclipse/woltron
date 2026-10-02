#!/usr/bin/env python3
"""Build every Woltron visual asset from source.

Woltie (the mascot) is composed from Microsoft Fluent Emoji "Dog face" (MIT):
the source SVG is split into layers (face, tongue, mouth, ears, eyes, nose)
and recombined per state with hand-drawn expression overlays plus Fluent
props (magnifier, Zzz, bone, droplet, sparkles, heart). The wordmark is
Fredoka (OFL) converted to outlines so every SVG is self-contained.

Requirements:  pip install cairosvg pillow fonttools
Usage:         python3 assets/scripts/build_assets.py      (from the repo root)
"""
import io
import os
import re

import cairosvg
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'source', 'fluent-emoji')
FONT = os.path.join(ROOT, 'assets', 'source', 'fonts', 'Fredoka-Variable.ttf')
WEB = os.path.join(ROOT, 'apps', 'web', 'public')

# ── palette ──────────────────────────────────────────────────────────────
TANGERINE = '#FF7A1A'
TANGERINE_LIGHT = '#FFB057'
CORAL = '#FF5A3C'
CREAM = '#FFF4E4'
CREAM_DEEP = '#FFE6C7'
INK = '#2A1A14'
FACE_INK = '#3B2A2F'


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


# ── dog-face layers (by 1-based line numbers of the Fluent source) ─────────
_dog_src = read('dog_face_color.svg')
_dog_lines = _dog_src.split('\n')
_, DOG_DEFS = prefixed(_dog_src, 'd_')


def _layer(*ranges):
    return ''.join('\n'.join(_dog_lines[a - 1:b]) for a, b in ranges).replace('url(#', 'url(#d_')


FACE = _layer((2, 20))           # head + muzzle
TONGUE = _layer((21, 29))
MOUTH = _layer((30, 34))
EAR_L = _layer((35, 39), (66, 68))
EAR_R = _layer((40, 43))
EYES = _layer((44, 56))
NOSE = _layer((57, 62))
HILITE = _layer((63, 65))

MASCOT_DEFS = DOG_DEFS + '''
<filter id="m_shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
<radialGradient id="m_blush" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FF6F7D" stop-opacity="0.75"/><stop offset="1" stop-color="#FF6F7D" stop-opacity="0"/></radialGradient>
<radialGradient id="m_eye" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#5F5254"/><stop offset="1" stop-color="#2A1E24"/></radialGradient>
'''

BLUSH = ('<ellipse cx="9.3" cy="17.2" rx="2.1" ry="1.3" fill="url(#m_blush)"/>'
         '<ellipse cx="22.6" cy="17.2" rx="2.1" ry="1.3" fill="url(#m_blush)"/>')


def stroke(d, w=0.62, color=FACE_INK):
    return (f'<path d="{d}" stroke="{color}" stroke-width="{w}" stroke-linecap="round" '
            f'stroke-linejoin="round" fill="none"/>')


# eye centres in the source: left (12.96, 13.5), right (18.95, 13.5)
HAPPY_EYES = stroke('M11.85 14.1 Q12.96 12.0 14.07 14.1') + stroke('M17.84 14.1 Q18.95 12.0 20.06 14.1')
CLOSED_EYES = stroke('M11.8 13.2 Q12.96 14.7 14.12 13.2') + stroke('M17.8 13.2 Q18.95 14.7 20.1 13.2')


def puppy_eyes():
    s = ''
    for cx in (12.96, 18.95):
        s += f'<ellipse cx="{cx}" cy="13.7" rx="1.25" ry="1.55" fill="url(#m_eye)"/>'
        s += f'<circle cx="{cx - 0.4}" cy="13.1" r="0.5" fill="#fff"/>'
        s += f'<circle cx="{cx + 0.45}" cy="14.35" r="0.22" fill="#fff" opacity="0.9"/>'
    return s + stroke('M11.6 10.9 L14.0 10.1', 0.5) + stroke('M20.3 10.9 L17.9 10.1', 0.5)


SIDE_EYES = f'<g transform="translate(0.45 0.3)">{EYES}</g>'
SAD_MOUTH = stroke('M15.97 20.6 V22.4', 0.55) + stroke('M13.3 24.6 Q15.97 21.9 18.64 24.6', 0.6)
SNIFF_MOUTH = (stroke('M15.97 20.6 V22.3', 0.55) +
               stroke('M14.1 23.2 Q15.0 24.1 15.97 22.4 Q16.9 24.1 17.85 23.2', 0.55))
SNIFF_LINES = (stroke('M12.9 18.9 Q12.1 18.2 12.7 17.4', 0.4, '#B9714C') +
               stroke('M11.6 19.7 Q10.4 18.5 11.4 17.0', 0.4, '#B9714C') +
               stroke('M10.3 20.5 Q8.7 18.8 10.1 16.6', 0.4, '#B9714C'))


def dog(eyes=EYES, mouth=MOUTH, tongue=False, blush=True, ears=None, extra=''):
    """Dog face in its native 32-unit space."""
    el, er = EAR_L, EAR_R
    if ears == 'droop':
        el = f'<g transform="translate(-0.2 1.1) rotate(-5 8 5)">{EAR_L}</g>'
        er = f'<g transform="translate(0.2 1.1) rotate(5 24 5)">{EAR_R}</g>'
    elif ears == 'perk':
        el = f'<g transform="translate(0 -0.7)">{EAR_L}</g>'
        er = f'<g transform="translate(0 -0.7)">{EAR_R}</g>'
    return ''.join([FACE, TONGUE if tongue else '', mouth, el, er,
                    BLUSH if blush else '', eyes, NOSE, HILITE, extra])


def place_dog(body, x=32, y=38, scale=14, tilt=0):
    rot = f' rotate({tilt} 16 18)' if tilt else ''
    return f'<g transform="translate({x} {y}) scale({scale}){rot}">{body}</g>'


def svg_doc(w, h, inner, defs='', size=None):
    sw, sh = size or (w, h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}" '
            f'viewBox="0 0 {w} {h}" fill="none">\n<defs>{defs}</defs>\n{inner}\n</svg>\n')


SHADOW = '<ellipse cx="256" cy="468" rx="150" ry="18" fill="#7A4A2A" opacity="0.18" filter="url(#m_shadow)"/>'


# ── mascot states (512×512 canvas) ─────────────────────────────────────────
def mascot_inner(state, defs):
    if state == 'idle':
        return place_dog(dog(tongue=True))
    if state == 'happy':
        return (place_dog(dog(HAPPY_EYES, tongue=True, ears='perk'), y=32, tilt=-4)
                + emoji(defs, 'sparkles_color.svg', 392, 30, 96, rotate=8)
                + emoji(defs, 'red_heart_color.svg', 30, 40, 70, rotate=-16)
                + emoji(defs, 'sparkles_color.svg', 18, 300, 56, rotate=-10))
    if state == 'sniffing':
        return (place_dog(dog(SIDE_EYES, SNIFF_MOUTH, extra=SNIFF_LINES), tilt=6)
                + emoji(defs, 'magnifying_glass_tilted_left_color.svg', 318, 300, 176, rotate=-8))
    if state == 'sleeping':
        return (place_dog(dog(CLOSED_EYES, ears='droop'), y=48, tilt=8)
                + emoji(defs, 'zzz_color.svg', 360, 8, 132, rotate=6))
    if state == 'eating':
        return (place_dog(dog(HAPPY_EYES, ears='perk'), tilt=-3)
                + emoji(defs, 'bone_color.svg', 136, 250, 240, rotate=45)
                + emoji(defs, 'sparkles_color.svg', 400, 60, 72, rotate=10))
    if state == 'sad':
        return (place_dog(dog(puppy_eyes(), SAD_MOUTH, blush=False, ears='droop'), y=46)
                + emoji(defs, 'droplet_color.svg', 128, 238, 56, rotate=10))
    raise ValueError(state)


STATES = ['idle', 'happy', 'sniffing', 'sleeping', 'eating', 'sad']


def mascot_svg(state, shadow=True):
    defs = Defs()
    inner = mascot_inner(state, defs)
    return svg_doc(512, 512, (SHADOW if shadow else '') + inner, MASCOT_DEFS + str(defs))


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


# ── app icon ───────────────────────────────────────────────────────────────
ICON_DEFS = f'''
<linearGradient id="i_bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{TANGERINE_LIGHT}"/><stop offset="1" stop-color="{TANGERINE}"/>
</linearGradient>
<radialGradient id="i_glow" cx="0.5" cy="0.36" r="0.6">
  <stop offset="0" stop-color="#FFF4E4" stop-opacity="0.85"/><stop offset="1" stop-color="#FFF4E4" stop-opacity="0"/>
</radialGradient>
<filter id="i_drop" x="-20%" y="-20%" width="140%" height="140%">
  <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#8A3200" flood-opacity="0.35"/>
</filter>
'''


def icon_svg(full_bleed=False, dog_scale=24.5):
    """1024 canvas. full_bleed → maskable (no rounded corners, smaller dog)."""
    if full_bleed:
        bg = ('<rect width="1024" height="1024" fill="url(#i_bg)"/>'
              '<rect width="1024" height="1024" fill="url(#i_glow)"/>')
    else:
        bg = ('<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#i_bg)"/>'
              '<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#i_glow)"/>')
    w = 28 * dog_scale  # face spans x 2..30
    x = 512 - 16 * dog_scale
    y = 530 - 17 * dog_scale
    d = place_dog(dog(tongue=True, blush=True), x=x, y=y, scale=dog_scale)
    return svg_doc(1024, 1024, bg + f'<g filter="url(#i_drop)">{d}</g>', MASCOT_DEFS + ICON_DEFS)


def favicon_svg():
    """Face only, tight viewBox, crisp at 16–32 px."""
    body = place_dog(dog(tongue=True, blush=False), x=0, y=0, scale=1)
    return svg_doc(32, 32, body, DOG_DEFS, size=(32, 32)).replace('viewBox="0 0 32 32"', 'viewBox="1.5 2.5 29 29"')


def tray_template(size):
    """Monochrome macOS menu-bar template: black silhouette, eyes/nose/mouth knocked out."""
    src = render(favicon_svg(), size * 4)
    px = src.load()
    for yy in range(src.height):
        for xx in range(src.width):
            r, g, b, a = px[xx, yy]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            px[xx, yy] = (0, 0, 0, 0 if lum < 70 else a)
    return src.resize((size, size), Image.LANCZOS)


# ── brand: logo + banner + stickers ────────────────────────────────────────
def logo_svg():
    word, adv = text_path('Woltron', 0, 0, 100, INK, weight=650)
    dog_px = 132
    s = dog_px / 28
    d = place_dog(dog(tongue=True), x=-2 * s, y=-4 * s + 4, scale=s)
    gap = 18
    total = dog_px + gap + adv
    inner = d + f'<g transform="translate({dog_px + gap} 106)">{word}</g>'
    return svg_doc(round(total + 8), 140, inner, MASCOT_DEFS)


def banner_svg():
    W, H = 1280, 400
    defs = Defs()
    bg = f'''
<rect width="{W}" height="{H}" fill="{CREAM}"/>
<circle cx="230" cy="215" r="250" fill="url(#b_sun)"/>
<path d="M0 330 C 240 290, 420 380, 700 340 S 1120 300, 1280 340 V400 H0Z" fill="{CREAM_DEEP}"/>
'''
    stickers = [
        ('pizza_color.svg', 1086, 36, 92, 14, 1),
        ('steaming_bowl_color.svg', 1170, 150, 84, -10, 1),
        ('sushi_color.svg', 1076, 214, 76, 8, 1),
        ('taco_color.svg', 1000, 312, 60, -14, 1),
        ('dumpling_color.svg', 1180, 296, 64, 12, 1),
        ('bone_color.svg', 980, 52, 52, -24, 1),
        ('paw_prints_color.svg', 520, 44, 40, -18, 0.3),
    ]
    st = ''.join(emoji(defs, n, x, y, s, r, o) for n, x, y, s, r, o in stickers)
    mascot = place_dog(dog(HAPPY_EYES, tongue=True, ears='perk'), x=60, y=28, scale=11.6, tilt=-5)
    sparkle = emoji(defs, 'sparkles_color.svg', 352, 38, 70, rotate=10)
    word, adv = text_path('Woltron', 0, 0, 150, INK, weight=650)
    tag, tadv = text_path('Your very good food-fetching dog', 0, 0, 34, '#7A4E36', weight=500)
    text = (f'<g transform="translate(470 210)">{word}</g>'
            f'<g transform="translate(476 286)">{tag}</g>')
    under = f'<path d="M478 236 Q {478 + adv / 2:.0f} 252 {470 + adv:.0f} 232" stroke="{TANGERINE}" stroke-width="9" stroke-linecap="round" fill="none"/>'
    bdefs = f'''<radialGradient id="b_sun" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="{TANGERINE_LIGHT}" stop-opacity="0.85"/><stop offset="0.7" stop-color="{TANGERINE_LIGHT}" stop-opacity="0.35"/><stop offset="1" stop-color="{TANGERINE_LIGHT}" stop-opacity="0"/></radialGradient>'''
    shadow = '<ellipse cx="232" cy="372" rx="130" ry="14" fill="#7A4A2A" opacity="0.2" filter="url(#m_shadow)"/>'
    return svg_doc(W, H, bg + st + shadow + mascot + sparkle + under + text, MASCOT_DEFS + bdefs + str(defs))


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
        save_png(render(icon, size), 'assets', 'icon', 'png', f'{size}x{size}.png')
    big.save(out('assets', 'icon', 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    try:
        big.save(out('assets', 'icon', 'icon.icns'))
    except Exception as e:  # pragma: no cover
        print('icns skipped:', e)
    save_png(render(icon, 192), 'apps', 'web', 'public', 'icons', 'icon-192.png')
    save_png(render(icon, 512), 'apps', 'web', 'public', 'icons', 'icon-512.png')
    mask = icon_svg(full_bleed=True, dog_scale=19)
    save_png(render(mask, 512), 'apps', 'web', 'public', 'icons', 'maskable-512.png')
    # apple touch: opaque, full-bleed (iOS rounds corners itself)
    apple = render(icon_svg(full_bleed=True, dog_scale=22), 180)
    bgc = Image.new('RGBA', apple.size, TANGERINE)
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
