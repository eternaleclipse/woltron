"""Woltron the robot dog — original vector artwork, drawn parametrically.

Everything is authored on a 512×512 canvas with layered gradients only (no SVG
filters), so it renders identically in cairosvg, browsers and Electron. Glows
are radial-gradient ellipses; shadows are soft radial gradients.

    robodog(state)   -> (defs, body)    full mascot for a state
    head_icon(...)   -> (defs, body)    simplified head for favicons/tray/app icon
"""
import math

# ── palette (matches apps/web/DESIGN.md) ─────────────────────────────────
PLUM = '#2b1a33'
PLUM_DEEP = '#1b1220'
BALL = '#cadb72'  # --ball (softer matcha-lime)
BALL_HOT = '#eef3d2'  # --ball-soft
PINK = '#ff6f91'
AQUA = '#8fe9ff'
BISCUIT = '#f4b860'

STATES = ['idle', 'happy', 'sniffing', 'sleeping', 'eating', 'sad']

# eye centres on the visor
EYE_L = (206, 222)
EYE_R = (306, 222)
# ear hinge (left; right is mirrored about x=256)
HINGE = (166, 146)


def _f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def defs(p='r_'):
    return f'''
<linearGradient id="{p}shell" x1="0.25" y1="0" x2="0.75" y2="1">
  <stop offset="0" stop-color="#fbf8f6"/><stop offset="0.42" stop-color="#efe8e4"/>
  <stop offset="0.78" stop-color="#d8ccd3"/><stop offset="1" stop-color="#a99aa8"/>
</linearGradient>
<radialGradient id="{p}shellHi" cx="0.36" cy="0.22" r="0.55">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="{p}muzzle" x1="0.3" y1="0" x2="0.7" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f3ede9"/><stop offset="1" stop-color="#c9bcc6"/>
</linearGradient>
<linearGradient id="{p}graph" x1="0" y1="0" x2="0.3" y2="1">
  <stop offset="0" stop-color="#55445f"/><stop offset="0.55" stop-color="#33253d"/><stop offset="1" stop-color="#1c1323"/>
</linearGradient>
<linearGradient id="{p}graphHi" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8a7a94"/><stop offset="1" stop-color="#3a2b44"/>
</linearGradient>
<linearGradient id="{p}earBack" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5e4d69"/><stop offset="1" stop-color="#7d6c88"/>
</linearGradient>
<radialGradient id="{p}ao"><stop offset="0" stop-color="#3a2346" stop-opacity="0.35"/><stop offset="1" stop-color="#3a2346" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}visor" cx="0.5" cy="0.3" r="0.8">
  <stop offset="0" stop-color="#3b2748"/><stop offset="0.6" stop-color="#22152b"/><stop offset="1" stop-color="#120a17"/>
</radialGradient>
<linearGradient id="{p}shine" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="{p}rim" x1="0" y1="0.2" x2="1" y2="0.9">
  <stop offset="0" stop-color="{BALL}" stop-opacity="0"/><stop offset="0.6" stop-color="{BALL}" stop-opacity="0"/>
  <stop offset="1" stop-color="{BALL}" stop-opacity="0.9"/>
</linearGradient>
<radialGradient id="{p}eye" cx="0.5" cy="0.42" r="0.6">
  <stop offset="0" stop-color="{BALL_HOT}"/><stop offset="0.5" stop-color="#dbe79a"/><stop offset="1" stop-color="{BALL}"/>
</radialGradient>
<radialGradient id="{p}glowLime"><stop offset="0" stop-color="{BALL}" stop-opacity="0.8"/>
  <stop offset="0.45" stop-color="{BALL}" stop-opacity="0.28"/><stop offset="1" stop-color="{BALL}" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}glowPink"><stop offset="0" stop-color="{PINK}" stop-opacity="0.75"/>
  <stop offset="0.45" stop-color="{PINK}" stop-opacity="0.25"/><stop offset="1" stop-color="{PINK}" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}glowAqua"><stop offset="0" stop-color="{AQUA}" stop-opacity="0.8"/>
  <stop offset="0.45" stop-color="{AQUA}" stop-opacity="0.25"/><stop offset="1" stop-color="{AQUA}" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}shadow"><stop offset="0" stop-color="{PLUM}" stop-opacity="0.32"/>
  <stop offset="0.6" stop-color="{PLUM}" stop-opacity="0.12"/><stop offset="1" stop-color="{PLUM}" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}ball" cx="0.36" cy="0.3" r="0.8">
  <stop offset="0" stop-color="#eef3d2"/><stop offset="0.55" stop-color="{BALL}"/><stop offset="1" stop-color="#a3b352"/>
</radialGradient>
<clipPath id="{p}clipHead"><path d="{CRANIUM}"/></clipPath>
<clipPath id="{p}clipVisor"><path d="{VISOR}"/></clipPath>
'''


# ── shapes ────────────────────────────────────────────────────────────────
CRANIUM = ('M256 96 C 330 96 386 124 398 186 C 408 238 404 286 380 326 '
           'C 352 370 306 390 256 390 C 206 390 160 370 132 326 '
           'C 108 286 104 238 114 186 C 126 124 182 96 256 96 Z')
VISOR = ('M256 160 C 326 160 372 170 382 206 C 392 246 364 278 316 284 '
         'C 290 287 274 276 256 276 C 238 276 222 287 196 284 '
         'C 148 278 120 246 130 206 C 140 170 186 160 256 160 Z')
VISOR_BEZEL = ('M256 150 C 334 150 384 162 394 204 C 404 252 372 290 318 296 '
               'C 290 299 274 288 256 288 C 238 288 222 299 194 296 '
               'C 140 290 108 252 118 204 C 128 162 178 150 256 150 Z')
MUZZLE = ('M256 248 C 284 248 298 266 306 292 C 334 298 356 318 356 346 '
          'C 356 376 316 390 256 390 C 196 390 156 376 156 346 '
          'C 156 318 178 298 206 292 C 214 266 228 248 256 248 Z')
CREST = 'M232 92 L280 92 L270 140 C 266 150 246 150 242 140 Z'
JAW = 'M190 366 C 200 402 228 414 256 414 C 284 414 312 402 322 366 Z'
JAW_OPEN = ('M188 372 C 186 400 190 420 200 432 C 214 450 234 458 256 458 '
            'C 278 458 298 450 312 432 C 322 420 326 400 324 372 L 306 372 '
            'C 308 398 304 414 292 424 C 282 432 270 436 256 436 '
            'C 242 436 230 432 220 424 C 208 414 204 398 206 372 Z')
NOSE = ('M256 322 C 234 322 220 310 220 297 C 220 285 234 280 256 280 '
        'C 278 280 292 285 292 297 C 292 310 278 322 256 322 Z')
# ear in local coords: hinge at origin, pointing straight up
EAR = ('M -44 8 C -54 -40 -42 -92 -13 -128 C -6 -137 6 -137 12 -127 '
       'C 38 -88 52 -40 44 8 A 44 44 0 0 1 -44 8 Z')
EAR_INNER = 'M -22 -14 C -27 -50 -19 -84 0 -108 C 17 -82 26 -50 22 -14 Z'


def path(d, fill, extra=''):
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def stroke(d, color, w, op=1.0, extra=''):
    o = f' opacity="{op}"' if op != 1 else ''
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
            f'stroke-linecap="round" stroke-linejoin="round"{o}{extra}/>')


def glow(cx, cy, rx, ry, p, kind='Lime', op=1.0):
    o = f' opacity="{op}"' if op != 1 else ''
    return f'<ellipse cx="{_f(cx)}" cy="{_f(cy)}" rx="{_f(rx)}" ry="{_f(ry)}" fill="url(#{p}glow{kind})"{o}/>'


def mirror(s):
    return f'<g transform="matrix(-1 0 0 1 512 0)">{s}</g>'


# ── parts ─────────────────────────────────────────────────────────────────
def ear(p, angle, led=1.0, fold=1.0):
    hx, hy = HINGE
    if angle < -90:  # flopped down: we see the ear's graphite back plate
        body = (path(EAR, f'url(#{p}earBack)', ' stroke="#ffffff" stroke-width="2.5" stroke-opacity="0.45"')
                + stroke('M -24 -20 C -26 -56 -18 -88 -4 -110', '#ffffff', 3, 0.18)
                + stroke('M 0 -94 L 0 -40', BALL, 4, 0.5 * led))
    else:
        body = (path(EAR, f'url(#{p}shell)', ' stroke="#9d8e9c" stroke-width="1.5" stroke-opacity="0.5"')
                + path(EAR, f'url(#{p}shellHi)', ' opacity="0.7"')
                + path(EAR_INNER, f'url(#{p}graph)')
                + stroke('M 0 -94 L 0 -40', BALL, 6, 0.95 * led)
                + stroke('M 0 -94 L 0 -40', BALL_HOT, 2.2, 0.9 * led))
    sc = f' scale(1 {fold})' if fold != 1 else ''
    return f'<g transform="translate({hx} {hy}) rotate({_f(angle)}){sc}">{body}</g>'


def hinge(p):
    hx, hy = HINGE
    return (f'<circle cx="{hx}" cy="{hy}" r="13" fill="url(#{p}graph)"/>'
            f'<circle cx="{hx}" cy="{hy}" r="13" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>'
            f'<circle cx="{hx}" cy="{hy}" r="5" fill="none" stroke="{BALL}" stroke-width="2.5" opacity="0.9"/>')


def collar(p, led=1.0):
    return (path('M212 350 L 300 350 L 296 412 C 280 420 232 420 216 412 Z', f'url(#{p}graph)')
            + f'<ellipse cx="256" cy="410" rx="78" ry="19" fill="url(#{p}graph)"/>'
            + f'<ellipse cx="256" cy="405" rx="76" ry="15" fill="url(#{p}graphHi)" opacity="0.55"/>'
            + stroke('M182 414 C 204 432 308 432 330 414', BALL, 4.5, 0.9 * led))


def tag(p, y=444):
    return (stroke(f'M256 426 L256 {y - 14}', '#3a2b44', 4)
            + f'<circle cx="256" cy="{y}" r="17" fill="url(#{p}ball)"/>'
            + stroke(f'M243 {y - 10} C 251 {y - 4} 251 {y + 4} 243 {y + 10}', '#ffffff', 2.4, 0.9)
            + stroke(f'M269 {y - 10} C 261 {y - 4} 261 {y + 4} 269 {y + 10}', '#ffffff', 2.4, 0.9))


def head(p, eyes='', visor_dim=1.0, mouth='smile', jaw_drop=0, extra_face='', prop=''):
    s = []
    if not jaw_drop:  # closed: lower jaw tucked behind the shell
        s.append(path(JAW, f'url(#{p}graph)') + stroke('M206 398 C 226 410 286 410 306 398', '#6b5a75', 3, 0.6))
    # cranium shell
    s.append(path(CRANIUM, f'url(#{p}shell)'))
    s.append(path(CRANIUM, f'url(#{p}shellHi)', ' opacity="0.9"'))
    if jaw_drop:  # open mouth: dark interior, the prop, then the lower lip in front
        s.append(f'<path d="M206 372 C 204 398 208 414 220 424 C 230 432 242 436 256 436 C 270 436 282 432 292 424 C 304 414 308 398 306 372 Z" fill="#1a1020"/>'
                 + prop + path(JAW_OPEN, f'url(#{p}muzzle)')
                 + stroke(JAW_OPEN, '#8f8090', 1.5, 0.5))
    # panel seams + rim light
    s.append(f'<g clip-path="url(#{p}clipHead)">'
             + path(CREST, f'url(#{p}graph)')
             + stroke(CREST, '#ffffff', 1.5, 0.25)
             + stroke('M126 250 C 132 300 156 338 196 362', '#a495a4', 2.5, 0.55)
             + stroke('M386 250 C 380 300 356 338 316 362', '#a495a4', 2.5, 0.55)
             + stroke(CRANIUM, f'url(#{p}rim)', 10, 0.6)
             + '</g>')
    s.append(stroke(CRANIUM, '#7d6c80', 1.5, 0.35))
    # glossy specular streak on the dome
    s.append(stroke('M150 178 C 156 146 182 120 222 108', '#ffffff', 7, 0.85))
    s.append(f'<circle cx="236" cy="104" r="3.5" fill="#ffffff" opacity="0.85"/>')
    # forehead status light
    s.append(glow(256, 124, 22, 30, p, op=0.8 * visor_dim))
    s.append(f'<rect x="252" y="108" width="8" height="30" rx="4" fill="{BALL}" opacity="{_f(visor_dim ** 2)}"/>')
    # visor
    s.append(path(VISOR_BEZEL, f'url(#{p}graph)'))
    s.append(path(VISOR, f'url(#{p}visor)'))
    s.append(f'<g clip-path="url(#{p}clipVisor)">{eyes}'
             + (f'<path d="{VISOR}" fill="#120a17" opacity="{_f(1 - visor_dim)}"/>' if visor_dim < 1 else '')
             + path('M150 196 C 170 168 340 168 362 196 C 330 184 182 184 150 196 Z', f'url(#{p}shine)', ' opacity="0.9"')
             + path('M140 228 C 142 200 160 182 196 174 C 168 190 152 208 150 236 Z', '#ffffff', ' opacity="0.22"')
             + '</g>')
    s.append(stroke(VISOR, '#000000', 2, 0.35))
    # muzzle (with a soft occlusion shadow cast onto the shell)
    s.append(f'<ellipse cx="256" cy="372" rx="118" ry="34" fill="url(#{p}ao)"/>')
    s.append(path(MUZZLE, f'url(#{p}muzzle)'))
    s.append(path(MUZZLE, f'url(#{p}shellHi)', ' opacity="0.6"'))
    s.append(stroke(MUZZLE, '#8f8090', 1.5, 0.4))
    # nose (sensor)
    s.append(path(NOSE, f'url(#{p}graph)'))
    s.append('<ellipse cx="244" cy="290" rx="13" ry="5" fill="#ffffff" opacity="0.45"/>')
    # mouth seam
    if mouth == 'smile':
        s.append(stroke('M256 322 L256 342 M220 354 C 234 370 250 366 256 344 C 262 366 278 370 292 354', '#3a2b44', 4.5, 0.75))
    elif mouth == 'frown':
        s.append(stroke('M256 322 L256 340 M226 370 C 238 352 274 352 286 370', '#3a2b44', 4.5, 0.75))
    elif mouth == 'flat':
        s.append(stroke('M256 322 L256 340 M232 356 C 246 360 266 360 280 356', '#3a2b44', 4.5, 0.75))
    s.append(extra_face)
    return ''.join(s)


# ── eye vocabularies (LED glyphs drawn inside the visor clip) ────────────
def eyes_oval(p, rx=17, ry=25, dx=0, dy=0, op=1.0):
    s = ''
    for cx, cy in (EYE_L, EYE_R):
        x, y = cx + dx, cy + dy
        s += glow(x, y, rx * 3.2, ry * 2.4, p, op=0.9 * op)
        s += f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="url(#{p}eye)" opacity="{op}"/>'
        s += f'<ellipse cx="{x - rx * 0.3:.1f}" cy="{y - ry * 0.42:.1f}" rx="{rx * 0.32:.1f}" ry="{ry * 0.22:.1f}" fill="#ffffff" opacity="{0.85 * op:.2f}"/>'
    return s


def eyes_arc(p, up=True, w=40, h=26, sw=12, op=1.0, dy=0):
    s = ''
    for cx, cy in (EYE_L, EYE_R):
        cy += dy
        if up:   # ^ ^
            d = f'M{cx - w / 2} {cy + h / 2} Q {cx} {cy - h} {cx + w / 2} {cy + h / 2}'
        else:    # ‿ ‿ (closed)
            d = f'M{cx - w / 2} {cy - h / 4} Q {cx} {cy + h * 0.8} {cx + w / 2} {cy - h / 4}'
        s += glow(cx, cy, w * 1.4, h * 1.8, p, op=0.9 * op)
        s += stroke(d, BALL, sw, op)
        s += stroke(d, BALL_HOT, sw * 0.35, 0.9 * op)
    return s


def eyes_sad(p):
    s = ''
    for (cx, cy), side in ((EYE_L, -1), (EYE_R, 1)):
        # oval with the inner-top sliced off diagonally → droopy, worried
        o, i = cx + 17 * side, cx - 17 * side   # outer / inner edge
        d = (f'M{o} {cy - 2} C {o} {cy + 27} {i} {cy + 27} {i} {cy + 4} '
             f'L {i} {cy - 14} Q {i} {cy - 22} {i + 8 * side} {cy - 19} '
             f'L {o - 3 * side} {cy - 7} Q {o} {cy - 6} {o} {cy - 2} Z')
        s += glow(cx, cy + 6, 50, 52, p, op=0.85)
        s += path(d, f'url(#{p}eye)', ' stroke-linejoin="round"')
        s += f'<circle cx="{cx - 5 * side}" cy="{cy + 6}" r="4.5" fill="#ffffff" opacity="0.85"/>'
    return s


def eyes_scan(p):
    """Sniffing: focused squint bars shifted toward the snout + a sweeping scanline."""
    s = ''
    # scanline sweeping across the visor
    s += f'<rect x="120" y="196" width="280" height="54" fill="url(#{p}glowLime)" opacity="0.35"/>'
    for i, x in enumerate(range(140, 380, 12)):
        s += f'<rect x="{x}" y="221" width="7" height="3" rx="1.5" fill="{BALL}" opacity="{0.15 + 0.35 * (i % 3 == 0):.2f}"/>'
    # left eye: wide oval looking down-left; right eye: squint bar
    lx, ly = EYE_L[0] - 10, EYE_L[1] + 6
    s += glow(lx, ly, 52, 56, p)
    s += f'<ellipse cx="{lx}" cy="{ly}" rx="17" ry="22" fill="url(#{p}eye)"/>'
    s += f'<ellipse cx="{lx - 6}" cy="{ly - 9}" rx="5.5" ry="4.5" fill="#ffffff" opacity="0.85"/>'
    rx_, ry_ = EYE_R[0] - 10, EYE_R[1] + 4
    s += glow(rx_, ry_, 56, 30, p)
    s += f'<rect x="{rx_ - 22}" y="{ry_ - 6}" width="44" height="12" rx="6" fill="url(#{p}eye)"/>'
    return s


# ── decorations ───────────────────────────────────────────────────────────
def sparkle(cx, cy, r, color=BALL, p='r_', kind='Lime', op=1.0):
    k = r * 0.18
    d = (f'M{cx} {cy - r} C {cx + k} {cy - k} {cx + k} {cy - k} {cx + r} {cy} '
         f'C {cx + k} {cy + k} {cx + k} {cy + k} {cx} {cy + r} '
         f'C {cx - k} {cy + k} {cx - k} {cy + k} {cx - r} {cy} '
         f'C {cx - k} {cy - k} {cx - k} {cy - k} {cx} {cy - r} Z')
    return glow(cx, cy, r * 1.6, r * 1.6, p, kind, 0.7 * op) + path(d, color, f' opacity="{op}"')


def heart(cx, cy, s, p, rot=0):
    d = ('M0 9 C -4 6 -12 1 -12 -5 C -12 -10 -8 -13 -4 -13 C -1.5 -13 0 -11.5 0 -9.5 '
         'C 0 -11.5 1.5 -13 4 -13 C 8 -13 12 -10 12 -5 C 12 1 4 6 0 9 Z')
    return (glow(cx, cy, s * 2.2, s * 2.2, p, 'Pink', 0.9)
            + f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s / 12:.3f})">'
            + path(d, PINK) + path('M-7 -8 C -9 -6 -9 -3 -8 -1', 'none', ' stroke="#ffd0dc" stroke-width="2.4" stroke-linecap="round"')
            + '</g>')


def led_z(x, y, size, p, op=1.0):
    d = f'M{x} {y} L{x + size} {y} L{x} {y + size} L{x + size} {y + size}'
    return (glow(x + size / 2, y + size / 2, size * 1.3, size * 1.3, p, op=0.8 * op)
            + stroke(d, BALL, size * 0.2, op) + stroke(d, BALL_HOT, size * 0.07, op))


def tear(cx, cy, s, p):
    d = f'M{cx} {cy - s} C {cx + s * 0.25} {cy - s * 0.4} {cx + s * 0.6} {cy} {cx + s * 0.6} {cy + s * 0.35} C {cx + s * 0.6} {cy + s * 0.75} {cx + s * 0.3} {cy + s} {cx} {cy + s} C {cx - s * 0.3} {cy + s} {cx - s * 0.6} {cy + s * 0.75} {cx - s * 0.6} {cy + s * 0.35} C {cx - s * 0.6} {cy} {cx - s * 0.25} {cy - s * 0.4} {cx} {cy - s} Z'
    return (glow(cx, cy + s * 0.3, s * 1.6, s * 1.8, p, 'Aqua')
            + path(d, AQUA) + f'<ellipse cx="{cx - s * 0.2:.1f}" cy="{cy + s * 0.3:.1f}" rx="{s * 0.14:.1f}" ry="{s * 0.24:.1f}" fill="#ffffff" opacity="0.85"/>')


def scan_waves(p, cx=236, cy=318):
    """Radar arcs emitted from the nose toward the lower-left."""
    s = ''
    for i, r in enumerate((112, 140, 168)):
        a0, a1 = math.radians(138), math.radians(192)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        d = f'M{x0:.1f} {y0:.1f} A {r} {r} 0 0 1 {x1:.1f} {y1:.1f}'
        op = 0.95 - i * 0.25
        s += stroke(d, BALL, 14, op * 0.25) + stroke(d, BALL, 6, op) + stroke(d, BALL_HOT, 2, op)
    return s


def tennis_ball(cx, cy, r, p):
    k = r / 19
    return (f'<g transform="translate({cx - 20 * k:.1f} {cy - 20 * k:.1f}) scale({k:.3f})">'
            f'<circle cx="20" cy="20" r="19" fill="url(#{p}ball)"/>'
            f'<circle cx="20" cy="20" r="18.4" fill="none" stroke="{PLUM}" stroke-opacity="0.25" stroke-width="1.2"/>'
            + stroke('M6.5 6.8 C13 12 13 28 6.5 33.2', '#ffffff', 2.4, 0.95)
            + stroke('M33.5 6.8 C27 12 27 28 33.5 33.2', '#ffffff', 2.4, 0.95)
            + '</g>')


# ── full mascot ───────────────────────────────────────────────────────────
POSE = {  # tilt, dy, ear angle (left; mirrored for right)
    'idle': (-4, 0, -26),
    'happy': (-7, -6, -16),
    'sniffing': (7, 6, -34),
    'sleeping': (9, 18, -138),
    'eating': (-4, -6, -20),
    'sad': (2, 16, -128),
}


def robodog(state, p='r_', shadow=True):
    tilt, dy, ear_a = POSE[state]
    dim = 0.55 if state == 'sleeping' else 1.0
    jaw_drop = 0
    mouth = 'smile'
    extra = ''
    before = ''
    after = ''
    if state == 'idle':
        eyes = eyes_oval(p)
    elif state == 'happy':
        eyes = eyes_arc(p, up=True) + _blush(p)
        after = (heart(70, 120, 30, p, -14) + sparkle(430, 92, 30, p=p) + sparkle(470, 160, 14, p=p)
                 + sparkle(52, 300, 16, PINK, p, 'Pink'))
    elif state == 'sniffing':
        eyes = eyes_scan(p)
        mouth = 'flat'
        extra = _sniff_dots(p)
        before = ''
        after = scan_waves(p)
    elif state == 'sleeping':
        eyes = eyes_arc(p, up=False, op=0.6, sw=10, h=22)
        mouth = 'flat'
        after = (led_z(384, 128, 22, p, 0.6) + led_z(418, 82, 30, p, 0.8) + led_z(456, 26, 38, p, 0.95))
    elif state == 'eating':
        eyes = eyes_arc(p, up=True) + _blush(p)
        jaw_drop = 30
        mouth = 'none'
        after = sparkle(424, 104, 24, p=p) + sparkle(96, 120, 16, PINK, p, 'Pink')
    elif state == 'sad':
        eyes = eyes_sad(p)
        mouth = 'frown'
        extra = tear(166, 304, 20, p)
    else:
        raise ValueError(state)

    # eating: a tennis ball clamped between the snout and the dropped jaw
    prop = tennis_ball(256, 404, 40, p) if state == 'eating' else ''
    h = head(p, eyes, dim, mouth, jaw_drop, extra, prop)
    led = 0.5 if state == 'sleeping' else 1.0
    fold = {'sleeping': 0.85, 'sad': 0.9}.get(state, 1.0)
    e = ear(p, ear_a, led, fold)
    rig = ear_l = e + mirror(e)
    rig = ear_l + collar(p, led) + h + ('' if jaw_drop else tag(p))
    body = f'<g transform="translate(0 {dy}) rotate({tilt} 256 330)">{rig}</g>'
    sh = f'<ellipse cx="256" cy="486" rx="150" ry="20" fill="url(#{p}shadow)"/>' if shadow else ''
    return defs(p), sh + before + body + after


def _whiskers():
    s = ''
    for side in (1, -1):
        for dy, ang in ((0, -6), (16, 0), (32, 6)):
            x0, x1 = 256 - side * 96, 256 - side * 120
            y = 304 + dy
            s += stroke(f'M{x0} {y} L{x1} {y + ang * side * 0 + ang}', '#8f7f91', 4, 0.55)
    return s


def _sniff_dots(p):
    """Nose sensor lit up while sniffing."""
    return (glow(256, 300, 40, 26, p, op=0.9)
            + f'<ellipse cx="256" cy="304" rx="12" ry="6" fill="{BALL}"/>'
            + f'<ellipse cx="256" cy="304" rx="5" ry="2.5" fill="{BALL_HOT}"/>')


def _blush(p):
    s = ''
    for cx in (166, 346):
        for i in range(3):
            x = cx - 10 + i * 10
            s += stroke(f'M{x + 4} 252 L{x - 2} 264', PINK, 4.5, 0.95)
    return glow(166, 258, 34, 16, p, 'Pink', 0.8) + glow(346, 258, 34, 16, p, 'Pink', 0.8) + s


# ── simplified head for tiny sizes ────────────────────────────────────────
ICON_VIEWBOX = '58 6 396 396'


def head_icon(p='r_', eyes='oval', glow_eyes=True):
    """Bold head silhouette + visor + glowing eyes; built to survive 16–32 px.

    Crop with ICON_VIEWBOX. Fewer, chunkier parts than the full mascot: no seams,
    collar or mouth; the eyes are oversized so they still read as two lights at 16 px.
    """
    ear_s = ear(p, -22)
    s = ear_s + mirror(ear_s)
    s += path(CRANIUM, f'url(#{p}shell)') + path(CRANIUM, f'url(#{p}shellHi)', ' opacity="0.8"')
    s += f'<g clip-path="url(#{p}clipHead)">' + path(CREST, f'url(#{p}graph)') + '</g>'
    s += stroke(CRANIUM, '#7d6c80', 3, 0.4)
    s += path(VISOR_BEZEL, f'url(#{p}graph)') + path(VISOR, f'url(#{p}visor)')
    s += f'<g clip-path="url(#{p}clipVisor)">'
    for cx, cy in (EYE_L, EYE_R):
        if glow_eyes:
            s += glow(cx, cy, 52, 58, p)
        s += f'<ellipse cx="{cx}" cy="{cy}" rx="24" ry="32" fill="url(#{p}eye)"/>'
    s += path('M150 196 C 170 168 340 168 362 196 C 330 184 182 184 150 196 Z', f'url(#{p}shine)', ' opacity="0.7"')
    s += '</g>'
    s += path(MUZZLE, f'url(#{p}muzzle)') + stroke(MUZZLE, '#8f8090', 3, 0.5) + path(NOSE, f'url(#{p}graph)')
    return defs(p), s


def head_template():
    """Monochrome silhouette for macOS menu-bar template images: black head, visor
    knocked out, eyes and nose left solid (even-odd fill)."""
    ear_s = (f'<g transform="translate({HINGE[0]} {HINGE[1]}) rotate(-22)">'
             f'<path d="{EAR}" fill="#000"/></g>')
    eyes = ''.join(f'M{cx - 26} {cy} A 26 34 0 1 0 {cx + 26} {cy} A 26 34 0 1 0 {cx - 26} {cy} Z '
                   for cx, cy in (EYE_L, EYE_R))
    return ear_s + mirror(ear_s) + (f'<path fill-rule="evenodd" fill="#000" d="{CRANIUM} {VISOR} {eyes}"/>')
