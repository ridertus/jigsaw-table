"""Tiny signed-distance renderer for chibi heads + hair, drawn straight into 48px pixel art.

The head and every hair style are 3D shapes, so one style gives matching sprites in all 8 directions.
Proportions follow the old PixelLab characters (assets/chars/chars.png): big head, chin near row 28.
Output per direction: front layer (head + hair in front of the body), back layer (hair behind the body)."""
import numpy as np, colorsys

N = 48
CX, CY = 23.5, 15.6           # head centre on the sprite
A, B, C = 10.2, 10.6, 9.6     # skull radii (x, y, z)
PITCH = np.radians(15)        # low top-down camera
YAW = {'south': 0, 'south-east': 32, 'east': 70, 'north-east': 140, 'north': 180, 'north-west': -140, 'west': -70, 'south-west': -32}
LIGHT = np.array([-.55, -.75, .55]); LIGHT /= np.linalg.norm(LIGHT)

def hexrgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)
def skin_ramp(base):
    b = hexrgb(base); sh = np.array([214., 128., 128.])
    mix = lambda t, k=1.0: tuple(int(v) for v in np.clip(b * (1 - t) + sh * t * k + 0, 0, 255)) + (255,)
    return [(70, 28, 34, 255), mix(.55), mix(.3), tuple(int(v) for v in b) + (255,), mix(-.08), mix(-.15)]

def ramp(base, outline_dark=.16):
    r, g, b = hexrgb(base) / 255; h, l, s = colorsys.rgb_to_hls(r, g, b)
    def c(dl, dh, ds, lmin=.05):
        rr, gg, bb = colorsys.hls_to_rgb((h + dh) % 1, min(.96, max(lmin, l + dl)), min(1, max(0, s + ds)))
        return (int(rr * 255), int(gg * 255), int(bb * 255), 255)
    # 0 outline, 1 deep, 2 shadow, 3 base, 4 light, 5 highlight
    return [c(-l + outline_dark, -.05, .15, 0), c(-.22, -.035, .08), c(-.11, -.018, .05), c(0, 0, 0), c(.09, .012, -.03), c(.2, .02, -.12)]

# ---------------------------------------------------------------- SDF helpers (p: (...,3) arrays)
def ell(p, r):
    k0 = np.linalg.norm(p / r, axis=-1); k1 = np.linalg.norm(p / (r * r), axis=-1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-6)
def sph(p, c, r): return np.linalg.norm(p - c, axis=-1) - r
def capsule(p, a, b, r):
    a = np.asarray(a, float); b = np.asarray(b, float); pa = p - a; ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)[..., None]
    return np.linalg.norm(pa - ba * h, axis=-1) - (r[0] + (r[1] - r[0]) * h[..., 0] if isinstance(r, tuple) else r)
def chain(p, pts, r0, r1):
    d = np.full(p.shape[:-1], 1e9)
    n = len(pts) - 1
    for i in range(n):
        ra, rb = r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n
        d = np.minimum(d, capsule(p, pts[i], pts[i + 1], (ra, rb)))
    return d
def tri(x, period, phase=0.):
    f = (x / period + phase) % 1.0
    return 1 - np.abs(2 * f - 1)          # 0..1..0 triangle wave
def smin(a, b, k=1.2):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h)

# ---------------------------------------------------------------- the head
def skin_sdf(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    d = ell(p - [0, 0, 0], np.array([A, B, C]))
    # cheeks / jaw: a softer chin
    d = smin(d, ell(p - [0, 4.0, 1.4], np.array([A * .93, B * .6, C * .82])), 1.6)
    for s in (-1, 1):
        d = np.minimum(d, ell(p - [s * (A - .4), 1.6, -.6], np.array([1.7, 2.5, 1.5])))
    d = np.minimum(d, capsule(p, [0, B * .55, -1.2], [0, B + 3.5, -1.5], 3.1))   # neck
    return d

def surface_z(x, y):
    v = 1 - (x / A) ** 2 - (y / B) ** 2
    return C * np.sqrt(max(v, 0))

# ---------------------------------------------------------------- hair styles
def W_union(*ws): return np.min(np.stack(ws), axis=0)

def cap_sdf(p, st):
    """the main mass of hair hugging the skull, minus the face window"""
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    vol = st.get('vol', 1.5)
    d = ell(p - [0, -.7, -.4], np.array([A + vol, B + vol + .3, C + vol + .2]))
    if st.get('messy'):
        u = np.arctan2(x, z)
        bump = np.maximum(0, np.sin(u * st['messy'] + y * .35)) ** 3 * (y < 1)
        d = d - 1.1 * bump
    # bangs: pointed clumps hanging over the forehead
    per, amp, base = st.get('bang_per', 3.0), st.get('bang_amp', 2.4), st.get('bang_y', -2.6)
    bang = base + amp * tri(x + st.get('bang_shift', 0), per, .5) + st.get('bang_tilt', 0) * x
    fw = st.get('face_w', 8.3)
    W_face = np.maximum.reduce([bang - y, .2 - z, np.minimum(np.abs(x) - fw, np.abs(x) - np.tan(np.radians(st.get('face_ang', 60))) * z - 1.0)])
    side = st.get('side_y', 1.0) + 1.6 * tri(z, 2.4) * (z > 0)     # jagged sideburns
    W_side = np.maximum(side - y, -3.0 - z)
    back = st.get('back_y', 6.0) + 1.4 * tri(x, 2.2)
    W_back = back - y
    return np.maximum(d, -W_union(W_face, W_side, W_back))

def curtain_sdf(p, st):
    """long hair falling from the head: an elliptic tube below the head, open at the face"""
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    L = st['long'] + 1.6 * tri(x, 2.6) + st.get('wave', 0) * np.sin(z * .7)
    wx = A + 1.9 + st.get('flare', 0) * np.clip(y / max(st['long'], 1), 0, 1)
    wz = C + 1.0
    xx = x + st.get('wave', 0) * .8 * np.sin(y * .55)
    e = np.sqrt((xx / wx) ** 2 + ((z + 1.2) / wz) ** 2) - 1
    d = np.maximum(e * np.minimum(wx, wz), np.maximum(-.5 - y, y - L))
    # open the front half; only the side locks may come forward
    lock, lw = st.get('lock', L), st.get('lock_w', 6.6)
    lock_sdf = np.maximum.reduce([lw - np.abs(x), y - lock, z - st.get('lock_z', 3.5)])
    W = np.maximum(-1.0 - z, -lock_sdf)
    return np.maximum(d, -W)

def hair_sdf(p, st):
    d = cap_sdf(p, st)
    if st.get('long'): d = smin(d, curtain_sdf(p, st), .8)
    for kind, args in st.get('parts', []):
        if kind == 'sph': d = np.minimum(d, sph(p, np.array(args[0], float), args[1]))
        elif kind == 'chain': d = smin(d, chain(p, [np.array(q, float) for q in args[0]], args[1], args[2]), .5)
    return d

def mirror_x(pts): return [[-q[0], q[1], q[2]] for q in pts]
def tail(anchor, out, down, n=7, wave=0.):
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append([anchor[0] + out * np.sin(t * np.pi * .55) + wave * np.sin(t * np.pi * 2), anchor[1] + down * t, anchor[2] - 1.2 * np.sin(t * np.pi)])
    return pts
def braid(anchor, down, n=6):
    return [[anchor[0] + .4 * (-1) ** i, anchor[1] + down * i / n, anchor[2] + 1.0 * i / n] for i in range(n + 1)]

STYLES = {
 'fluffy':    dict(messy=7, bang_per=2.6, bang_amp=3.0, bang_y=-3.0, side_y=.6, back_y=5.5, vol=1.9),
 'hime':      dict(bang_per=2.2, bang_amp=.9, bang_y=-1.6, side_y=4, back_y=6, long=21, lock=13, lock_w=6.4, vol=1.4),
 'bob':       dict(bang_per=2.4, bang_amp=1.6, bang_y=-2.2, side_y=4, back_y=6, long=8.5, lock=8.5, lock_w=6.6, flare=1.4, vol=1.5),
 'buns':      dict(bang_per=2.6, bang_amp=2.6, bang_y=-2.8, side_y=2, back_y=5, long=7, lock=7, lock_w=7.2, vol=1.4,
                   parts=[('sph', ([-A * .86, -B * .98, -1.2], 4.3)), ('sph', ([A * .86, -B * .98, -1.2], 4.3))]),
 'twintails': dict(bang_per=2.6, bang_amp=2.4, bang_y=-2.6, side_y=3, back_y=5, long=4, lock=4, lock_w=7.2, vol=1.4,
                   parts=[('chain', (tail([-A + .6, -4.5, -2.5], -3.6, 19, wave=.7), 3.4, 1.6)),
                          ('chain', (tail([A - .6, -4.5, -2.5], 3.6, 19, wave=-.7), 3.4, 1.6))]),
 'pony':      dict(bang_per=3.0, bang_amp=2.8, bang_y=-2.9, bang_tilt=.18, side_y=2, back_y=4, vol=1.4,
                   parts=[('chain', ([[0, -6.5, -C - .5], [0, -5, -C - 3.2], [-.5, 0, -C - 4.0], [-1.0, 6, -C - 3.4], [-.6, 13, -C - 2.6]], 2.6, 1.3))]),
 'braids':    dict(bang_per=2.4, bang_amp=1.5, bang_y=-2.2, side_y=3, back_y=6, vol=1.4,
                   parts=[('chain', (braid([-A + .6, 3, 0], 16), 1.9, 1.3)), ('chain', (braid([A - .6, 3, 0], 16), 1.9, 1.3))]),
 'wavy':      dict(bang_per=3.2, bang_amp=2.6, bang_y=-2.8, bang_shift=1.0, side_y=3, back_y=6, long=19, lock=15, lock_w=6.6, wave=1.2, flare=2.0, vol=1.7),
 'spiky':     dict(messy=9, bang_per=2.4, bang_amp=3.4, bang_y=-3.4, side_y=.6, back_y=4.5, vol=2.1),
}

# ---------------------------------------------------------------- rendering
def render(d, style, hair_hex, skin_hex, iris_hex='#7a3a2a', eyes='anime'):
    yaw = np.radians(YAW[d]); cy_, sy_ = np.cos(yaw), np.sin(yaw); cp, sp = np.cos(PITCH), np.sin(PITCH)
    st = STYLES[style]
    js, is_ = np.mgrid[0:N, 0:N]
    sx = is_ + .5 - CX; sy = js + .5 - CY
    right = np.array([1, 0, 0.]); down = np.array([0, cp, sp]); toward = np.array([0, -sp, cp])
    def world(t): return sx[..., None] * right + sy[..., None] * down + t[..., None] * toward
    def local(P):
        x, y, z = P[..., 0], P[..., 1], P[..., 2]
        return np.stack([x * cy_ - z * sy_, y, x * sy_ + z * cy_], -1)
    def scene(P):
        q = local(P); return skin_sdf(q), hair_sdf(q, st)
    t = np.full((N, N), 30.); hit = np.zeros((N, N), int); depth = np.full((N, N), -99.)
    alive = np.ones((N, N), bool)
    for _ in range(300):
        P = world(t); ds, dh = scene(P); dmin = np.minimum(ds, dh)
        new = alive & (dmin < .02)
        hit[new] = np.where(dh[new] < ds[new], 2, 1); depth[new] = t[new]; alive &= ~new
        t = np.where(alive, t - np.maximum(dmin, .05) * .8, t)
        alive &= t > -30
        if not alive.any(): break
    P = world(depth); q = local(P)
    # normals (world)
    def grad(fn):
        e = .05; g = []
        for k in range(3):
            o = np.zeros(3); o[k] = e
            g.append(fn(local(P + o)) - fn(local(P - o)))
        n = np.stack(g, -1); return n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    ns = grad(skin_sdf); nh = grad(lambda Q: hair_sdf(Q, st))
    rs, rh = skin_ramp(skin_hex), ramp(hair_hex, .12)
    front = np.zeros((N, N, 4), np.uint8); back = np.zeros((N, N, 4), np.uint8)
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    u = np.arctan2(x, z)
    chin_row = int(CY + (B + 1) * cp + 2)
    behind = (hit == 2) & (depth < -2.0) & (js > CY + 2)
    tone = np.zeros((N, N), int)
    for j in range(N):
        for i in range(N):
            if hit[j, i] == 1:
                v = ns[j, i] @ LIGHT
                tone[j, i] = 3 if v > .25 else 2 if v > -.15 else 1
            elif hit[j, i] == 2:
                v = nh[j, i] @ LIGHT
                k = 4 if v > .62 else 3 if v > .22 else 2 if v > -.18 else 1
                # clump grooves along the strands
                g = np.cos((u[j, i] + .015 * y[j, i]) * st.get('clumps', 11))
                if g > .9 and k > 1 and y[j, i] > -B * .2: k -= 1
                if y[j, i] > -B * .1 and g > .55 and k > 1 and z[j, i] > 0: k -= 1   # deeper gaps between bang clumps
                # angel ring highlight
                ring = -B * .42; cc = np.cos(u[j, i] * st.get('clumps', 11))
                if abs(y[j, i] - ring) < 1.7 and v > .2 and cc < -.35 and z[j, i] > -C * .5: k = 5      # shiny strand strokes
                elif abs(y[j, i] - ring) < 2.6 and v > .1 and cc < -.05 and k < 4 and z[j, i] > -C * .5: k = 4
                tone[j, i] = k
    # bang shadow on the forehead
    for j in range(1, N):
        for i in range(N):
            if hit[j, i] == 1 and hit[j - 1, i] == 2 and tone[j, i] > 1: tone[j, i] -= 1
    for j in range(N):
        for i in range(N):
            if hit[j, i] == 0: continue
            rp = rs if hit[j, i] == 1 else rh
            col = rp[tone[j, i]]
            (back if behind[j, i] else front)[j, i] = col
    # outlines: silhouette, hair over skin, and depth steps between hair pieces
    def outline(layer, mask, rp_of):
        out = layer.copy()
        for j in range(N):
            for i in range(N):
                if not mask[j, i]: continue
                edge = False
                for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    jj, ii = j + dj, i + di
                    if not (0 <= jj < N and 0 <= ii < N) or not mask[jj, ii]: edge = True; break
                    if hit[j, i] == 2 and hit[jj, ii] == 1: edge = True; break
                    if hit[j, i] == 2 and hit[jj, ii] == 2 and (depth[j, i] - depth[jj, ii] > 1.6 or (nh[j, i] @ nh[jj, ii] < .45 and depth[j, i] > depth[jj, ii])): edge = True; break
                if edge: out[j, i] = rp_of(j, i)[0]
        return out
    fm = (hit > 0) & ~behind; bm = behind
    front = outline(front, fm, lambda j, i: rs if hit[j, i] == 1 else rh)
    back = outline(back, bm, lambda j, i: rh)
    face = face_info(d, yaw, cp, sp)
    return front, back, face, hit, depth

def face_info(d, yaw, cp, sp):
    """projected positions of eyes / mouth / blush, with how much each faces the camera"""
    cy_, sy_ = np.cos(yaw), np.sin(yaw)
    def proj(xl, yl):
        zl = surface_z(xl, yl)
        # local -> world
        xw = xl * cy_ + zl * sy_; zw = -xl * sy_ + zl * cy_
        sxp = xw + CX; syp = yl * cp + zw * sp + CY
        n = np.array([xl / A ** 2, yl / B ** 2, zl / C ** 2]); n /= np.linalg.norm(n)
        nw = np.array([n[0] * cy_ + n[2] * sy_, n[1], -n[0] * sy_ + n[2] * cy_])
        face = nw @ np.array([0, -sp, cp])
        return sxp, syp, face
    return {
        'eyeL': proj(-3.9, 1.9), 'eyeR': proj(3.9, 1.9),
        'mouth': proj(0, 6.0), 'blushL': proj(-5.6, 4.6), 'blushR': proj(5.6, 4.6),
    }

# ---------------------------------------------------------------- face decals
EYES = {  # picture-left eye (5x5); the right eye is mirrored except the highlight stays on the left
 'anime':   [".KKKK", "KDDDK", ".WMDS", ".LLMS", "..pp."],
 'round':   [".KKK.", "KDDDK", "KWWDK", ".LMW.", "..LL."],
 'sharp':   ["K....", ".KKKK", ".DDDK", ".WMDS", "..LM."],
 'droopy':  ["..KKK", ".KDDK", "KWMDS", "K.LMS", "....."],
 'sleepy':  [".....", "KKKKK", ".DMD.", ".LLM.", "..pp."],
 'happy':   [".....", ".KKK.", "K...K", ".....", "....."],
 'cat':     [".KKKK", "KMDMK", ".WDMS", ".LDLS", "..pp."],
}
def eye_rows(style, side):
    rows = list(EYES[style])
    if style not in ('happy', 'sleepy'): rows = rows[:3] + [rows[3].replace('S', 'S'), rows[3].replace('M', 'L').replace('W', 'L')] + rows[4:]
    if side == 'L': return rows
    out = []
    for r in rows:
        m = r[::-1]
        # keep the highlight on the light side (left): swap W with the iris tone left of it
        if 'W' in m:
            i = m.index('W'); j = max(0, i - 1)
            if i < 4 and m[i - 1] in 'DM' if i > 0 else False: pass
        out.append(m)
    # move highlight to the left-most iris cell of its row
    fixed = []
    for r in out:
        if 'W' in r:
            cells = [k for k, ch in enumerate(r) if ch in 'DMLW']
            r = list(r); w = r.index('W'); first = cells[0]; r[w], r[first] = r[first], 'W'; r = ''.join(r)
        fixed.append(r)
    return fixed

def draw_face(img, face, eyes='anime', iris_hex='#7a3a2a', skin_hex='#ffcfa6'):
    out = img.copy(); ir = ramp(iris_hex); sk = skin_ramp(skin_hex)
    pal = {'K': (46, 16, 26, 255), 'D': ir[2], 'M': ir[4], 'L': ir[5], 'W': (252, 252, 250, 255), 'S': (236, 236, 242, 255),
           'p': tuple(int(v) for v in (np.array(sk[1][:3]) * .8)) + (255,)}
    def put(rows, cx, cy):
        x0, y0 = int(round(cx - 2.5)), int(round(cy - 2.0))
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in pal and 0 <= y0 + dy < N and 0 <= x0 + dx < N and out[y0 + dy, x0 + dx, 3]: out[y0 + dy, x0 + dx] = pal[ch]
    for side in ('L', 'R'):
        sx, sy, f = face['eye' + side]
        if f < .1: continue
        rows = eye_rows(eyes, side)
        if f < .55:   # foreshortened: drop the inner corner and one iris column
            rows = [r[0] + r[1] + r[3] + r[4] if side == 'L' else r[0] + r[1] + r[3] + r[4] for r in rows]
            rows = [r[:4] for r in rows]
            sx += (.5 if side == 'L' else -.5)
        put(rows, sx, sy)
    bl = sk[1][:3]
    for side in ('L', 'R'):
        sx, sy, f = face['blush' + side]
        if f > .35:
            for dx in (0, 1):
                x, y = int(round(sx - .5)) + dx, int(round(sy))
                if 0 <= x < N and out[y, x, 3]: out[y, x] = tuple(int(v) for v in (np.array(out[y, x, :3]) * .5 + np.array([240, 120, 120]) * .5)) + (255,)
    sx, sy, f = face['mouth']
    if f > .3:
        x, y = int(round(sx - .5)), int(round(sy))
        for dx in ((0, 1) if f > .7 else (0,)):
            if out[y, x + dx, 3]: out[y, x + dx] = (150, 60, 60, 255)
    return out
