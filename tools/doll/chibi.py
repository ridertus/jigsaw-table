"""Chibi characters: the PixelLab mannequin body made shorter (rows removed) + a rendered big head (head.py).
Matches the proportions of the old characters: head ~27px, body ~18px."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import doll as D
import head as Hd
from seg import load, keep_main, remove_cushion, DIRS

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'doll', 'pixellab')
POSE = {'idle': 'Idle', 'walk': 'walking_small_arm_s', 'sit': 'sitting_on_a_floor_c'}
OUTLINE = (44, 18, 28, 255)
_base = {}
def base(pose, d):
    if (pose, d) not in _base:
        a = load(os.path.join(SRC, POSE[pose], 'rotations', d + '.png'))
        if pose == 'sit': a = keep_main(remove_cushion(a))
        _base[(pose, d)] = a
    return _base[(pose, d)]

def pick(lo, hi, n):
    if hi - lo + 1 <= n: return list(range(lo, hi + 1))[:n]
    return [int(round(lo + (hi - lo) * (k + 1) / (n + 1))) for k in range(n)]

def body(a, d, look, pose):
    fr = D.Frame(a, d); fr.pose = pose
    img = D.recolor_skin(a, fr, look.get('skin', 'peach'))
    img = D.top_layer(img, fr, look.get('top', 'tee'), look.get('topc', '#ffffff'))
    if look.get('top') != 'dress': img = D.bottom_layer(img, fr, look.get('bottom', 'shorts'), look.get('botc', '#ffffff'))
    img = D.shoes_layer(img, fr, look.get('shoes', 'sneakers'), look.get('shoec', '#ffffff'))
    # warm outline like the old characters
    blk = (img[..., 3] > 0) & (img[..., :3].sum(-1) < 75)
    img[blk] = OUTLINE
    # rows to drop: torso 3, shorts 1, legs 2
    m = img[..., 3] > 0; bottom = int(np.nonzero(m.any(1))[0][-1])
    drop = pick(fr.gtop + 2, fr.waist - 1, 2) + pick(fr.waist + 1, fr.gbot - 1, 1) + pick(fr.gbot + 1, bottom - 2, 3)
    keep = [y for y in range(fr.neck, bottom + 1) if y not in drop]
    out = np.zeros_like(img); top = bottom + 1 - len(keep)
    out[top:bottom + 1] = img[keep]
    # pull the arms in: drop up to 2 columns per side that hold only arm pixels (front / back / diagonal views)
    arm = np.zeros(img.shape[:2], bool); arm[top:bottom + 1] = fr.arm[keep]
    garm = np.zeros(img.shape[:2], bool); garm[top:bottom + 1] = (fr.c == 3)[keep] | fr.leg[keep]
    occ = out[..., 3] > 0
    cols = []
    if d not in ('east', 'west'):
        core = np.nonzero(garm.any(0))[0]; c0, c1 = core[0], core[-1]
        ok = lambda x: occ[:, x].any() and not garm[:, x].any()
        left = [x for x in range(c0 - 1, 0, -1) if ok(x)][1:4]
        right = [x for x in range(c1 + 1, 47) if ok(x)][1:4]
        cols = left + right
    if cols:
        keepc = [x for x in range(48) if x not in cols]
        o2 = np.zeros_like(out); L = len([x for x in cols if x < 24]); R = len(cols) - L
        o2[:, L:L + len(keepc)] = out[:, keepc]
        # re-centre: shift so the torso stays where it was
        out = np.roll(o2, 0, 1)
    return out, top       # top = new neck row

_head = {}
def head(d, look):
    k = (d, look.get('hair', 'fluffy'), look.get('hairc', '#5a3a2a'), look.get('skin', 'peach'), look.get('eyes', 'anime'), look.get('iris', '#7a3a2a'))
    if k not in _head:
        skin = D.SKIN_TONES[look.get('skin', 'peach')]
        f, b, face, hit, dep = Hd.render(d, k[1], k[2], skin)
        f = Hd.draw_face(f, face, k[4], D.IRIS.get(k[5], (k[5],))[0] if k[5] in D.IRIS else k[5], skin)
        _head[k] = (f, b)
    return _head[k]

HEAD_NECK = 27   # row where the rendered head's chin meets the neck
def over(dst, src, dy=0):
    s = np.zeros_like(src)
    if dy >= 0: s[dy:] = src[:src.shape[0] - dy]
    else: s[:dy] = src[-dy:]
    a = s[..., 3:4] > 0
    return np.where(a, s, dst)

def compose(look, pose, d, mirror=False, bob=0):
    a = base(pose, d)
    if mirror: a = np.ascontiguousarray(a[:, ::-1])
    bd, neck = body(a, d, look, pose)
    f, b = head(d, look)
    dy = neck - HEAD_NECK + 1 - bob
    img = np.zeros((48, 48, 4), np.uint8)
    img = over(img, b, dy); img = over(img, bd, -bob if bob else 0); img = over(img, f, dy)
    if look.get('glasses'): pass
    return img

def atlas_row(look):
    row = np.zeros((48, 48 * 32, 4), np.uint8)
    put = lambda col, f: row.__setitem__((slice(None), slice(col * 48, col * 48 + 48)), f)
    for i, d in enumerate(DIRS): put(i, compose(look, 'idle', d))
    for j, d in enumerate(['south', 'east', 'north', 'west']):
        A = compose(look, 'walk', d); P = compose(look, 'idle', d, bob=1)
        Bm = compose(look, 'walk', d, mirror=True) if d in ('south', 'north') else A
        for k, f in enumerate([A, P, Bm, P]): put(8 + j * 4 + k, f)
    for i, d in enumerate(DIRS): put(24 + i, compose(look, 'sit', d))
    return row
