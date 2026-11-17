# Генерирует фоны тем: public/bg-warm.svg и public/bg-night.svg
import random, math, os
W, H = 1600, 1000
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

def ridge(base, amp, col, op, seed, step=36, extra=''):
    random.seed(seed); pts = []
    for x in range(-40, W + 80, step):
        y = base + math.sin(x / 170 + seed) * amp * 0.6 + math.sin(x / 61 + seed * 2) * amp * 0.25 + random.uniform(-amp * .2, amp * .2)
        pts.append((x, y))
    d = 'M-40 %d ' % H + ' '.join('L%d %d' % p for p in pts) + ' L%d %d Z' % (W + 80, H)
    return f'<path d="{d}" fill="{col}" opacity="{op}" {extra}/>'

def fuji(cx, top, base, half, body, snow, snow_op=.95):
    l, r = cx - half, cx + half
    p = [f'<path d="M{l} {base} C{cx-half*.55} {base-30} {cx-half*.22} {top+60} {cx-18} {top+6} C{cx-8} {top-2} {cx+8} {top-2} {cx+18} {top+6} C{cx+half*.22} {top+60} {cx+half*.55} {base-30} {r} {base} Z" fill="{body}"/>']
    s = top + (base - top) * .26
    random.seed(cx)
    pts = []
    n = 9
    for i in range(n + 1):
        x = cx - 70 + 140 * i / n
        y = s + (random.uniform(-6, 26) if 0 < i < n else 0)
        pts.append((x, y))
    d = f'M{cx-18} {top+6} C{cx-8} {top-2} {cx+8} {top-2} {cx+18} {top+6} L{cx+70} {s} ' + ' '.join('L%.0f %.0f' % q for q in reversed(pts)) + ' Z'
    p.append(f'<path d="{d}" fill="{snow}" opacity="{snow_op}"/>')
    return ''.join(p)

def blossoms(centers, cols, seed, scale=1.0, op=.95):
    random.seed(seed); o = []
    for cx, cy in centers:
        for _ in range(random.randint(12, 20)):
            x = cx + random.gauss(0, 26 * scale); y = cy + random.gauss(0, 20 * scale); r = random.uniform(5, 10) * scale
            col = random.choice(cols)
            o.append(f'<g transform="translate({x:.1f} {y:.1f}) rotate({random.randint(0,72)})" opacity="{op}">')
            for k in range(5):
                o.append(f'<ellipse cy="{-r*.75:.1f}" rx="{r*.55:.1f}" ry="{r*.8:.1f}" fill="{col}" transform="rotate({k*72})"/>')
            o.append(f'<circle r="{r*.22:.1f}" fill="#c9606f"/></g>')
    return ''.join(o)

def foliage(x0, x1, y0, y1, n, cols, seed, rmin=14, rmax=34, op=1):
    random.seed(seed); o = [f'<g opacity="{op}">']
    for _ in range(n):
        x = random.uniform(x0, x1); y = random.uniform(y0, y1); r = random.uniform(rmin, rmax)
        o.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{r:.0f}" ry="{r*.7:.0f}" fill="{random.choice(cols)}"/>')
    o.append('</g>'); return ''.join(o)

def lantern(x, y, s, glow_id, body='#f4b56a', rib='#9c4a2a'):
    o = [f'<line x1="{x}" y1="{y-120*s}" x2="{x}" y2="{y-48*s}" stroke="#2a1d16" stroke-width="{2*s}"/>',
         f'<circle cx="{x}" cy="{y}" r="{150*s}" fill="url(#{glow_id})"/>',
         f'<rect x="{x-20*s}" y="{y-52*s}" width="{40*s}" height="{9*s}" rx="{2*s}" fill="#2e211a"/>',
         f'<rect x="{x-20*s}" y="{y+43*s}" width="{40*s}" height="{9*s}" rx="{2*s}" fill="#2e211a"/>',
         f'<ellipse cx="{x}" cy="{y}" rx="{38*s}" ry="{46*s}" fill="{body}"/>',
         f'<ellipse cx="{x-6*s}" cy="{y-6*s}" rx="{22*s}" ry="{30*s}" fill="#fff1cf" opacity=".55"/>']
    for k in (-30, -15, 0, 15, 30):
        o.append(f'<path d="M{x-37*s} {y+k*s} Q{x} {y+k*s+7*s} {x+37*s} {y+k*s}" stroke="{rib}" stroke-width="{1.2*s}" fill="none" opacity=".45"/>')
    o.append(f'<line x1="{x}" y1="{y+52*s}" x2="{x}" y2="{y+72*s}" stroke="#7a3b22" stroke-width="{3*s}"/>')
    return ''.join(o)

def house(shoji_light, wood, roof, glow_op):
    o = []
    # стена и сёдзи
    o.append(f'<rect x="-10" y="250" width="210" height="620" fill="{wood}"/>')
    for col in range(2):
        x = 18 + col * 88
        o.append(f'<rect x="{x}" y="300" width="74" height="470" fill="{shoji_light}" opacity="{glow_op}"/>')
        for k in range(1, 3): o.append(f'<line x1="{x+k*74/3:.1f}" y1="300" x2="{x+k*74/3:.1f}" y2="770" stroke="{wood}" stroke-width="3"/>')
        for k in range(1, 8): o.append(f'<line x1="{x}" y1="{300+k*470/8:.1f}" x2="{x+74}" y2="{300+k*470/8:.1f}" stroke="{wood}" stroke-width="3"/>')
    o.append(f'<rect x="196" y="250" width="16" height="620" fill="{roof}"/>')
    # крыша
    o.append(f'<path d="M-20 140 L330 260 L322 286 L-20 190 Z" fill="{roof}"/>')
    for i in range(14):
        x = -10 + i * 25; y = 145 + i * 8.6
        o.append(f'<path d="M{x} {y} l18 6 l-2 26 l-18 -6 Z" fill="{wood}" opacity=".6"/>')
    o.append(f'<path d="M-20 186 L322 286 L318 300 L-20 202 Z" fill="#1b130e"/>')
    # настил
    o.append(f'<path d="M-20 850 L470 850 L520 1000 L-20 1000 Z" fill="{wood}"/>')
    for i in range(7):
        y = 860 + i * 22
        o.append(f'<line x1="-20" y1="{y}" x2="{475+i*7}" y2="{y}" stroke="#1d140f" stroke-width="2" opacity=".55"/>')
    o.append(f'<rect x="-20" y="838" width="490" height="14" fill="{roof}"/>')
    return ''.join(o)

def cat(x, y, s, fur, patch, dark):
    return f'''<g transform="translate({x} {y}) scale({s})">
<ellipse cx="0" cy="0" rx="62" ry="26" fill="{fur}"/>
<ellipse cx="-18" cy="-8" rx="26" ry="14" fill="{patch}"/>
<path d="M50 6 C80 14 92 -4 70 -10" stroke="{patch}" stroke-width="11" fill="none" stroke-linecap="round"/>
<circle cx="-56" cy="-6" r="22" fill="{fur}"/>
<ellipse cx="-62" cy="-14" rx="12" ry="9" fill="{patch}"/>
<path d="M-72 -22 L-70 -42 L-58 -26 Z" fill="{patch}"/><path d="M-50 -24 L-42 -42 L-38 -22 Z" fill="{fur}"/>
<path d="M-66 -4 q4 3 8 0 M-52 -3 q4 3 8 0" stroke="{dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<ellipse cx="-30" cy="20" rx="16" ry="7" fill="{fur}"/>
</g>'''

def pine(x, y, s, col):
    p = [f'<g fill="{col}">', f'<rect x="{x-1.5*s}" y="{y-10*s}" width="{3*s}" height="{12*s}"/>']
    for k in range(4):
        ww = (14 - 2.6 * k) * s; yy = y - 10 * s - k * 7 * s
        p.append(f'<path d="M{x-ww} {yy} Q{x} {yy-9*s} {x+ww} {yy} Q{x} {yy-3*s} {x-ww} {yy}Z"/>')
    p.append('</g>'); return ''.join(p)

# ───────────────── Тёплая ─────────────────
def warm():
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">']
    o.append('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8a596"/><stop offset=".3" stop-color="#dcbca3"/><stop offset=".62" stop-color="#f4cfa4"/><stop offset="1" stop-color="#eec19a"/></linearGradient>
<radialGradient id="sunglow" cx="430" cy="690" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff4dc"/><stop offset=".18" stop-color="#ffd9a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffd9a8" stop-opacity="0"/></radialGradient>
<radialGradient id="lglow"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".75"/><stop offset=".35" stop-color="#ffb35c" stop-opacity=".25"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dcc0" stop-opacity="0"/><stop offset="1" stop-color="#f6dcc0" stop-opacity=".92"/></linearGradient>
<linearGradient id="fj" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a7d8c"/><stop offset="1" stop-color="#c3a49b"/></linearGradient>
<filter id="b6"><feGaussianBlur stdDeviation="6"/></filter><filter id="b2"><feGaussianBlur stdDeviation="1.5"/></filter>
</defs>''')
    o.append(f'<rect width="{W}" height="{H}" fill="url(#sky)"/><rect width="{W}" height="{H}" fill="url(#sunglow)"/>')
    random.seed(3)
    for _ in range(10):
        o.append(f'<ellipse cx="{random.randint(0,W)}" cy="{random.randint(80,460)}" rx="{random.randint(160,380)}" ry="{random.randint(8,20)}" fill="#fff3e2" opacity=".35" filter="url(#b6)"/>')
    o.append('<circle cx="430" cy="690" r="34" fill="#fff6e6"/>')
    o.append(fuji(390, 600, 800, 330, 'url(#fj)', '#f8efe8'))
    o.append(ridge(760, 40, '#c7a397', .6, 1))
    o.append(f'<rect y="680" width="{W}" height="150" fill="url(#mist)"/>')
    o.append(ridge(810, 46, '#ad8c84', .62, 2))
    o.append(f'<rect y="760" width="{W}" height="140" fill="url(#mist)" opacity=".85"/>')
    o.append(ridge(870, 40, '#8f7e6a', .7, 3))
    o.append('<g opacity=".7">' + ''.join(pine(random.randint(980, 1620), random.randint(860, 905), random.uniform(1.2, 2), '#5d5d45') for _ in range(22)) + '</g>')
    # кусты на переднем плане справа
    o.append(foliage(900, 1650, 900, 1010, 70, ['#5b5e3d', '#6b6c45', '#7a774b', '#4b4f33'], 8, 18, 46))
    o.append(foliage(1050, 1650, 930, 1010, 30, ['#e9b9b5', '#f0c8c0'], 9, 3, 6, .7))
    # дом, фонарь, кот
    o.append(house('#f6cf8e', '#3a281e', '#2a1d16', .92))
    o.append('<rect x="18" y="300" width="162" height="470" fill="#ffdca0" opacity=".25" filter="url(#b6)"/>')
    o.append(lantern(255, 470, 1.15, 'lglow'))
    o.append(cat(330, 818, 1.0, '#f6efe6', '#b77a49', '#3b2a20'))
    # сакура
    o.append('<g fill="none" stroke="#4e352a" stroke-linecap="round"><path d="M-20 40 C80 60 160 100 240 112 C310 122 370 160 430 200" stroke-width="12"/><path d="M120 76 C150 30 200 10 260 0" stroke-width="7"/><path d="M240 112 C268 160 280 210 300 240" stroke-width="5"/><path d="M340 150 C390 140 440 120 490 128" stroke-width="5"/></g>')
    o.append(blossoms([(80, 60), (160, 92), (240, 112), (310, 132), (390, 180), (440, 205), (480, 128), (260, 12), (200, 30), (300, 236), (350, 160), (40, 40)], ['#f6c7cf', '#f2b6c1', '#f9d6db', '#eda5b3', '#fbe2e4'], 5))
    random.seed(12)
    for _ in range(24):
        x = random.randint(0, 900); y = random.randint(160, 840)
        o.append(f'<ellipse cx="{x}" cy="{y}" rx="4" ry="2.4" fill="#f4c0c9" opacity=".75" transform="rotate({random.randint(0,180)} {x} {y})"/>')
    o.append('</svg>')
    return '\n'.join(o)

# ───────────────── Ночная ─────────────────
def night():
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">']
    o.append('''<defs>
<linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1b18"/><stop offset=".45" stop-color="#26241f"/><stop offset="1" stop-color="#151411"/></linearGradient>
<radialGradient id="moonhalo" cx="1060" cy="100" r="320" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9dcb8" stop-opacity=".28"/><stop offset=".3" stop-color="#cdbf98" stop-opacity=".09"/><stop offset="1" stop-color="#cdbf98" stop-opacity="0"/></radialGradient>
<radialGradient id="moon" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#f3e7c8"/><stop offset="1" stop-color="#cdb98c"/></radialGradient>
<radialGradient id="nglow"><stop offset="0" stop-color="#ffbe62" stop-opacity=".55"/><stop offset=".4" stop-color="#ff9f45" stop-opacity=".16"/><stop offset="1" stop-color="#ff9f45" stop-opacity="0"/></radialGradient>
<linearGradient id="nmist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a372f" stop-opacity="0"/><stop offset="1" stop-color="#3a372f" stop-opacity=".75"/></linearGradient>
<linearGradient id="nfj" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4741"/><stop offset="1" stop-color="#2a2824"/></linearGradient>
<filter id="nb6"><feGaussianBlur stdDeviation="6"/></filter>
</defs>''')
    o.append(f'<rect width="{W}" height="{H}" fill="url(#nsky)"/><rect width="{W}" height="{H}" fill="url(#moonhalo)"/>')
    random.seed(21)
    for _ in range(90):
        o.append(f'<circle cx="{random.randint(0,W)}" cy="{random.randint(0,520)}" r="{random.uniform(.5,1.4):.1f}" fill="#efe6cf" opacity="{random.uniform(.15,.6):.2f}"/>')
    for _ in range(6):
        o.append(f'<ellipse cx="{random.randint(400,1500)}" cy="{random.randint(150,400)}" rx="{random.randint(150,320)}" ry="{random.randint(8,18)}" fill="#8a826d" opacity=".12" filter="url(#nb6)"/>')
    o.append('<circle cx="1060" cy="100" r="42" fill="url(#moon)"/>')
    random.seed(4)
    for _ in range(7):
        o.append(f'<circle cx="{1060+random.uniform(-24,24):.0f}" cy="{100+random.uniform(-24,24):.0f}" r="{random.uniform(3,8):.0f}" fill="#b9a67c" opacity=".35"/>')
    o.append(fuji(860, 30, 300, 380, 'url(#nfj)', '#d9d3c4', .8))
    o.append(f'<rect y="180" width="{W}" height="330" fill="url(#nmist)" opacity=".7"/>')
    o.append(ridge(420, 50, '#2b2925', .9, 5))
    o.append(ridge(560, 46, '#22201c', .95, 6))
    o.append(ridge(760, 40, '#1b1a17', 1, 7))
    # листва сверху
    o.append('<g fill="none" stroke="#2c2419" stroke-linecap="round"><path d="M-20 60 C120 90 260 70 420 110 C520 135 600 120 700 90" stroke-width="10"/><path d="M200 78 C240 40 300 20 360 10" stroke-width="6"/><path d="M480 120 C520 160 540 200 560 230" stroke-width="5"/></g>')
    random.seed(30); leaves = []
    for _ in range(140):
        x = random.uniform(-20, 760); y = random.uniform(-10, 240) * (1 - x / 1400)
        a = random.randint(0, 180); r = random.uniform(9, 16)
        col = random.choice(['#4d4a2e', '#5d5935', '#6f6a3d', '#3e3c27', '#857d45'])
        leaves.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{r:.0f}" ry="{r*.45:.0f}" fill="{col}" transform="rotate({a} {x:.0f} {y:.0f})"/>')
    o.append('<g opacity=".9">' + ''.join(leaves) + '</g>')
    # дом слева
    o.append(house('#d99c55', '#1f1812', '#15100c', .55))
    o.append('<rect x="18" y="300" width="162" height="470" fill="#ffb562" opacity=".18" filter="url(#nb6)"/>')
    o.append(lantern(255, 470, 1.05, 'nglow', body='#e8a252', rib='#6e3418'))
    o.append(foliage(-40, 760, 880, 1020, 60, ['#232419', '#2a2a1c', '#303020', '#1d1e16'], 31, 20, 50))
    o.append(foliage(960, 1660, 900, 1020, 50, ['#202118', '#27271b', '#1b1c15'], 32, 20, 52))
    # каменный фонарь
    o.append('''<g transform="translate(262 985) scale(.85)">
<circle cx="0" cy="-70" r="120" fill="url(#nglow)"/>
<path d="M-70 -110 L70 -110 L46 -136 L-46 -136 Z" fill="#4a463d"/><path d="M-18 -150 L18 -150 L10 -136 L-10 -136Z" fill="#4a463d"/><circle cx="0" cy="-156" r="8" fill="#4a463d"/>
<rect x="-38" y="-110" width="76" height="62" fill="#3b3831"/><rect x="-22" y="-100" width="44" height="40" fill="#ffc06a"/><line x1="0" y1="-100" x2="0" y2="-60" stroke="#3b3831" stroke-width="5"/>
<rect x="-50" y="-48" width="100" height="14" fill="#4a463d"/><rect x="-18" y="-34" width="36" height="70" fill="#3b3831"/><rect x="-46" y="36" width="92" height="16" fill="#4a463d"/>
</g>''')
    o.append('</svg>')
    return '\n'.join(o)

open(os.path.join(OUT, 'bg-warm.svg'), 'w').write(warm())
open(os.path.join(OUT, 'bg-night.svg'), 'w').write(night())
print('ok')
