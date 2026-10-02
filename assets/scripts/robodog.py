"""Woltron the robot dog (v2) — original vector artwork, drawn parametrically.

A capable robot K9 sidekick in 3/4 view (facing left): hard-surface armour
plates over a graphite under-structure, a wraparound visor with LED eyes,
articulated ears and jaw, a segmented neck with a piston, and a chest plate.
Emotion lives only in the LED eyes, the ears and the head tilt.

Everything is plain SVG gradients (no filters), so cairosvg renders the static
first frame used for PNGs; `anim_style(state)` adds CSS keyframes (blink,
visor glint, scan bar, standby pulse) for the animated `.svg` mascots.

    robodog(state)   -> (defs, body)    full mascot (512×512) for a state
    anim_style(state)-> '<style>…'      per-state visor animation
    head_icon(...)   -> (defs, body)    head only, for icons (crop: ICON_VIEWBOX)
    head_template()  -> body            monochrome silhouette for macOS tray
"""
import math

# ── palette (apps/web/DESIGN.md) ──────────────────────────────────────────
PLUM = '#2b1a33'
BALL = '#cadb72'       # --ball (matcha-lime): LEDs, collar, tag
BALL_CORE = '#e4eeb0'  # lighter LED core so the eyes read as lit
BALL_HOT = '#f4f8dc'
TONGUE = '#ff7f9c'
TONGUE_DEEP = '#e0577a'

STATES = ['idle', 'happy', 'sniffing', 'sleeping', 'eating', 'sad']

NECK_PIVOT = (306, 318)       # head rotates about this point
HEAD_SCALE = 1.1             # head drawn a touch larger than the bust
HEAD_DROP = 18
EAR_NEAR = (344, 142)         # ear hinges
EAR_FAR = (268, 138)
JAW_HINGE = (276, 284)
EYE_NEAR = (298, 204)         # LED eye centres on the visor
EYE_FAR = (208, 193)


def _f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def rpoly(pts, r=8):
    """Closed polygon with softened (chamfer-like) corners. pts: (x, y[, r])."""
    n = len(pts)
    P = [(p[0], p[1], p[2] if len(p) > 2 else r) for p in pts]
    out = []
    for i in range(n):
        x, y, rr = P[i]
        px, py, _ = P[i - 1]
        nx, ny, _ = P[(i + 1) % n]
        d0 = math.hypot(px - x, py - y) or 1
        d1 = math.hypot(nx - x, ny - y) or 1
        k0, k1 = min(rr / d0, 0.45), min(rr / d1, 0.45)
        a = (x + (px - x) * k0, y + (py - y) * k0)
        b = (x + (nx - x) * k1, y + (ny - y) * k1)
        out.append((a, (x, y), b))
    d = f'M{_f(out[0][0][0])} {_f(out[0][0][1])} '
    for i, (a, v, b) in enumerate(out):
        if i:
            d += f'L{_f(a[0])} {_f(a[1])} '
        d += f'Q{_f(v[0])} {_f(v[1])} {_f(b[0])} {_f(b[1])} '
    return d + 'Z'


# ── shapes (canvas coords, facing left) ───────────────────────────────────
HEAD_BASE = rpoly([(234, 126, 14), (354, 120, 16), (398, 158, 18), (406, 236, 18), (386, 288, 16),
                   (322, 328, 14), (240, 316), (128, 302), (106, 288), (92, 262), (86, 236, 10),
                   (102, 218), (180, 176), (198, 148, 12)])
CRANIUM = rpoly([(206, 150, 10), (238, 132, 14), (350, 126, 16), (390, 160, 16), (396, 214, 12),
                 (370, 194, 6), (304, 166, 6), (214, 158, 6)])
BROW = rpoly([(200, 160, 6), (216, 146, 8), (306, 150, 8), (372, 176, 8), (366, 186, 4), (304, 166, 4), (214, 162, 4)])
VISOR_BEZEL = rpoly([(162, 196, 10), (176, 174, 10), (214, 158, 12), (304, 164, 14), (372, 186, 12),
                     (384, 212, 10), (368, 240, 12), (296, 248, 12), (220, 240, 12), (176, 224, 10)])
VISOR = rpoly([(172, 196, 8), (184, 180, 8), (216, 168, 10), (302, 174, 12), (362, 192, 10),
               (370, 212, 8), (358, 232, 10), (296, 238, 10), (222, 230, 10), (184, 218, 8)])
CHEEK = rpoly([(222, 246, 8), (298, 254, 10), (372, 246, 10), (392, 238, 6), (398, 252, 10), (380, 284, 12),
               (330, 314, 12), (290, 296, 8), (256, 266, 8)])
MUZZLE_TOP = rpoly([(170, 206, 6), (186, 224, 6), (110, 244, 6), (100, 230, 6)])
MUZZLE = rpoly([(188, 226, 8), (232, 244, 8), (262, 270, 8), (256, 284, 6), (150, 280, 10),
                (114, 268, 8), (110, 246, 6)])
NOSE = rpoly([(84, 236, 10), (100, 222, 8), (118, 230, 8), (120, 262, 10), (104, 272, 10), (88, 262, 10)])
JAW = rpoly([(122, 290, 10), (150, 286, 6), (262, 290, 8), (292, 300, 10), (318, 322, 10),
             (250, 316, 10), (136, 306, 10)])
MOUTH_GAP = rpoly([(126, 286, 6), (262, 288, 6), (264, 296, 6), (128, 296, 6)])
TONGUE_SHAPE = ('M164 288 C 162 306 166 326 182 330 C 198 333 206 318 204 290 Z')
CHEST = rpoly([(150, 504, 10), (166, 452, 24), (226, 414, 26), (300, 404, 20), (376, 410, 24),
               (440, 440, 24), (474, 504, 10)])
SHOULDER = rpoly([(330, 412, 16), (380, 412, 22), (440, 442, 22), (468, 500, 8), (380, 500, 8), (352, 452, 16)])
CHEST_KEEL = rpoly([(196, 470, 10), (240, 440, 12), (300, 436, 12), (318, 470, 10), (290, 500, 6), (210, 500, 6)])
# ear in local coords: hinge at origin, pointing up
EAR = rpoly([(-28, 12, 8), (-22, -50, 12), (-6, -110, 6), (2, -114, 3), (12, -106, 6), (26, -50, 12), (30, 12, 8)])
EAR_INNER = rpoly([(-14, 0, 6), (-10, -48, 8), (-1, -92, 4), (12, -48, 8), (16, 0, 6)])


def defs(p='r_'):
    return f'''
<linearGradient id="{p}shell" x1="0.15" y1="0" x2="0.85" y2="1">
  <stop offset="0" stop-color="#fdfbf9"/><stop offset="0.45" stop-color="#ece5e1"/>
  <stop offset="0.85" stop-color="#c3b6be"/><stop offset="1" stop-color="#a395a2"/>
</linearGradient>
<linearGradient id="{p}shellSide" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0" stop-color="#ebe3df"/><stop offset="1" stop-color="#b3a5b0"/>
</linearGradient>
<linearGradient id="{p}shellTop" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e1dd"/>
</linearGradient>
<linearGradient id="{p}bevel" x1="0" y1="0" x2="0.3" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.2"/>
  <stop offset="1" stop-color="#5a4864" stop-opacity="0.55"/>
</linearGradient>
<linearGradient id="{p}graph" x1="0" y1="0" x2="0.35" y2="1">
  <stop offset="0" stop-color="#4f3f5a"/><stop offset="0.5" stop-color="#2e2238"/><stop offset="1" stop-color="#191120"/>
</linearGradient>
<linearGradient id="{p}graphLite" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7a6a85"/><stop offset="1" stop-color="#3a2b45"/>
</linearGradient>
<linearGradient id="{p}metal" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#8f8296"/><stop offset="0.4" stop-color="#e8e2e6"/><stop offset="1" stop-color="#7a6c82"/>
</linearGradient>
<linearGradient id="{p}glass" x1="0" y1="0" x2="0.2" y2="1">
  <stop offset="0" stop-color="#3d2a4a"/><stop offset="0.45" stop-color="#1c1224"/><stop offset="1" stop-color="#0d0812"/>
</linearGradient>
<linearGradient id="{p}gloss" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.62"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="{p}glint" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.55"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="{p}scan" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="{BALL}" stop-opacity="0"/><stop offset="0.5" stop-color="{BALL_CORE}" stop-opacity="0.95"/>
  <stop offset="1" stop-color="{BALL}" stop-opacity="0"/>
</linearGradient>
<linearGradient id="{p}tongue" x1="0" y1="0" x2="0.3" y2="1">
  <stop offset="0" stop-color="{TONGUE_DEEP}"/><stop offset="0.35" stop-color="{TONGUE}"/><stop offset="1" stop-color="#ff9fb5"/>
</linearGradient>
<linearGradient id="{p}rim" x1="0" y1="0" x2="1" y2="0.3">
  <stop offset="0" stop-color="{BALL}" stop-opacity="0"/><stop offset="0.62" stop-color="{BALL}" stop-opacity="0"/>
  <stop offset="1" stop-color="{BALL}" stop-opacity="0.85"/>
</linearGradient>
<radialGradient id="{p}glow"><stop offset="0" stop-color="{BALL}" stop-opacity="0.75"/>
  <stop offset="0.45" stop-color="{BALL}" stop-opacity="0.25"/><stop offset="1" stop-color="{BALL}" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}shadow"><stop offset="0" stop-color="{PLUM}" stop-opacity="0.34"/>
  <stop offset="0.6" stop-color="{PLUM}" stop-opacity="0.12"/><stop offset="1" stop-color="{PLUM}" stop-opacity="0"/></radialGradient>
<radialGradient id="{p}ball" cx="0.36" cy="0.3" r="0.8">
  <stop offset="0" stop-color="#eef3d2"/><stop offset="0.55" stop-color="{BALL}"/><stop offset="1" stop-color="#a3b352"/>
</radialGradient>
<clipPath id="{p}clipVisor"><path d="{VISOR}"/></clipPath>
'''


# ── primitives ────────────────────────────────────────────────────────────
def path(d, fill, extra=''):
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def stroke(d, color, w, op=1.0, extra=''):
    o = f' opacity="{_f(op)}"' if op != 1 else ''
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{_f(w)}" '
            f'stroke-linecap="round" stroke-linejoin="round"{o}{extra}/>')


def plate(d, p, fill='shell', bevel=2.4):
    """An armour plate: gradient fill + a bevel stroke (lit top edge, shaded bottom)."""
    return path(d, f'url(#{p}{fill})') + stroke(d, f'url(#{p}bevel)', bevel)


def glow(cx, cy, rx, ry, p, op=1.0):
    o = f' opacity="{_f(op)}"' if op != 1 else ''
    return f'<ellipse cx="{_f(cx)}" cy="{_f(cy)}" rx="{_f(rx)}" ry="{_f(ry)}" fill="url(#{p}glow)"{o}/>'


def bolt(x, y, r=4.5):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="#3a2b44"/>'
            f'<circle cx="{x - r * 0.25:.1f}" cy="{y - r * 0.25:.1f}" r="{r * 0.55:.1f}" fill="#a597a8"/>')


def tennis_ball(cx, cy, r, p):
    k = r / 19
    return (f'<g transform="translate({cx - 20 * k:.1f} {cy - 20 * k:.1f}) scale({k:.3f})">'
            f'<circle cx="20" cy="20" r="19" fill="url(#{p}ball)"/>'
            f'<circle cx="20" cy="20" r="18.4" fill="none" stroke="{PLUM}" stroke-opacity="0.25" stroke-width="1.2"/>'
            + stroke('M6.5 6.8 C13 12 13 28 6.5 33.2', '#ffffff', 2.4, 0.95)
            + stroke('M33.5 6.8 C27 12 27 28 33.5 33.2', '#ffffff', 2.4, 0.95)
            + '</g>')


# ── parts ─────────────────────────────────────────────────────────────────
def ear(p, hinge, angle, far=False, led=1.0, fold=1.0):
    hx, hy = hinge
    sc = 0.86 if far else 1.0
    if far:  # the far ear is in shadow: we mostly see its graphite back
        body = (path(EAR, f'url(#{p}graphLite)') + stroke(EAR, '#ffffff', 2, 0.25)
                + path(EAR_INNER, f'url(#{p}graph)', ' opacity="0.8"'))
    else:
        body = (plate(EAR, p, 'shell', 2.6) + path(EAR_INNER, f'url(#{p}graph)')
                + stroke('M1 -80 L2 -24', BALL, 5, 0.9 * led) + stroke('M1 -80 L2 -24', BALL_CORE, 1.8, 0.9 * led)
                + stroke('M-20 -40 L-14 -40', '#8d7f93', 2, 0.6))
    hinge_block = (f'<rect x="-22" y="-6" width="44" height="22" rx="8" fill="url(#{p}graph)"/>' + bolt(0, 5, 5))
    return (f'<g transform="translate({hx} {hy}) rotate({_f(angle)}) scale({sc} {_f(sc * fold)})">{body}</g>'
            f'<g transform="translate({hx} {hy}) scale({sc})">{hinge_block}</g>')


def neck_and_chest(p, led=1.0, tag=True):
    s = []
    s.append(f'<ellipse cx="312" cy="502" rx="190" ry="16" fill="url(#{p}shadow)"/>')
    # under-structure + chest armour
    s.append(path(rpoly([(160, 500, 8), (176, 448, 20), (236, 404, 20), (378, 400, 20), (446, 436, 20), (478, 500, 8)]),
                  f'url(#{p}graph)'))
    s.append(stroke(CHEST, f'url(#{p}rim)', 3))
    s.append(plate(CHEST, p, 'shell', 2.6))
    s.append(plate(SHOULDER, p, 'shellSide', 2.4))
    s.append(plate(CHEST_KEEL, p, 'shellTop', 2.2))
    # chest power core + shoulder vents
    s.append(f'<rect x="240" y="474" width="60" height="9" rx="4.5" fill="#1c1324"/>')
    s.append(glow(270, 478, 46, 14, p, 0.8 * led))
    s.append(f'<rect x="244" y="476" width="52" height="5" rx="2.5" fill="{BALL}" opacity="{_f(led)}"/>')
    for i in range(3):
        s.append(stroke(f'M{392 + i * 13} 446 L{404 + i * 13} 470', '#4a3a55', 5, 0.75))
    s.append(bolt(354, 428) + bolt(448, 476))
    # neck: graphite core, piston, segmented rings
    s.append(path(rpoly([(262, 300, 10), (356, 296, 10), (370, 420, 10), (246, 424, 10)]), f'url(#{p}graph)'))
    s.append(f'<rect x="372" y="270" width="18" height="74" rx="6" fill="url(#{p}graph)" transform="rotate(-8 381 300)"/>')
    s.append(f'<rect x="377" y="330" width="9" height="84" rx="4" fill="url(#{p}metal)" transform="rotate(-8 381 370)"/>')
    for i, cy in enumerate((356, 382)):
        rx = 54 + i * 5
        cx = 306 - i * 2
        s.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="13" fill="url(#{p}graph)"/>')
        s.append(stroke(f'M{cx - rx} {cy} A {rx} 13 0 0 0 {cx + rx} {cy}', f'url(#{p}metal)', 7))
        s.append(stroke(f'M{cx - rx + 6} {cy + 3} A {rx - 6} 11 0 0 0 {cx + rx - 6} {cy + 3}', '#ffffff', 1.4, 0.5))
    # throat cables
    s.append(stroke('M270 318 C 262 350 258 380 262 410', '#20162a', 7))
    s.append(stroke('M284 320 C 278 352 276 382 280 412', '#3a2b45', 5))
    # collar with LED band + tennis-ball tag
    s.append(f'<ellipse cx="302" cy="408" rx="74" ry="17" fill="url(#{p}graph)"/>')
    s.append(stroke('M230 410 A 72 16 0 0 0 374 410', BALL, 4.5, 0.95 * led))
    s.append(stroke('M230 410 A 72 16 0 0 0 374 410', BALL_CORE, 1.6, 0.9 * led))
    if tag:
        s.append(stroke('M246 420 L240 432', '#3a2b44', 3.5))
        s.append(tennis_ball(238, 445, 14, p))
    return ''.join(s)


# ── LED eye glyphs (inside the visor clip) ───────────────────────────────
def _capsule(cx, cy, w, h, rot=0, fill='', op=1.0, cut=0):
    """Wide LED bar; `cut` slices the top edge (positive = right side lower)."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    r = h / 2
    d = (f'M{_f(x0 + r)} {_f(y0 + max(cut, 0))} L{_f(x1 - r)} {_f(y0 - min(cut, 0))} '
         f'Q{_f(x1)} {_f(y0 - min(cut, 0))} {_f(x1)} {_f(cy)} Q{_f(x1)} {_f(y1)} {_f(x1 - r)} {_f(y1)} '
         f'L{_f(x0 + r)} {_f(y1)} Q{_f(x0)} {_f(y1)} {_f(x0)} {_f(cy)} Q{_f(x0)} {_f(y0 + max(cut, 0))} {_f(x0 + r)} {_f(y0 + max(cut, 0))} Z')
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ''
    return f'<path d="{d}" fill="{fill}"{t} opacity="{_f(op)}"/>'


def eye_pair(p, kind, op=1.0):
    """Returns LED glyphs for both eyes. Near eye is big; far eye foreshortened."""
    s = ''
    for (cx, cy), sx, near in ((EYE_FAR, 0.55, False), (EYE_NEAR, 1.0, True)):
        w = 46 * sx
        s += glow(cx, cy, w * 1.25 + 14, 30, p, 0.9 * op)
        if kind == 'open':
            s += _capsule(cx, cy, w, 22, -4, BALL, op) + _capsule(cx, cy - 1, w - 12 * sx, 9, -4, BALL_CORE, op)
        elif kind == 'narrow':
            s += _capsule(cx, cy + 3, w, 10, -4, BALL, op) + _capsule(cx, cy + 3, w - 10 * sx, 4, -4, BALL_CORE, op)
        elif kind == 'happy':
            d = f'M{_f(cx - w / 2)} {cy + 8} Q {cx} {cy - 16} {_f(cx + w / 2)} {cy + 8}'
            s += stroke(d, BALL, 9 if near else 7, op) + stroke(d, BALL_CORE, 3, op)
        elif kind == 'standby':
            s += _capsule(cx, cy + 8, w, 5, -4, BALL, op)
        elif kind == 'sad':
            # inner end high, outer end low; outer is to the right for the near eye, left for the far one
            rot, cut = (12, -8) if near else (-12, 8)
            s += (_capsule(cx, cy + 6, w, 18, rot, BALL, op, cut)
                  + _capsule(cx, cy + 9, w - 14 * sx, 4, rot, BALL_CORE, op))
    return s


def visor(p, eyes, state, dim=1.0):
    s = [path(VISOR_BEZEL, f'url(#{p}graph)'),
         stroke(VISOR_BEZEL, '#ffffff', 1.6, 0.35),
         path(VISOR, f'url(#{p}glass)')]
    inner = f'<g class="eyes">{eyes}</g>'
    if state == 'sniffing':
        inner += ('<g class="scan"><rect x="230" y="164" width="34" height="84" fill="url(#{p}scan)" opacity="0.85"/>'
                  '<rect x="245.5" y="164" width="3" height="84" fill="{c}"/></g>').format(p=p, c=BALL_CORE)
    if dim < 1:
        inner += f'<path d="{VISOR}" fill="#0d0812" opacity="{_f(1 - dim)}"/>'
    # gloss: broad top reflection + a sharp highlight, and the animated glint (parked off-glass)
    inner += path('M178 190 C 200 172 300 170 366 196 L 360 204 C 300 184 214 184 184 200 Z', f'url(#{p}gloss)')
    inner += stroke('M190 184 C 230 172 300 174 350 190', '#ffffff', 2.4, 0.75)
    inner += stroke('M232 228 C 270 233 320 232 350 226', '#ffffff', 1.6, 0.18)
    inner += f'<g class="glint"><path d="M120 160 L150 160 L120 250 L90 250 Z" fill="url(#{p}glint)"/></g>'
    s.append(f'<g clip-path="url(#{p}clipVisor)">{inner}</g>')
    s.append(stroke(VISOR, '#000000', 1.4, 0.4))
    return ''.join(s)


def head(p, state, eyes, dim=1.0, jaw_open=0, tongue=False, nose_glow=False, ears=(0, 0), prop=''):
    s = []
    led = 0.45 if state == 'sleeping' else 1.0
    fold = 0.72 if ears[0] > 30 else 1.0
    s.append(ear(p, EAR_FAR, -10 + ears[1], far=True, fold=fold))
    s.append(path(HEAD_BASE, f'url(#{p}graph)') + stroke(HEAD_BASE, '#ffffff', 1.6, 0.22)
             + stroke(HEAD_BASE, f'url(#{p}rim)', 3.2))
    # jaw (articulated about JAW_HINGE)
    jx, jy = JAW_HINGE
    s.append(path(MOUTH_GAP, '#140c1a'))
    jaw = (f'<g transform="rotate({_f(-jaw_open)} {jx} {jy})">' + plate(JAW, p, 'shellSide', 2)
           + stroke('M150 300 L250 306', '#7d6e86', 1.6, 0.5) + '</g>')
    if jaw_open:
        s.append(path('M126 286 L262 288 L270 300 L140 318 Z', '#140c1a'))
    s.append(jaw)
    s.append(prop)
    if tongue:
        s.append(path(TONGUE_SHAPE, f'url(#{p}tongue)') + stroke('M184 296 L186 320', TONGUE_DEEP, 2, 0.6)
                 + f'<ellipse cx="176" cy="312" rx="4" ry="7" fill="#ffffff" opacity="0.35"/>')
    # armour
    s.append(plate(CHEEK, p, 'shellSide', 2.2))
    s.append(plate(MUZZLE, p, 'shell', 2.4))
    s.append(plate(MUZZLE_TOP, p, 'shellTop', 1.8))
    s.append(plate(CRANIUM, p, 'shellTop', 2.6))
    s.append(plate(BROW, p, 'shell', 2))
    # details: seams, vents, bolts
    s.append(stroke('M300 128 L312 162', '#8f8096', 2, 0.6))
    for i in range(3):
        s.append(stroke(f'M{338 + i * 12} 262 L{330 + i * 12} 290', '#4a3a55', 4.5, 0.7))
    s.append(bolt(276, 284, 6) + bolt(380, 200, 4) + bolt(232, 262, 3.5))
    # nose sensor
    s.append(path(NOSE, f'url(#{p}graph)') + stroke(NOSE, '#ffffff', 1.4, 0.3))
    s.append('<ellipse cx="98" cy="236" rx="7" ry="3.5" fill="#ffffff" opacity="0.45"/>')
    if nose_glow:
        s.append(f'<g class="nose">{glow(100, 252, 30, 22, p)}'
                 f'<rect x="90" y="248" width="20" height="6" rx="3" fill="{BALL_CORE}"/></g>')
    else:
        s.append(f'<rect x="92" y="249" width="16" height="4" rx="2" fill="#5a4864"/>')
    s.append(visor(p, eyes, state, dim))
    # forehead status light
    s.append(f'<rect x="246" y="140" width="26" height="5" rx="2.5" fill="{BALL}" opacity="{_f(led)}" transform="rotate(2 259 142)"/>')
    s.append(ear(p, EAR_NEAR, 6 + ears[0], led=led, fold=fold))
    return ''.join(s)


def sniff_arcs(p):
    s = ''
    for i, r in enumerate((40, 62, 84)):
        a0, a1 = math.radians(130), math.radians(220)
        cx, cy = 100, 256
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        op = 0.85 - i * 0.25
        s += stroke(f'M{x0:.1f} {y0:.1f} A {r} {r} 0 0 1 {x1:.1f} {y1:.1f}', BALL, 3.5, op)
    return f'<g class="arcs">{s}</g>'


# ── states ────────────────────────────────────────────────────────────────
POSE = {  # head tilt (deg, + = nose down), dy, (near ear, far ear) extra rotation (+ = laid back)
    'idle': (-2, 0, (0, 0)),
    'happy': (-7, 0, (-6, -4)),
    'sniffing': (12, 6, (2, 2)),
    'sleeping': (12, 14, (58, 46)),
    'eating': (-4, 2, (-2, 0)),
    'sad': (9, 10, (50, 40)),
}


def robodog(state, p='r_', shadow=True):
    tilt, dy, ears = POSE[state]
    kw = dict(dim=1.0, jaw_open=0, tongue=False, nose_glow=False, ears=ears, prop='')
    after = ''
    if state == 'idle':
        eyes = eye_pair(p, 'open')
        kw['tongue'] = True
    elif state == 'happy':
        eyes = eye_pair(p, 'happy')
        kw.update(tongue=True, jaw_open=6)
    elif state == 'sniffing':
        eyes = eye_pair(p, 'narrow')
        kw['nose_glow'] = True
        after = sniff_arcs(p)
    elif state == 'sleeping':
        eyes = eye_pair(p, 'standby', 0.7)
        kw['dim'] = 0.6
    elif state == 'eating':
        eyes = eye_pair(p, 'happy')
        kw.update(jaw_open=12, prop=tennis_ball(176, 300, 26, p))
    elif state == 'sad':
        eyes = eye_pair(p, 'sad', 0.9)
    else:
        raise ValueError(state)
    led = 0.45 if state == 'sleeping' else 1.0
    px, py = NECK_PIVOT
    h = head(p, state, eyes, **kw)
    if after:  # arcs move with the head
        h += after
    body = (neck_and_chest(p, led, tag=state != 'eating')
            + f'<g transform="translate(0 {dy + HEAD_DROP}) rotate({tilt} {px} {py}) '
              f'translate({px} {py}) scale({HEAD_SCALE}) translate({-px} {-py})">{h}</g>')
    if not shadow:
        body = body.replace(f'<ellipse cx="312" cy="502" rx="190" ry="16" fill="url(#{p}shadow)"/>', '', 1)
    return defs(p), body


# ── animation (CSS inside the SVG; cairosvg ignores it → static first frame) ──
_BASE_CSS = '''
.eyes, .glint, .scan, .nose, .arcs { transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
'''
_STATE_CSS = {
    'idle': '''
.eyes { animation: blink 4.6s infinite; }
.glint { animation: glint 4s ease-in-out infinite; }
@keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 93% { transform: scaleY(0.08); } 96% { transform: scaleY(1); } }
@keyframes glint { 0%, 55% { transform: translateX(0); } 85%, 100% { transform: translateX(330px); } }
''',
    'happy': '''
.eyes { animation: dblink 3.2s infinite; }
.glint { animation: glint 4s ease-in-out infinite; }
@keyframes dblink { 0%, 70%, 100% { transform: scaleY(1); } 73% { transform: scaleY(0.15); } 76% { transform: scaleY(1); }
  79% { transform: scaleY(0.15); } 82% { transform: scaleY(1); } }
@keyframes glint { 0%, 55% { transform: translateX(0); } 85%, 100% { transform: translateX(330px); } }
''',
    'sniffing': '''
.scan { animation: scan 1.6s ease-in-out infinite alternate; }
.nose { animation: pulse 0.8s ease-in-out infinite alternate; }
.arcs { animation: pulse 0.8s ease-in-out infinite alternate; }
@keyframes scan { from { transform: translateX(-66px); } to { transform: translateX(110px); } }
@keyframes pulse { from { opacity: 1; } to { opacity: 0.35; } }
''',
    'sleeping': '''
.eyes { animation: breathe 4s ease-in-out infinite; }
@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
''',
    'eating': '''
.eyes { animation: blink 3s infinite; }
@keyframes blink { 0%, 86%, 100% { transform: scaleY(1); } 90% { transform: scaleY(0.12); } 94% { transform: scaleY(1); } }
''',
    'sad': '''
.eyes { animation: flicker 5s ease-in-out infinite; }
@keyframes flicker { 0%, 100% { opacity: 1; } 40% { opacity: 0.55; } 44% { opacity: 0.9; } 47% { opacity: 0.5; } 70% { opacity: 0.75; } }
''',
}


def anim_style(state):
    return f'<style>{_BASE_CSS}{_STATE_CSS[state]}</style>'


# ── icon variants ─────────────────────────────────────────────────────────
ICON_VIEWBOX = '74 8 340 340'


def head_icon(p='r_', eyes='open', glow_eyes=True):
    """Head only (no neck/chest), idle expression, for icons. Crop with ICON_VIEWBOX."""
    e = eye_pair(p, eyes)
    if not glow_eyes:
        e = e.replace(f'fill="url(#{p}glow)"', 'fill="none"')
    return defs(p), head(p, 'idle', e, tongue=True)


def head_template():
    """Monochrome silhouette for macOS menu-bar template images: black head and
    ears, visor knocked out, LED eyes left solid (even-odd fill)."""
    def ear_t(h, a, sc):
        return f'<g transform="translate({h[0]} {h[1]}) rotate({a}) scale({sc})"><path d="{EAR}" fill="#000"/></g>'
    eyes = ''
    for (cx, cy), w in ((EYE_FAR, 30), (EYE_NEAR, 52)):
        eyes += f'M{cx - w / 2} {cy - 13} H{cx + w / 2} V{cy + 13} H{cx - w / 2} Z '
    return (ear_t(EAR_FAR, -10, 0.86) + ear_t(EAR_NEAR, 6, 1.0)
            + f'<path fill-rule="evenodd" fill="#000" d="{HEAD_BASE} {VISOR} {eyes}"/>')
