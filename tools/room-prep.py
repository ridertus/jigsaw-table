# Builds the room assets from the two ChatGPT images:
#   day image is warped onto the night image's geometry (they were generated separately and drift 10-20px),
#   occluding objects are cut out (GrabCut seeded with hand polygons) into one transparent layer per lighting.
import cv2, numpy as np, json, sys
from PIL import Image
OUT = sys.argv[1]
night = np.array(Image.open('/mnt/user-data/uploads/8857623a-image.png').convert('RGB'))
day = np.array(Image.open('/mnt/user-data/uploads/3a6aa5f7-image.png').convert('RGB'))
H, W = night.shape[:2]
# --- align day -> night
def feat(im):
    g = cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(g)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_ULTRAFAST)
dis.setFinestScale(0); dis.setPatchSize(16); dis.setPatchStride(4); dis.setGradientDescentIterations(25)
dis.setVariationalRefinementIterations(10); dis.setVariationalRefinementAlpha(40)
flow = dis.calc(feat(night), feat(day), None)
flow = cv2.medianBlur(flow, 5); flow = cv2.GaussianBlur(flow, (0, 0), 9)
gx, gy = np.meshgrid(np.arange(W), np.arange(H))
day = cv2.remap(day, (gx + flow[..., 0]).astype(np.float32), (gy + flow[..., 1]).astype(np.float32), cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)

# --- occluders: name, rect (x0,y0,x1,y1), base y, seed polygon (definitely object) ; mode 'poly' = trust polygon exactly
OCC = [
  ('tv',     (88, 228, 345, 498), 452, 'poly', [(92,232),(268,232),(268,368),(342,368),(342,446),(102,496),(92,496)]),
  ('bean',   (330, 414, 512, 562), 548, 'poly', [(368,440),(386,429),(405,426),(430,428),(450,436),(471,452),(490,476),(502,505),(500,530),(485,543),(455,553),(420,558),(385,556),(355,550),(342,532),(337,500),(345,462)]),
  ('rtable', (255, 548, 436, 642), 628, 'cut',  [(268,566),(330,552),(420,562),(428,598),(380,616),(300,618),(275,632),(285,600)]),
  ('fplant', (222, 512, 280, 592), 586, 'cut',  [(240,530),(262,528),(266,580),(240,582)]),
  ('ctable', (766, 474, 1186, 642), 600, 'poly', [(770,481),(1106,476),(1180,575),(1176,586),(1160,587),(1160,636),(1132,636),(1132,591),(866,598),(866,638),(838,638),(838,600),(820,600)]),
  ('umb',    (1466, 330, 1672, 622), 600, 'cut',  [(1480,470),(1560,470),(1570,450),(1672,440),(1672,612),(1570,612),(1560,585),(1480,585)]),
  ('lplant', (90, 538, 216, 704), 696, 'cut',  [(110,580),(190,560),(205,640),(170,695),(130,690)]),
  ('front',  (0, 640, 1672, 941), 100000, 'front', None),
]
mask_all = np.zeros((H, W), np.uint8)
meta = []
for name, (x0, y0, x1, y1), base, mode, poly in OCC:
    m = np.zeros((H, W), np.uint8)
    if mode == 'poly':
        cv2.fillPoly(m, [np.array(poly, np.int32)], 255)
    elif mode == 'cut':
        gm = np.full((H, W), cv2.GC_BGD, np.uint8)
        gm[y0:y1, x0:x1] = cv2.GC_PR_BGD
        cv2.fillPoly(gm, [np.array(poly, np.int32)], cv2.GC_PR_FGD)
        inner = np.zeros((H, W), np.uint8); cv2.fillPoly(inner, [np.array(poly, np.int32)], 255); inner = cv2.erode(inner, np.ones((9, 9), np.uint8))
        gm[inner > 0] = cv2.GC_FGD
        bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        cv2.grabCut(cv2.cvtColor(night, cv2.COLOR_RGB2BGR), gm, (x0, y0, x1 - x0, y1 - y0), bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
        m[(gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD)] = 255
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        lim = np.zeros((H, W), np.uint8); cv2.fillPoly(lim, [np.array(poly, np.int32)], 255); lim = cv2.dilate(lim, np.ones((15, 15), np.uint8))
        m[lim == 0] = 0
    elif mode == 'front':
        # everything in front of the platform edge, plus what sticks up from the ledge (plants, posts, little shelf)
        edge = [(0,560),(110,640),(300,716),(600,716),(948,718),(948,941),(0,941)]
        edge2 = [(1094,718),(1262,716),(1262,680),(1312,680),(1312,712),(1418,712),(1418,676),(1640,676),(1672,676),(1672,941),(1094,941)]
        cv2.fillPoly(m, [np.array(edge, np.int32), np.array(edge2, np.int32)], 255)
        cv2.rectangle(m, (948, 790), (1094, 941), 255, -1)   # below the doormat
        # protruding things: grabcut each
        for (px0, py0, px1, py1, sp) in [(586, 650, 716, 720, [(610,690),(690,680),(700,716),(620,716)]),
                                         (796, 700, 876, 720, [(802,706),(870,706),(870,720),(802,720)]),
                                         (1110, 695, 1212, 720, [(1130,708),(1190,705),(1195,720),(1130,720)]),
                                         (1262, 676, 1314, 720, [(1266,682),(1308,682),(1308,720),(1266,720)])]:
            gm = np.full((H, W), cv2.GC_BGD, np.uint8); gm[py0:py1, px0:px1] = cv2.GC_PR_BGD
            cv2.fillPoly(gm, [np.array(sp, np.int32)], cv2.GC_FGD)
            gm[720:740, px0:px1] = cv2.GC_FGD
            bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
            cv2.grabCut(cv2.cvtColor(night, cv2.COLOR_RGB2BGR), gm, (px0, py0, px1 - px0, py1 - py0), bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
            mm = ((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD)); mm[:py0] = False; mm[:, :px0] = False; mm[:, px1:] = False
            m[mm] = 255
    m[:, :] = np.where(m > 0, 255, 0)
    rx0, ry0, rx1, ry1 = x0, y0, x1, y1
    keep = np.zeros_like(m); keep[ry0:ry1, rx0:rx1] = m[ry0:ry1, rx0:rx1]
    mask_all = np.maximum(mask_all, keep)
    meta.append({'id': name, 'r': [rx0, ry0, rx1 - rx0, ry1 - ry0], 'base': base})
for nm, img in (('night', night), ('day', day)):
    Image.fromarray(img).save(f'{OUT}/room-{nm}.webp', quality=90, method=6)
    rgba = np.dstack([img, mask_all])
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/room-{nm}-front.webp', quality=92, method=6)
Image.fromarray(mask_all).save('/tmp/rm/mask.png')
json.dump(meta, open('/tmp/rm/occ.json', 'w'))
print(meta)
