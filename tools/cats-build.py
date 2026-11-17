"""Cat atlas from PixelLab: orange tabby idle (8 dirs) + 'curled up sleeping' state (8 dirs), 32x32 cells.
Rows: orange, white (recoloured), black tuxedo (recoloured). Columns: idle 8 | walk S,E,N,W x4 | sleep 8."""
import sys, json, colorsys, numpy as np
from PIL import Image
IDLE, SLEEP, OUT = sys.argv[1:4]
N = 32
load = lambda p: [np.array(Image.open(p).convert('RGBA'))[:, d * N:(d + 1) * N] for d in range(8)]
idle, sleep = load(IDLE), load(SLEEP)
lum = lambda c: .3 * c[0] + .59 * c[1] + .11 * c[2]

def classify(px):
    r, g, b = [v / 255 for v in px[:3]]; h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if lum(px[:3]) < 30: return 'line'
    if lum(px[:3]) < 62: return 'deep'          # dark brown stripe edges and eyes
    if r > .75 and b > .45 and g < .75 and r - g > .12 and b > g - .1: return 'pink'
    if s < .33 and v > .78: return 'cream'
    if .02 < h < .14 and s >= .33: return 'fur'
    return 'other'
fur_l = [lum(px[:3]) for f in idle + sleep for row in f for px in row if px[3] and classify(px) == 'fur']
LMIN, LMAX = min(fur_l), max(fur_l)
def ramp(stops, t):
    t = max(0, min(1, t)) * (len(stops) - 1); i = min(int(t), len(stops) - 2); k = t - i
    a, b = np.array(stops[i]), np.array(stops[i + 1]); return (a + (b - a) * k).round().astype(np.uint8)
hexc = lambda h: [int(h[i:i + 2], 16) for i in (1, 3, 5)]
COATS = {
  'white': {'fur': [hexc('#a9a49e'), hexc('#d9d4cc'), hexc('#fbf8f2')], 'cream': [hexc('#ffffff')], 'deep': hexc('#7c7680')},
  'black': {'fur': [hexc('#1c1a21'), hexc('#34303b'), hexc('#57515f')], 'cream': None, 'deep': hexc('#3d302b')},
}
def recolor(f, coat):
    o = f.copy(); C = COATS[coat]
    for y in range(N):
        for x in range(N):
            px = f[y, x]
            if not px[3]: continue
            k = classify(px)
            if k == 'fur': o[y, x, :3] = ramp(C['fur'], (lum(px[:3]) - LMIN) / (LMAX - LMIN))
            elif k == 'cream' and C['cream']: o[y, x, :3] = C['cream'][0]
            elif k == 'deep': o[y, x, :3] = C['deep']
    return o
def walk(f, k, side):
    """4-frame walk from a standing frame. Legs = rows below where the silhouette splits into two leg groups.
       side views: legs scissor (front pair forward, back pair back, then swap); front/back views: alternate steps."""
    a = f[..., 3] > 0; ys = np.where(a.any(1))[0]; bottom = ys.max()
    L0 = bottom - 3
    for y in range(bottom - 6, bottom + 1):          # first row with a gap inside the silhouette
        xs = np.where(a[y])[0]
        if len(xs) and (xs.max() - xs.min() + 1) > len(xs): L0 = y; break
    xs = np.where(a[L0])[0]; run = [x for x in range(xs.min(), xs.max()) if not a[L0, x]]
    mid = (run[0] + run[-1]) // 2 if run else (xs.min() + xs.max()) // 2
    bob = 1 if k in (1, 3) else 0
    out = np.zeros_like(f); out[0:L0 - bob] = f[bob:L0]
    if bob: out[L0 - 1] = np.where(out[L0 - 1][..., 3:4] > 0, out[L0 - 1], f[L0 - 1])
    legs = f[L0:N].copy(); A = legs.copy(); A[:, mid + 1:] = 0; B = legs.copy(); B[:, :mid + 1] = 0
    def put(part, dx, up):
        p = np.roll(part, dx, 1); y0 = L0 - up; seg = out[y0:y0 + p.shape[0]]; m = p[:seg.shape[0], :, 3] > 0; seg[m] = p[:seg.shape[0]][m]
    s = {0: 0, 1: 2, 2: 0, 3: -2}[k]
    if side: put(A, -s, 1 if k == 3 else 0); put(B, s, 1 if k == 1 else 0)
    else: put(A, 0, 2 if k == 1 else 0); put(B, 0, 2 if k == 3 else 0)
    return out
def row(fi, fs):
    r = list(fi)
    for d in (0, 2, 4, 6): r += [walk(fi[d], k, d in (2, 6)) for k in range(4)]
    return r + list(fs)
rows = [row(idle, sleep), row([recolor(f, 'white') for f in idle], [recolor(f, 'white') for f in sleep]), row([recolor(f, 'black') for f in idle], [recolor(f, 'black') for f in sleep])]
atlas = np.zeros((N * 3, N * 32, 4), np.uint8)
for ri, r in enumerate(rows):
    for ci, f in enumerate(r): atlas[ri * N:(ri + 1) * N, ci * N:(ci + 1) * N] = f
Image.fromarray(atlas).save(OUT + '/cats.png', optimize=True)
feet = [[int(np.where(atlas[ri * N:(ri + 1) * N, ci * N:(ci + 1) * N, 3].any(1))[0].max()) for ci in range(32)] for ri in range(3)]
json.dump({'cell': N, 'feet': feet}, open(OUT + '/cats.json', 'w'))
p = Image.fromarray(atlas).resize((atlas.shape[1] * 4, atlas.shape[0] * 4), Image.NEAREST); bg = Image.new('RGBA', p.size, (184, 119, 63, 255)); bg.alpha_composite(p); bg.save('/tmp/cat/atlas.png')
