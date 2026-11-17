"""Build dressed-up characters from the PixelLab mannequin (assets/doll/pixellab).

  python3 tools/doll/build.py looks.json out.png         # atlas: one 48px row per look, game format
  python3 tools/doll/build.py looks.json out.png --gif walk.gif

Atlas row = idle 8 dirs | walk S,E,N,W x4 | sit 8 dirs (same layout as assets/chars/chars.png).
A look is a dict, every key optional:
  skin   peach | warm | tan | brown | porcelain
  eyes   classic | sparkle | bean | happy | sleepy | sharp      iris  brown | blue | green | violet | black | pink
  hair   short | spiky | bob | long | buns | pony               hairc '#rrggbb'
  top    tank | tee | hoodie | dress | none                     topc
  bottom shorts | pants                                         botc
  shoes  none | sneakers | boots                                shoec
  glasses '#rrggbb' (frame colour) or omitted
The PixelLab export has no animation frames: walk = stride pose / idle raised 1px / mirrored stride (S, N) / idle.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from doll import *
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'doll', 'pixellab')
POSE = {'idle': 'Idle', 'walk': 'walking_small_arm_s', 'sit': 'sitting_on_a_floor_c'}
_cache = {}
def base(pose, d):
    if (pose, d) not in _cache:
        a = load(os.path.join(SRC, POSE[pose], 'rotations', d + '.png'))
        if pose == 'sit': a = keep_main(remove_cushion(a))
        _cache[(pose, d)] = a
    return _cache[(pose, d)]

def shift_up(a, n=1):
    b = np.zeros_like(a); b[:-n] = a[n:]; return b

def walk_frames(d, look):
    st = base('walk', d)
    A = dress(st, d, look, 'walk'); P = shift_up(dress(base('idle', d), d, look, 'idle'))
    B = dress(np.ascontiguousarray(st[:, ::-1]), d, look, 'walk') if d in ('south', 'north') else A
    return [A, P, B, P]

def atlas_row(look):
    row = np.zeros((48, 48 * 32, 4), np.uint8)
    put = lambda col, f: row.__setitem__((slice(None), slice(col * 48, col * 48 + 48)), f)
    for i, d in enumerate(DIRS): put(i, dress(base('idle', d), d, look, 'idle'))
    for j, d in enumerate(['south', 'east', 'north', 'west']):
        for k, f in enumerate(walk_frames(d, look)): put(8 + j * 4 + k, f)
    for i, d in enumerate(DIRS): put(24 + i, dress(base('sit', d), d, look, 'sit'))
    return row

def walk_gif(rows, out, scale=4):
    frames = []
    cellw = 48 * scale
    def frame(col):
        f = Image.new('RGBA', (cellw * len(rows), cellw), (251, 245, 230, 255))
        for i, r in enumerate(rows):
            s = Image.fromarray(np.ascontiguousarray(r[:, col * 48:(col + 1) * 48])).resize((cellw, cellw), Image.NEAREST)
            f.paste(s, (i * cellw, 0), s)
        return f.convert('RGB')
    for d4 in range(4):
        for _ in range(2):
            for k in range(4): frames.append(frame(8 + d4 * 4 + k))
    for d8 in (0, 2, 4, 6): frames += [frame(24 + d8)] * 6
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=150, loop=0)

if __name__ == '__main__':
    looks = json.load(open(sys.argv[1])); out = sys.argv[2]
    rows = [atlas_row(l) for l in looks]
    Image.fromarray(np.concatenate(rows, 0)).save(out)
    if '--gif' in sys.argv: walk_gif(rows, sys.argv[sys.argv.index('--gif') + 1])
    print(out, len(rows), 'looks')
