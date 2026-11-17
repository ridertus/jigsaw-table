import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chibi import *
import head as Hd
from PIL import Image, ImageDraw, ImageFont
S = 3; cw = 48 * S
font = ImageFont.truetype('DejaVuSans.ttf', 14)
cols = ['#5a3a2c', '#2a2228', '#e07890', '#d8782c', '#e8c060', '#6a8ad8', '#8a6ac0', '#3a9a8a', '#c04048']
styles = list(Hd.STYLES)
dirs = ['south', 'south-east', 'east', 'north']
per = 3   # styles per row
W = per * (cw * 4 + 20); Hh = ((len(styles) + per - 1) // per) * (cw + 22)
im = Image.new('RGBA', (W, Hh + cw + 60), (251, 245, 230, 255)); dr = ImageDraw.Draw(im)
for k, stn in enumerate(styles):
    x0 = (k % per) * (cw * 4 + 20); y0 = (k // per) * (cw + 22)
    dr.text((x0 + 6, y0 + 2), stn, fill=(90, 60, 40), font=font)
    lk = dict(skin='peach', hair=stn, hairc=cols[k], eyes='anime', iris='brown', top='tee', topc='#f0e6d6', bottom='shorts', botc='#6a80a8', shoes='sneakers', shoec='#ffffff')
    for c, d in enumerate(dirs):
        f = Image.fromarray(compose(lk, 'idle', d)).resize((cw, cw), Image.NEAREST); im.paste(f, (x0 + c * cw, y0 + 20), f)
# eyes row (close-up of faces)
y0 = Hh + 10; dr.text((6, y0), 'eyes', fill=(90, 60, 40), font=font)
irises = ['brown', 'blue', 'pink', 'green', 'violet', 'brown', 'blue']
for k, e in enumerate(Hd.EYES):
    lk = dict(skin='peach', hair='fluffy', hairc='#5a3a2c', eyes=e, iris=irises[k], top='tee', topc='#f0e6d6')
    f = Image.fromarray(compose(lk, 'idle', 'south')).crop((8, 4, 40, 30)).resize((32 * 5, 26 * 5), Image.NEAREST)
    im.paste(f, (k * 175 + 6, y0 + 20), f); dr.text((k * 175 + 10, y0 + 152), e, fill=(90, 60, 40), font=font)
im.crop((0, 0, W, y0 + 175)).save(sys.argv[1])
