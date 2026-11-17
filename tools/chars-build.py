"""Builds the character atlas from PixelLab exports.
in : 5 idle 8-direction GIFs (48x48) + the headphones kid's 'sitting' state sheet (384x48)
out: assets/chars/chars.png (one row per character: idle 8 dirs | walk S,E,N,W x4 | sit 8 dirs) + preview
The other four characters' sitting poses are built from the headphones kid's: their own head on his sitting
body, with his hoodie/shorts/sneakers recoloured to their clothes (long hair is laid back on top)."""
import sys, json, numpy as np
from PIL import Image, ImageSequence
IDLE = sys.argv[1:6]; SIT = sys.argv[6]; OUT = sys.argv[7]
N = 48
def frames(gif): return [np.array(f.convert('RGBA')) for f in ImageSequence.Iterator(Image.open(gif))]
idle = [frames(f) for f in IDLE]
sit0 = np.array(Image.open(SIT).convert('RGBA')); sit0 = [sit0[:, d * N:(d + 1) * N] for d in range(8)]
lum = lambda c: .3 * c[0] + .59 * c[1] + .11 * c[2]
def edge_colours(fs):
    out = set()
    for f in fs:
        a = f[..., 3] > 0
        for y in range(N):
            for x in range(N):
                if a[y, x] and any(not (0 <= y + dy < N and 0 <= x + dx < N and a[y + dy, x + dx]) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))): out.add(tuple(int(v) for v in f[y, x, :3]))
    return out

dark = lambda c: lum(c) <= 38   # outline + deepest shadows stay as they are

def region_palette(img, y0, y1, x0, x1):
    p = img[y0:y1, x0:x1].reshape(-1, 4); p = p[p[:, 3] > 0][:, :3]
    p = [tuple(c) for c in p if lum(c) > 38]          # skip outline
    cols, cnt = np.unique(np.array(p), axis=0, return_counts=True) if p else (np.zeros((0, 3)), [])
    keep = [tuple(c) for c, k in zip(cols, cnt) if k >= 2]
    return sorted(keep, key=lum)

# where each character's clothes are in its front idle frame: (y0, y1, x0, x1) for top / shorts / shoes
BOXES = [
  {'top': (29, 37, 16, 32), 'shorts': (39, 42, 17, 31), 'shoes': (43, 47, 16, 32)},   # headphones kid
  {'top': (28, 34, 18, 30), 'shorts': (36, 39, 18, 30), 'shoes': (42, 47, 16, 32)},   # glasses, cream sweater, jeans shorts
  {'top': (31, 37, 16, 30), 'shorts': (38, 40, 17, 31), 'shoes': (44, 47, 16, 32)},   # pink buns
  {'top': (31, 35, 18, 28), 'shorts': (36, 39, 18, 30), 'shoes': (42, 47, 16, 32)},   # cat ears, green tee
  {'top': (31, 37, 16, 30), 'shorts': (38, 40, 17, 31), 'shoes': (43, 47, 16, 32)},   # beanie, white hoodie
]
def palette_counts(img, y0, y1, x0, x1):
    p = img[y0:y1, x0:x1].reshape(-1, 4); p = p[p[:, 3] > 0][:, :3]
    p = np.array([c for c in p if not dark(c)])
    if not len(p): return []
    cols, cnt = np.unique(p, axis=0, return_counts=True)
    return sorted([(tuple(int(v) for v in c), int(k)) for c, k in zip(cols, cnt)], key=lambda t: lum(t[0]))

def part_maps(ci):
    """map the kid's hoodie/shorts/sneaker colours onto character ci's clothes by histogram matching on brightness
       (the kid's cream drawstrings are left alone so they don't drag the hoodie dark)"""
    maps = {}
    for name in ('top', 'shorts', 'shoes'):
        a = palette_counts(idle[0][0], *BOXES[0][name]); b = palette_counts(idle[ci][0], *BOXES[ci][name])
        if name == 'top': a = [t for t in a if lum(t[0]) < 110]
        if not a or not b: continue
        ta, tb = sum(k for _, k in a), sum(k for _, k in b)
        cb, acc = [], 0
        for c, k in b: cb.append((acc / tb, (acc + k) / tb, c)); acc += k
        acc = 0
        for c, k in a:
            mid = (acc + k / 2) / ta; acc += k
            maps[c] = (name, next(cc for lo, hi, cc in cb if lo <= mid <= hi + 1e-9))
    return maps

def neck_row(img, top_pal):
    """first row (below the face) that is mostly clothes"""
    tp = np.array(top_pal, float)
    for y in range(22, 40):
        row = img[y][img[y][:, 3] > 0][:, :3].astype(float)
        if len(row) and len(tp) and (((tp[None] - row[:, None]) ** 2).sum(2).min(1) < 200).mean() > .35: return y
    return 28

def recolor(img, maps, rows):
    out = img.copy(); keys = np.array(list(maps.keys()), float) if maps else None
    for y in rows:
        for x in range(N):
            px = out[y, x]
            if px[3] == 0 or dark(px) or keys is None: continue
            d = ((keys - px[:3]) ** 2).sum(1); i = int(d.argmin())
            if d[i] < 400: out[y, x, :3] = maps[tuple(int(v) for v in keys[i])][1]
    return out

def first_diff_row(a, b):
    for y in range(N):
        if not np.array_equal(a[y], b[y]): return y
    return N

def hair_palette(img):
    return region_palette(img, 2, 12, 12, 36)

def make_sits(ci):
    if ci == 0: return sit0
    maps = part_maps(ci); hp = np.array(hair_palette(idle[ci][0]), float)
    tp = region_palette(idle[ci][0], *BOXES[ci]['top'])
    out = []
    for d in range(8):
        cut = max(24, neck_row(idle[ci][d], tp))
        s = recolor(sit0[d], maps, range(cut, N))
        s[:cut] = idle[ci][d][:cut]
        # the kid's hood/headphone bits just under the cut that stick out past this character's own head: drop them
        src = idle[ci][d]
        for y in range(cut, min(N, 42)):
            for x in range(N):
                px = src[y, x]
                if px[3] and len(hp) and lum(px) > 38 and ((hp - px[:3]) ** 2).sum(1).min() < 120:
                    if src[y - 1, x, 3] and ((hp - src[y - 1, x, :3]) ** 2).sum(1).min() < 300: s[y, x] = px  # long hair hangs on top
        out.append(s)
    return out

LEG0 = 42
def walk_frame(f, k, side):
    out = np.zeros_like(f); up = 1 if k in (1, 3) else 0
    out[0:LEG0 - up] = f[up:LEG0]
    if up: out[LEG0 - 1] = f[LEG0 - 1]
    legs = f[LEG0:N].copy(); cols = np.where(legs[..., 3].max(0) > 0)[0]
    if not len(cols): out[LEG0:] = legs; return out
    mid = (cols.min() + cols.max()) // 2
    L = legs.copy(); L[:, mid + 1:] = 0; R = legs.copy(); R[:, :mid + 1] = 0
    def place(part, dx, dy):
        p = np.roll(part, dx, 1)
        o = out[LEG0 - dy:N - dy]; m = p[..., 3] > 0; o[m] = p[m]
    if side:
        s = {0: 0, 1: 2, 2: 0, 3: -2}[k]
        place(R, -s, 1 if k == 1 else 0); place(L, s, 1 if k == 3 else 0)
    else:
        place(L, 0, 2 if k == 1 else 0); place(R, 0, 2 if k == 3 else 0)
    return out

COLS = 8 + 16 + 8
atlas = np.zeros((N * 5, N * COLS, 4), np.uint8)
for ci in range(5):
    row = list(idle[ci])
    for d in (0, 2, 4, 6): row += [walk_frame(idle[ci][d], k, d in (2, 6)) for k in range(4)]
    row += make_sits(ci)
    for i, f in enumerate(row): atlas[ci * N:(ci + 1) * N, i * N:(i + 1) * N] = f
Image.fromarray(atlas).save(OUT + '/chars.png', optimize=True)
# feet line per frame (lowest opaque row) so the game can stand each frame on the floor
feet = [[int(np.where(atlas[ci * N:(ci + 1) * N, i * N:(i + 1) * N, 3].any(1))[0].max()) for i in range(COLS)] for ci in range(5)]
json.dump({'cell': N, 'cols': COLS, 'feet': feet}, open(OUT + '/chars.json', 'w'))
prev = Image.fromarray(atlas).resize((atlas.shape[1] * 3, atlas.shape[0] * 3), Image.NEAREST)
bg = Image.new('RGBA', prev.size, (184, 119, 63, 255)); bg.alpha_composite(prev); bg.save('/tmp/chars/atlas_preview.png')
