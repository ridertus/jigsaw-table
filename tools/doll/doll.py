"""Dress-up layers for the PixelLab mannequin: eyes, skin tone, hair, tops, bottoms, shoes, glasses.
Everything is drawn per frame from the frame's own geometry, so one style works in every pose and direction."""
import numpy as np, colorsys
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seg import *

FACE = {'south': 0, 'south-east': 1, 'east': 1, 'north-east': 1, 'north': 0, 'north-west': -1, 'west': -1, 'south-west': -1}
FRONT = {'south', 'south-east', 'south-west'}
PROFILE = {'east', 'west'}
BACK = {'north', 'north-east', 'north-west'}

def rgb(h): return np.array(hx(h.lstrip('#')), float)
def lum(c): return .3 * c[0] + .59 * c[1] + .11 * c[2]
def ramp(base, n=5):
    """dark outline .. highlight ramp from one base colour (hue-shifted shadows)"""
    r, g, b = [v / 255 for v in rgb(base)]; h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = []
    for dl, dh, ds in ((-.40, -.04, .10), (-.20, -.025, .08), (-.09, -.012, .04), (0, 0, 0), (.12, .015, -.05)):
        rr, gg, bb = colorsys.hls_to_rgb((h + dh) % 1, min(.95, max(.04, l + dl)), min(1, max(0, s + ds)))
        out.append((int(rr * 255), int(gg * 255), int(bb * 255), 255))
    return out  # 0 outline, 1 deep shadow, 2 shadow, 3 base, 4 highlight

# ---------------------------------------------------------------- frame geometry
class Frame:
    def __init__(self, a, d):
        self.a = a; self.d = d; self.fx = FACE[d]
        self.c = cls(a); g = analyse(a); self.__dict__.update(g)
        H, W = a.shape[:2]; m = a[..., 3] > 0; self.m = m
        # skull ellipse from the dome (rows above the ears)
        dome = range(self.top, self.top + 10)
        self.rx = max((np.nonzero(m[y])[0][-1] - np.nonzero(m[y])[0][0] + 1) / 2 for y in dome)
        y7 = self.top + 9; xs = np.nonzero(m[y7])[0]; self.cx = (xs[0] + xs[-1]) / 2
        self.cy = self.top + self.rx * .95; self.ry = self.rx * .95
        # eyes: front views use every blob, profiles the blob on the facing side, backs none
        bl = self.eyes
        if d in BACK: eyes, ears = [], bl
        elif d in PROFILE:
            bl = sorted(bl, key=lambda b: np.mean([p[1] for p in b]))
            eyes, ears = ([bl[-1]], bl[:-1]) if self.fx > 0 else ([bl[0]], bl[1:])
        else: eyes, ears = bl, []
        self.eyeblobs, self.earblobs = eyes, ears
        self.eyebox = [(min(p[1] for p in b), min(p[0] for p in b), max(p[1] for p in b), max(p[0] for p in b)) for b in eyes]
        self.eyebox.sort()
        # head mask (rows above the neck)
        self.head = np.zeros((H, W), bool); self.head[self.top:self.neck] = m[self.top:self.neck]
        # ears: outside the skull ellipse (front/back) or around the ear blob (sides)
        yy, xx = np.mgrid[0:H, 0:W]
        ell = ((xx - self.cx) / (self.rx + .3)) ** 2 + ((yy - self.cy) / (self.ry + .6)) ** 2
        self.ell = ell
        self.ear = self.head & (ell > 1.0) & (yy > self.top + 9)
        for b in ears:
            for y, x in b:
                self.ear[max(0, y - 1):y + 3, max(0, x - 1):x + 3] |= self.head[max(0, y - 1):y + 3, max(0, x - 1):x + 3]
        # garments (only below the neck: the eye highlight shares a colour with the white cloth)
        self.c[:self.neck][self.c[:self.neck] == 3] = 2
        gm = self.c == 3; gy = np.nonzero(gm.any(1))[0]
        self.gtop, self.gbot = int(gy[0]), int(gy[-1])
        darkg = {hx(c) for c in '59526d 625c79 686481 7b7b92'.split()}
        cnt = [sum(key(a, y, x) in darkg for x in range(W) if gm[y, x]) for y in range(H)]
        lo, hi = self.gtop + 5, max(self.gtop + 6, self.gbot - 2)
        self.waist = max(range(lo, hi), key=lambda y: (cnt[y], -abs(y - (lo + hi) / 2)))
        self.skin = (self.c == 2)
        # skin components below the head: arms (start above the waist) vs legs
        self.arm = np.zeros((H, W), bool); self.leg = np.zeros((H, W), bool)
        body = self.skin.copy(); body[:self.neck] = False
        lab = -np.ones((H, W), int); n = 0
        for y in range(H):
            for x in range(W):
                if body[y, x] and lab[y, x] < 0:
                    q = [(y, x)]; lab[y, x] = n; pts = []
                    while q:
                        cy, cx = q.pop(); pts.append((cy, cx))
                        for dy, dx in N4:
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < H and 0 <= nx < W and body[ny, nx] and lab[ny, nx] < 0: lab[ny, nx] = n; q.append((ny, nx))
                    ys = [p[0] for p in pts]
                    tgt = self.arm if min(ys) < self.waist else self.leg
                    for p in pts: tgt[p] = True
                    n += 1

# ---------------------------------------------------------------- recolouring
SKIN_TONES = {'peach': '#ffcfa6', 'warm': '#eeaa6e', 'tan': '#c98352', 'brown': '#8d5634', 'porcelain': '#ffe0c8'}
def recolor_skin(img, fr, tone):
    base = rgb('eeaa6e'); t = rgb(SKIN_TONES[tone]); f = t / base
    out = img.copy()
    sk = fr.skin | ((img[..., 3] > 0) & (fr.c == 2))
    for y, x in zip(*np.nonzero(sk)):
        c = img[y, x, :3].astype(float); out[y, x, :3] = np.clip(c * (f ** (0.6 + 0.4 * lum(c) / 238)), 0, 255)
    return out

GARM_SORT = sorted(GARM, key=lum)
def paint_ramp(out, mask, src, rp):
    """map each source pixel's brightness onto a 4-step colour ramp (keeps the original shading)"""
    for y, x in zip(*np.nonzero(mask)):
        L = lum(src[y, x, :3])
        i = 4 if L > 225 else 3 if L > 185 else 2 if L > 140 else 1
        out[y, x] = rp[i]

def shade_from_skin(out, mask, src, rp):
    """skin pixels → cloth: brightness of the skin pixel picks the cloth tone"""
    for y, x in zip(*np.nonzero(mask)):
        L = lum(src[y, x, :3])
        i = 4 if L > 190 else 3 if L > 150 else 2 if L > 115 else 1
        out[y, x] = rp[i]

def edge_outline(out, mask, col):
    """pixels of `mask` touching transparency become `col` (keeps the sprite's outline closed)"""
    H, W = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if any(not (0 <= y + dy < H and 0 <= x + dx < W) or out[y + dy, x + dx, 3] == 0 for dy, dx in N4): out[y, x] = col

def top_layer(img, fr, style, colour):
    if style == 'none': return img
    rp = ramp(colour); out = img.copy(); src = fr.a
    g = (fr.c == 3); top = g.copy(); top[fr.waist + 1:] = False
    if style == 'dress': top = g.copy()
    paint_ramp(out, top, src, rp)
    if style == 'dress':
        H, W = top.shape; sk = np.zeros_like(top)
        for y in range(fr.gbot - 1, min(H, fr.gbot + 3)):
            xs = np.nonzero(g[min(y, fr.gbot)])[0] if g[min(y, fr.gbot)].any() else np.nonzero(g[fr.gbot])[0]
            if not len(xs): continue
            x0, x1 = xs[0] - 1 - (y > fr.gbot), xs[-1] + 1 + (y > fr.gbot)
            for x in range(max(0, x0), min(W, x1 + 1)):
                if fr.leg[y, x] or g[y, x] or (out[y, x, 3] and y <= fr.gbot + 1): sk[y, x] = True
        sk &= ~fr.arm
        shade_from_skin(out, sk & ~g, src, rp); edge_outline(out, sk, (24, 7, 4, 255))
        # hem line
        for x in range(W):
            ys = np.nonzero(sk[:, x] | g[:, x])[0]
            if len(ys) and ys[-1] >= fr.gbot: out[ys[-1], x] = (24, 7, 4, 255) if out[ys[-1], x, 3] else out[ys[-1], x]
    if style in ('tee', 'hoodie', 'dress'):
        sl = fr.arm.copy(); sl[fr.gtop + (6 if style != 'hoodie' else 99):] = False; sl[:fr.neck + 1] = False
        if style == 'hoodie':  # long sleeves: whole arm except the last 2 rows (hands)
            sl = fr.arm.copy(); sl[:fr.neck + 1] = False
            for x in range(sl.shape[1]):
                ys = np.nonzero(fr.arm[:, x])[0]
            H, W = sl.shape
            # hands = lowest 3 rows of each arm column cluster
            lab_y = np.nonzero(fr.arm.any(1))[0]
            hand_rows = 3
            low = np.zeros_like(sl)
            for x in range(W):
                ys = np.nonzero(fr.arm[:, x])[0]
                if len(ys): low[max(ys[-1] - hand_rows + 1, 0):ys[-1] + 1, x] = fr.arm[max(ys[-1] - hand_rows + 1, 0):ys[-1] + 1, x]
            sl &= ~low
        # chest skin in the tank's neckline
        neckline = fr.skin.copy(); neckline[:fr.neck + 1] = False; neckline[fr.gtop + 4:] = False; neckline &= ~fr.arm & ~fr.leg
        shade_from_skin(out, sl | neckline, src, rp); edge_outline(out, sl, (24, 7, 4, 255))
    return out

def bottom_layer(img, fr, style, colour):
    rp = ramp(colour); out = img.copy(); src = fr.a
    g = (fr.c == 3); bot = g.copy(); bot[:fr.waist + 1] = False
    paint_ramp(out, bot, src, rp)
    if style == 'pants':
        feet = feet_mask(fr)
        legs = fr.leg & ~feet
        shade_from_skin(out, legs, src, rp); edge_outline(out, legs, (24, 7, 4, 255))
    return out

def feet_mask(fr, rows=2):
    if getattr(fr, 'pose', 'idle') == 'sit' and fr.fx:
        H, W = fr.leg.shape; yy, xx = np.mgrid[0:H, 0:W]
        proj = xx * fr.fx * .9 + yy * .45
        ys, xs = np.nonzero(fr.leg); f = np.zeros_like(fr.leg)
        if len(ys):
            mx = proj[ys, xs].max(); f = fr.leg & (proj >= mx - (rows + .6))
        return f
    H, W = fr.leg.shape; f = np.zeros_like(fr.leg)
    for x in range(W):
        ys = np.nonzero(fr.leg[:, x])[0]
        if len(ys): f[max(ys[-1] - rows + 1, 0):ys[-1] + 1, x] = fr.leg[max(ys[-1] - rows + 1, 0):ys[-1] + 1, x]
    return f

def shoes_layer(img, fr, style, colour):
    if style == 'none': return img
    rp = ramp(colour); out = img.copy(); f = feet_mask(fr, 3 if style == 'boots' else 2)
    shade_from_skin(out, f, fr.a, rp); edge_outline(out, f, (24, 7, 4, 255))
    if style == 'sneakers':  # white soles
        H, W = f.shape
        for x in range(W):
            ys = np.nonzero(f[:, x])[0]
            if len(ys) and out[ys[-1], x, 3] and tuple(out[ys[-1], x, :3]) != (24, 7, 4): out[ys[-1], x] = (238, 240, 236, 255)
    return out

# ---------------------------------------------------------------- eyes
K = (41, 4, 0, 255); W_ = (242, 247, 248, 255); G_ = (188, 190, 205, 255)
IRIS = {'brown': ('#7a2e1e', '#b85a3c'), 'blue': ('#2854a0', '#629cde'), 'green': ('#227046', '#60b46e'),
        'violet': ('#60348c', '#a06ece'), 'black': ('#20141c', '#4a3440'), 'pink': ('#9c2c5a', '#e070a0')}
EYES = {  # picture-left eye, picture-right eye (4 wide, bottom-aligned on the PixelLab eye)
 'classic': (["KKK.", "KWKK", "KKKK", "GAKA", "WABA"], [".KKK", "WKKK", "KKKK", "AKAG", "ABAW"]),
 'sparkle': ([".KKK", "KWWK", "KWKK", "KAKW", "GBAB"], ["KKK.", "KWWK", "KWKK", "WKAK", "BABG"]),
 'bean':    ([".KK.", ".KW.", ".KK.", ".KK."], [".KK.", ".KW.", ".KK.", ".KK."]),
 'happy':   ([".KK.", "K..K", "...."], [".KK.", "K..K", "...."]),
 'sleepy':  (["KKKK", "KAKA", "GBAB"], ["KKKK", "AKAK", "BABG"]),
 'sharp':   (["K...", ".KKK", "KKWK", "KAKA", ".BAB"], ["...K", "KKK.", "KWKK", "AKAK", "BAB."]),
}
def erase_eyes(img, fr):
    out = img.copy(); todo = {p for b in fr.eyeblobs for p in b}
    while todo:
        nxt = set()
        for y, x in todo:
            nb = [tuple(out[y + dy, x + dx]) for dy, dx in N4 if (y + dy, x + dx) not in todo and out[y + dy, x + dx, 3] and fr.c[y + dy, x + dx] == 2]
            if nb: out[y, x] = max(set(nb), key=nb.count)
            else: nxt.add((y, x))
        if nxt == todo: break
        todo = nxt
    return out
def draw_eyes(img, fr, style, iris):
    out = erase_eyes(img, fr); A, B = (tuple(rgb(c).astype(int)) + (255,) for c in IRIS[iris])
    m = {'K': K, 'W': W_, 'G': G_, 'A': A, 'B': B}
    L, R = EYES[style]
    boxes = fr.eyebox
    def put(rows, x0, y1):
        y0 = y1 - len(rows) + 1
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in m: out[y0 + dy, x0 + dx] = m[ch]
    narrowL = [r[1:] for r in L]; narrowR = [r[:-1] for r in R]
    if fr.d == 'south' and len(boxes) == 2:
        (a0, _, a1, ay), (b0, _, b1, by) = boxes
        put(L, a1 - 3, ay); put(R, b0, by)
    elif fr.d == 'south-east' and len(boxes) == 2:
        (a0, _, a1, ay), (b0, _, b1, by) = boxes      # near eye = picture-left, far = right
        put(L, a1 - 3, ay); put(narrowR, b0, by)
    elif fr.d == 'south-west' and len(boxes) == 2:
        (a0, _, a1, ay), (b0, _, b1, by) = boxes      # far = picture-left, near = right
        put(narrowL, a1 - 2, ay); put(R, b0, by)
    elif fr.d in PROFILE and boxes:
        x0, _, x1, y1 = boxes[0]
        if fr.fx > 0: put(narrowR, x0, y1)
        else: put(narrowL, x1 - 2, y1)
    return out

# ---------------------------------------------------------------- hair
def hair_masks(fr, style):
    """returns (front, back) boolean masks; back is drawn behind the body"""
    H, W = fr.m.shape; yy, xx = np.mgrid[0:H, 0:W]; d = fr.d; fx = fr.fx
    head = fr.head & ~fr.ear
    # cap of the skull: slightly bigger than the head silhouette at the top (volume)
    vol = 1.0 if style != 'spiky' else 1.0
    skull = (((xx - fr.cx) / (fr.rx + 1.2)) ** 2 + ((yy - fr.cy + .6) / (fr.ry + 1.6)) ** 2) <= vol
    eye_top = min([b[1] for b in fr.eyebox], default=fr.top + 12)
    if fr.eyebox: eye_top = min(eye_top, max(b[3] for b in fr.eyebox) - 4)
    bang = eye_top - 1                                   # bangs stop just above the eyes
    front = np.zeros((H, W), bool); back = np.zeros((H, W), bool)
    cap = skull & (yy < fr.neck)
    if d in FRONT:
        xs = [b[0] for b in fr.eyebox] + [b[2] for b in fr.eyebox]
        f0, f1 = (min(xs) - 2, max(xs) + 2) if xs else (fr.cx - 6, fr.cx + 6)
        # jagged bang line
        jag = np.array([0, 1, 1, 0, -1, 0, 1, 0])
        bl = np.array([bang - (jag[(x * 3) % 8] > 0) for x in range(W)])
        face = (yy >= bl[None, :].repeat(H, 0)) & (xx >= f0) & (xx <= f1)
        side_low = fr.top + int(fr.ry * 1.25)   # sideburns down to here
        front = cap & ~face & ((yy < side_low) | ~((xx >= f0) & (xx <= f1)))
        front &= (yy < side_low + (0 if style in ('short', 'spiky', 'buns', 'pony') else 99))
    elif d in PROFILE:
        ex = fr.eyebox[0][0] if fr.eyebox else fr.cx + 4 * fx
        earx = np.mean([p[1] for b in fr.earblobs for p in b]) if fr.earblobs else fr.cx - 2 * fx
        fb = earx + 3 * fx                               # face starts in front of the ear
        face = (yy >= bang) & ((xx - fb) * fx > 0)
        front = cap & ~face
        front &= ~((yy >= bang + 1) & (np.abs(xx - earx) <= 2) & (yy <= bang + 6)) if style in ('short', 'spiky', 'pony', 'buns') else front
        front &= yy < fr.neck - 1
    else:  # backs
        front = cap & (yy < fr.neck - 2)
    if style == 'spiky':
        top_edge = cap & ~np.roll(cap, 1, 0)
        for y, x in zip(*np.nonzero(top_edge)):
            if x % 3 == 0 and y > 0: front[y - 1, x] = True
            if x % 3 == 0 and y > 1 and abs(x - fr.cx) < fr.rx - 3: front[y - 2, x] = True
    # longer styles
    wid = fr.rx + 1.5
    if style in ('bob', 'long'):
        endy = fr.neck + 1 if style == 'bob' else fr.neck + 13
        sides = (np.abs(xx - fr.cx) <= wid) & (yy >= fr.cy) & (yy <= endy)
        if d in FRONT:
            xs = [b[0] for b in fr.eyebox] + [b[2] for b in fr.eyebox]
            f0, f1 = (min(xs) - 1, max(xs) + 1) if xs else (fr.cx - 6, fr.cx + 6)
            lock = sides & ((xx < f0) | (xx > f1)) & (yy <= (fr.neck + 1 if style == 'bob' else fr.neck + 6))
            # side locks hug the face: limit width
            lock &= (np.abs(xx - fr.cx) >= (f1 - f0) / 2 - 1)
            front |= lock & (np.abs(xx - fr.cx) <= wid - (0 if style == 'bob' else 1))
            back |= sides & (np.abs(xx - fr.cx) <= wid - 1)
        elif d in PROFILE:
            ex = fr.eyebox[0][0] if fr.eyebox else fr.cx + 4 * fx
            behind = sides & ((xx - (fr.cx + 2 * fx)) * fx <= 0)
            front |= behind & (yy <= (fr.neck + 1 if style == 'bob' else fr.neck + 2))
            back |= behind
            if style == 'long': front |= behind & ((xx - (fr.cx - 1 * fx)) * fx <= 0)
        else:
            front |= sides & (np.abs(xx - fr.cx) <= wid - (1 if d == 'north' else 1))
        if style == 'long':  # rounded, uneven ends
            for x in range(W):
                cut = endy - (1 if (x % 4 == 1) else 0) - int(max(0, abs(x - fr.cx) - wid + 3))
                front[cut + 1:, x] = False; back[cut + 1:, x] = False
    fr._buns = []
    if style == 'buns':
        offs = {'south': (-1, 1), 'north': (-1, 1), 'east': (-.25, -.25), 'west': (.25, .25)}
        o = offs.get(d, (-.8 * fx, .45 * fx) if d in ('south-east', 'south-west') else (-.45 * fx, .8 * fx))
        for k, ox in enumerate(o):
            bx, by = fr.cx + ox * (fr.rx + .2), fr.top + 3.6
            ball = ((xx - bx) ** 2 + (yy - by) ** 2) <= 3.6 ** 2
            fr._buns.append((ball, d in PROFILE and k == 1))
    if style == 'pony':
        if d in BACK or d in PROFILE:
            bx = fr.cx - (fr.rx - 1.5) * fx if d in PROFILE else fr.cx - (2 * fx)
            tail = np.zeros((H, W), bool)
            y0, y1 = int(fr.cy) - 2, fr.neck + 8
            for y in range(y0, y1 + 1):
                t = (y - y0) / (y1 - y0)
                w = 2.3 - .8 * t
                sx = bx - fx * (.5 + 2.2 * np.sin(t * np.pi * .85)) if d in PROFILE else bx - fx * 1.2 * np.sin(t * np.pi)
                tail |= (yy == y) & (np.abs(xx - sx) <= w)
            if d == 'north': front |= tail
            else: front |= tail
            # tie
            fr._tie = (int(round(bx)), int(fr.cy) - 1)
        else:
            # from the front a little of the tail shows behind the neck on one side
            tail = (np.abs(xx - (fr.cx + fr.rx - .5)) <= 2) & (yy >= fr.cy + 1) & (yy <= fr.neck + 6)
            back |= tail
    return front, back

def render_hair(mask, fr, colour, kind):
    """shade a hair mask: outline, shadow away from the top-left light, highlight arc, strand lines"""
    H, W = mask.shape; rp = ramp(colour); out = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]
    nx_ = (xx - fr.cx) / (fr.rx + 1); ny_ = (yy - fr.cy) / (fr.ry + 1)
    r = np.sqrt(nx_ ** 2 + ny_ ** 2)
    for y, x in zip(*np.nonzero(mask)):
        t = nx_[y, x] * .55 + min(ny_[y, x], .55) * .85 + (.25 if y > fr.neck + 2 and nx_[y, x] > .4 else 0)
        i = 3 if t < .35 else 2 if t < .85 else 1
        if kind == 'front' and y < fr.cy and abs(r[y, x] - .62) < .11 and nx_[y, x] < .5 and (x + y) % 5 != 0: i = 4
        if kind == 'back': i = min(i, 2)
        out[y, x] = rp[i]
    # strands: darker vertical streaks in the lower part
    for y, x in zip(*np.nonzero(mask)):
        if y > fr.cy and (x % 4 == 0) and out[y, x, 3] and kind == 'front':
            out[y, x] = rp[max(1, [tuple(c) for c in rp].index(tuple(out[y, x])) - 1)] if tuple(out[y, x]) in [tuple(c) for c in rp] else out[y, x]
    # outline
    for y, x in zip(*np.nonzero(mask)):
        if any(not (0 <= y + dy < H and 0 <= x + dx < W) or not mask[y + dy, x + dx] for dy, dx in N4):
            out[y, x] = rp[0]
    return out

def over(dst, src):
    a = src[..., 3:4] > 0
    return np.where(a, src, dst)

def glasses(img, fr, colour='#3a2a30'):
    out = img.copy(); c = tuple(rgb(colour).astype(int)) + (255,)
    if not fr.eyebox: return out
    def ring(x0, y0, x1, y1):
        for x in range(x0, x1 + 1):
            for y in (y0, y1):
                if out[y, x, 3]: out[y, x] = c
        for y in range(y0, y1 + 1):
            for x in (x0, x1):
                if out[y, x, 3]: out[y, x] = c
    boxes = fr.eyebox
    yb = max(b[3] for b in boxes); y0 = yb - 5; y1 = yb + 1
    if fr.d == 'south' and len(boxes) == 2:
        ring(boxes[0][2] - 4, y0, boxes[0][2] + 1, y1); ring(boxes[1][0] - 1, y0, boxes[1][0] + 4, y1)
        for x in range(boxes[0][2] + 2, boxes[1][0] - 1): out[y0 + 2, x] = c
    elif fr.d in ('south-east', 'south-west') and len(boxes) == 2:
        if fr.fx > 0: ring(boxes[0][2] - 4, y0, boxes[0][2] + 1, y1); ring(boxes[1][0] - 1, y0, boxes[1][0] + 3, y1); br = range(boxes[0][2] + 2, boxes[1][0] - 1)
        else: ring(boxes[0][2] - 3, y0, boxes[0][2] + 1, y1); ring(boxes[1][0] - 1, y0, boxes[1][0] + 4, y1); br = range(boxes[0][2] + 2, boxes[1][0] - 1)
        for x in br: out[y0 + 2, x] = c
    elif fr.d in PROFILE:
        x0, _, x1, _ = boxes[0]
        if fr.fx > 0: ring(x0 - 1, y0, x0 + 3, y1); arm = range(int(fr.cx) - 2, x0 - 1)
        else: ring(x1 - 3, y0, x1 + 1, y1); arm = range(x1 + 2, int(fr.cx) + 3)
        for x in arm:
            if out[y0 + 2, x, 3]: out[y0 + 2, x] = c
    return out

# ---------------------------------------------------------------- one frame
def dress(a, d, look, pose='idle'):
    fr = Frame(a, d); fr.pose = pose
    img = recolor_skin(a, fr, look.get('skin', 'warm'))
    fr2 = fr  # geometry unchanged
    img = draw_eyes(img, fr, look.get('eyes', 'classic'), look.get('iris', 'brown')) if d not in BACK else img
    img = top_layer(img, fr, look.get('top', 'tank'), look.get('topc', '#ffffff'))
    if look.get('top') != 'dress': img = bottom_layer(img, fr, look.get('bottom', 'shorts'), look.get('botc', '#ffffff'))
    img = shoes_layer(img, fr, look.get('shoes', 'none'), look.get('shoec', '#ffffff'))
    hf, hb = hair_masks(fr, look.get('hair', 'short'))
    canvas = np.zeros_like(img)
    hc = look.get('hairc', '#5a3a2a')
    for ball, behind in getattr(fr, '_buns', []):
        if behind: canvas = over(canvas, render_hair(ball, fr, hc, 'back'))
    canvas = over(canvas, render_hair(hb, fr, hc, 'back'))
    canvas = over(canvas, img)
    canvas = over(canvas, render_hair(hf, fr, hc, 'front'))
    for ball, behind in getattr(fr, '_buns', []):
        if not behind: canvas = over(canvas, render_hair(ball, fr, hc, 'front'))
    if look.get('glasses'): canvas = glasses(canvas, fr, look['glasses'])
    return canvas
