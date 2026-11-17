"""Segment the PixelLab mannequin sprites by palette: outline / skin / garment, remove the sit cushion."""
import numpy as np
from PIL import Image
from collections import deque
DIRS = ['south','south-east','east','north-east','north','north-west','west','south-west']
hx = lambda s: tuple(int(s[i:i+2],16) for i in (0,2,4))
OUTL = {hx(c) for c in '000000 180704'.split()}
GARM = {hx(c) for c in 'ebf1f1 dbe2e4 c5ced5 b5c0cb acb4bf 9faab7 99a2ae 85899f 7b7b92 686481 625c79 59526d'.split()}
CUSH = {hx(c) for c in '6c210f 993b1e 7b2d16 541c0d 42180d 4b4557 80483b 4e2f31'.split()}
def load(path): return np.array(Image.open(path).convert('RGBA'))
def key(a, y, x): return tuple(int(v) for v in a[y, x, :3])
N4 = ((1,0),(-1,0),(0,1),(0,-1))
def cls(a):
    """per-pixel class: 0 empty, 1 outline, 2 skin(ish), 3 garment"""
    H, W = a.shape[:2]; c = np.zeros((H, W), np.uint8)
    for y in range(H):
        for x in range(W):
            if a[y, x, 3] == 0: continue
            k = key(a, y, x)
            c[y, x] = 1 if k in OUTL else 3 if k in GARM else 2
    return c
def remove_cushion(a):
    a = a.copy(); H, W = a.shape[:2]
    # start from cushion-coloured pixels in the bottom 14 rows
    seen = np.zeros((H, W), bool); q = deque()
    for y in range(H - 14, H):
        for x in range(W):
            if a[y, x, 3] and key(a, y, x) in CUSH: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in N4:
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not seen[ny, nx] and a[ny, nx, 3] and key(a, ny, nx) in CUSH and ny >= H - 22:
                seen[ny, nx] = True; q.append((ny, nx))
    a[seen] = 0
    # drop outline pixels that no longer touch the body
    changed = True
    while changed:
        changed = False
        for y in range(H):
            for x in range(W):
                if a[y, x, 3] and key(a, y, x) in OUTL:
                    body = any(0 <= y+dy < H and 0 <= x+dx < W and a[y+dy, x+dx, 3] and key(a, y+dy, x+dx) not in OUTL for dy, dx in N4)
                    if not body: a[y, x] = 0; changed = True
    # re-outline body pixels left on the edge
    b = a.copy()
    for y in range(H):
        for x in range(W):
            if a[y, x, 3] and key(a, y, x) not in OUTL and any(not (0 <= y+dy < H and 0 <= x+dx < W) or a[y+dy, x+dx, 3] == 0 for dy, dx in N4):
                b[y, x, :3] = (24, 7, 4)
    return b

def keep_main(a):
    """drop stray pixels: keep the largest 8-connected blob"""
    H, W = a.shape[:2]; lab = -np.ones((H, W), int); best = None; comps = []
    for y in range(H):
        for x in range(W):
            if a[y, x, 3] and lab[y, x] < 0:
                q = [(y, x)]; lab[y, x] = len(comps); pts = []
                while q:
                    cy, cx = q.pop(); pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < H and 0 <= nx < W and a[ny, nx, 3] and lab[ny, nx] < 0: lab[ny, nx] = len(comps); q.append((ny, nx))
                comps.append(pts)
    a = a.copy(); big = max(range(len(comps)), key=lambda i: len(comps[i]))
    for i, pts in enumerate(comps):
        if i != big:
            for y, x in pts: a[y, x] = 0
    return a

EYEC = {hx(c) for c in '000000 42180d dbe2e4 180704'.split()}
def analyse(a):
    """head box, neck row and PixelLab eye blobs"""
    H, W = a.shape[:2]; m = a[..., 3] > 0
    rows = [np.nonzero(m[y])[0] for y in range(H)]
    top = next(y for y in range(H) if len(rows[y]))
    wid = [len(r) and (r[-1] - r[0] + 1) for r in rows]
    # neck: narrowest row between the widest head row and 26 rows down
    hmax = max(range(top, top + 18), key=lambda y: wid[y])
    neck = min(range(hmax + 3, min(H, top + 26)), key=lambda y: (wid[y], y))
    hl = min(rows[y][0] for y in range(top, neck)); hr = max(rows[y][-1] for y in range(top, neck))
    # eye blobs: dark/eye-white clusters fully inside the head (never touching transparency)
    cand = np.zeros((H, W), bool)
    for y in range(top + 3, neck):
        for x in range(hl + 1, hr):
            if m[y, x] and key(a, y, x) in EYEC: cand[y, x] = True
    seen = np.zeros_like(cand); blobs = []
    for y in range(H):
        for x in range(W):
            if cand[y, x] and not seen[y, x]:
                q = [(y, x)]; seen[y, x] = True; pts = []
                while q:
                    cy, cx = q.pop(); pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if cand[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
                edge = any(not m[cy + dy, cx + dx] for cy, cx in pts for dy, dx in N4)
                if not edge and 2 <= len(pts) <= 8: blobs.append(pts)
    return dict(top=top, neck=neck, hl=hl, hr=hr, eyes=blobs)
