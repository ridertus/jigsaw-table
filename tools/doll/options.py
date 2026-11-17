"""Catalog sheet of every option:  python3 tools/doll/options.py out.png"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import *
from PIL import ImageDraw, ImageFont
S = 3; cell = 48 * S
def tile(look, d='south', pose='idle'):
    return Image.fromarray(dress(base(pose, d), d, look, pose)).resize((cell, cell), Image.NEAREST)
B = dict(skin='peach', hair='short', hairc='#5a3a2a', top='tee', topc='#e8e0d0', bottom='shorts', botc='#6a80a8', shoes='sneakers', shoec='#ffffff')
SECTIONS = [
 ('HAIR (front / side / back)', [(h, [tile({**B, 'hair': h}, d) for d in ('south', 'east', 'north')]) for h in ('short', 'spiky', 'bob', 'long', 'buns', 'pony')]),
 ('HAIR COLOUR', [(c, [tile({**B, 'hair': 'bob', 'hairc': c})]) for c in ('#1e1a22', '#5a3a2a', '#a0623a', '#e8c060', '#e07090', '#7a9ad8', '#9a7ac8', '#e8e4e0')]),
 ('EYES', [(e + ' ' + i, [tile({**B, 'eyes': e, 'iris': i})]) for e, i in (('classic', 'brown'), ('classic', 'blue'), ('sparkle', 'violet'), ('bean', 'black'), ('happy', 'brown'), ('sleepy', 'green'), ('sharp', 'brown'), ('classic', 'pink'))]),
 ('SKIN', [(s, [tile({**B, 'skin': s})]) for s in SKIN_TONES]),
 ('TOP', [(t, [tile({**B, 'top': t, 'topc': c})]) for t, c in (('tank', '#ffffff'), ('tee', '#d05050'), ('hoodie', '#5a8ad0'), ('dress', '#f0c040'))]),
 ('BOTTOM / SHOES / GLASSES', [(n, [tile({**B, **o})]) for n, o in (('shorts', dict(bottom='shorts', botc='#2c3c5c')), ('pants', dict(bottom='pants', botc='#3a4a70')), ('barefoot', dict(shoes='none')), ('sneakers', dict(shoes='sneakers', shoec='#d04040')), ('boots', dict(bottom='pants', botc='#7a5034', shoes='boots', shoec='#3a2a22')), ('glasses', dict(glasses='#3a2a30')))]),
]
if __name__ == '__main__':
    Wd = 1500; canvas = Image.new('RGBA', (Wd, 4000), (251, 245, 230, 255)); dr = ImageDraw.Draw(canvas)
    try: font = ImageFont.truetype('DejaVuSans-Bold.ttf', 18); small = ImageFont.truetype('DejaVuSans.ttf', 14)
    except Exception: font = small = None
    y = 8
    for title, items in SECTIONS:
        dr.text((10, y), title, fill=(60, 40, 20), font=font); y += 28; x = 0
        for name, tiles in items:
            w = cell * len(tiles) + 12
            if x + w > Wd: x = 0; y += cell + 22
            for k, t in enumerate(tiles): canvas.paste(t, (x + k * cell, y + 18), t)
            dr.text((x + 6, y), name, fill=(110, 80, 50), font=small); x += w
        y += cell + 30
    canvas.crop((0, 0, Wd, y)).save(sys.argv[1])
