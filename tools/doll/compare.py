import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chibi import *
from PIL import Image
LOOKS = [
 dict(skin='peach', hair='fluffy', hairc='#5a3a2c', eyes='anime', iris='brown', top='hoodie', topc='#2c3550', bottom='shorts', botc='#2a2a34', shoes='sneakers', shoec='#c84040'),
 dict(skin='porcelain', hair='hime', hairc='#2a2228', eyes='round', iris='brown', top='hoodie', topc='#f0e2c8', bottom='shorts', botc='#7aa0d0', shoes='sneakers', shoec='#f0f0f0'),
 dict(skin='peach', hair='buns', hairc='#e07890', eyes='anime', iris='pink', top='hoodie', topc='#e88aa0', bottom='shorts', botc='#d8e8f8', shoes='sneakers', shoec='#ffffff'),
 dict(skin='peach', hair='twintails', hairc='#d8782c', eyes='sharp', iris='brown', top='tee', topc='#5aa060', bottom='shorts', botc='#7a5034', shoes='sneakers', shoec='#4a8a5a'),
 dict(skin='peach', hair='pony', hairc='#e8c060', eyes='droopy', iris='brown', top='hoodie', topc='#eef0f0', bottom='shorts', botc='#c04040', shoes='sneakers', shoec='#c04040'),
]
old = np.array(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'chars', 'chars.png')).convert('RGBA'))
dirs = [0, 1, 2, 4, 6]
S = 4; cw = 48 * S
im = Image.new('RGBA', (cw * len(dirs) * 2 + 30, cw * len(LOOKS)), (251, 245, 230, 255))
for r, lk in enumerate(LOOKS):
    for c, di in enumerate(dirs):
        o = Image.fromarray(np.ascontiguousarray(old[r * 48:(r + 1) * 48, di * 48:(di + 1) * 48])).resize((cw, cw), Image.NEAREST)
        im.paste(o, (c * cw, r * cw), o)
        n = Image.fromarray(compose(lk, 'idle', DIRS[di])).resize((cw, cw), Image.NEAREST)
        im.paste(n, (cw * len(dirs) + 30 + c * cw, r * cw), n)
im.save(sys.argv[1])
