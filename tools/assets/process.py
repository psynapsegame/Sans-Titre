"""Prépare les textures et les ciels du jeu à partir des sources téléchargées.
Usage : python process.py <dossier_sources> <dossier_assets>
Dépendances : numpy, opencv-python-headless, pillow
"""
import sys, os, json
import numpy as np, cv2
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(f'{dst}/tex', exist_ok=True); os.makedirs(f'{dst}/sky', exist_ok=True)

# ---- textures PBR (scans Poly Haven, CC0) : recompression seule, contenu inchangé
TEX = {
    'rock_face_diff': 't-rock_face_03_diff_1k.jpg', 'rock_face_nor': 't-rock_face_03_nor_1k.jpg',
    'aerial_rocks_diff': 'pc-aerial_rocks_02_diff_1k.jpg', 'aerial_rocks_nor': 't-aerial_rocks_02_nor_1k.jpg',
    'aerial_beach_diff': 't-aerial_beach_01_diff_1k.jpg', 'aerial_beach_nor': 't-aerial_beach_01_nor_1k.jpg',
    'boulder_cracked_diff': 'pc-rock_boulder_cracked_diff_1k.jpg',
    'water_nor': 'waternormals.jpg',
}
for name, f in TEX.items():
    im = Image.open(f'{src}/{f}').convert('RGB')
    q = 88 if name.endswith('nor') else 84
    im.save(f'{dst}/tex/{name}.jpg', quality=q, optimize=True)
    print('tex', name, im.size, os.path.getsize(f'{dst}/tex/{name}.jpg') // 1024, 'KB')

if os.path.exists(f'{src}/moon.png'): Image.open(f'{src}/moon.png').save(f'{dst}/tex/moon.webp', quality=90)

# ---- atlas de nuages (rendus Cycles) 2x2 en WebP avec alpha
cl = [Image.open(f'{src}/clouds/cloud{i}.png').convert('RGBA') for i in range(4)] if os.path.exists(f'{src}/clouds/cloud3.png') else []
if cl:
    s = cl[0].size[0]
    atlas = Image.new('RGBA', (s * 2, s * 2), (255, 255, 255, 0))
    for i, im in enumerate(cl):
        a = np.asarray(im).astype(np.float32)
        # canaux de couleur étendus sous l'alpha nul pour éviter les liserés sombres au filtrage
        rgb = a[..., :3]; al = a[..., 3:4] / 255
        blur = cv2.GaussianBlur(rgb * al, (0, 0), 6) / np.maximum(cv2.GaussianBlur(al, (0, 0), 6)[..., None], 1e-3)
        a[..., :3] = np.where(al > 0.02, rgb, blur)
        atlas.paste(Image.fromarray(a.astype(np.uint8), 'RGBA'), ((i % 2) * s, (i // 2) * s))
    atlas.save(f'{dst}/tex/clouds.webp', quality=88, method=6)
    print('clouds atlas', atlas.size, os.path.getsize(f'{dst}/tex/clouds.webp') // 1024, 'KB')

# ---- ciels : HDRI Poly Haven recadrés pour que le vrai ciel descende jusqu'à l'horizon
#   (cap = direction regardée par la caméra ; e_min = élévation source ramenée à l'horizon)
SKIES = [
    ('aube', 'kiara_1_dawn_1k.hdr', 0.615, 0.0, 0.55),
    ('gorges', 'quarry_01_1k.hdr', 0.565, 1.5, 0.6),
    ('orage', 'blouberg_sunrise_2_1k.hdr', 0.335, 4.0, 0.4),
    ('mer', 'venice_sunset_1k.hdr', 0.60, 1.2, 0.5),
    ('boreale', 'dikhololo_night_1k.hdr', 0.69, 30.0, 0.075),
]
W, H = 1024, 512
SKY_MAX = 4.0
info = {}
for name, f, heading, emin, target in SKIES:
    im = cv2.imread(f'{src}/{f}', cv2.IMREAD_UNCHANGED).astype(np.float32)
    h, w = im.shape[:2]
    v = (np.arange(H) + 0.5) / H
    elev = (0.5 - v) * 180.0
    e_abs = np.abs(elev)
    e_src = emin + e_abs * (90 - emin) / 90
    v_src = (0.5 - e_src / 180.0) * h - 0.5
    u = (np.arange(W) + 0.5) / W
    u_src = ((u + heading - 0.25) % 1.0) * w - 0.5
    mx, my = np.meshgrid(u_src.astype(np.float32), v_src.astype(np.float32))
    out = cv2.remap(im, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    out = np.maximum(out, 0)
    # exposition normalisée (médiane du ciel visible) et pics bornés pour un éclairage stable
    out *= target / max(float(np.median(out[: H // 2].mean(2))), 1e-4)
    # compression douce des hautes lumières : le ciel garde ses couleurs au lieu de saturer en blanc
    m = out.max(axis=2, keepdims=True); knee, c = 1.1, 2.6
    comp = np.where(m > knee, knee + (m - knee) / (1 + (m - knee) / c), m)
    out *= comp / np.maximum(m, 1e-6)
    # hémisphère bas : reflet adouci et assombri du ciel (lumière de rebond)
    low = elev < 0
    out[low] = cv2.GaussianBlur(out, (0, 0), 9)[low] * 0.45
    # encodage compact : JPEG 8 bits en gamma 2 sur la plage [0, SKY_MAX] (décodé en demi-flottants au chargement)
    enc = np.sqrt(np.clip(out / SKY_MAX, 0, 1))
    cv2.imwrite(f'{dst}/sky/{name}.jpg', (enc * 255 + 0.5).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93, cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444])
    # mesures utiles au moteur : couleur d'horizon (brume) et direction du soleil
    cx = int(0.25 * W); band = out[H // 2 - 14:H // 2 - 4, cx - 90:cx + 90]
    hz = band.reshape(-1, 3).mean(0)[::-1]
    up = out[: H // 2]; lum = up.mean(2); iy, ix = np.unravel_index(lum.argmax(), lum.shape)
    az = (ix + 0.5) / W; el = (0.5 - (iy + 0.5) / H) * 180
    zen = out[40:90].reshape(-1, 3).mean(0)[::-1]
    info[name] = dict(horizon=[round(float(x), 4) for x in hz], zenith=[round(float(x), 4) for x in zen],
                      sunU=round(float(az), 4), sunElev=round(float(el), 2), sunLum=round(float(lum.max()), 1))
    print('sky', name, os.path.getsize(f'{dst}/sky/{name}.jpg') // 1024, 'KB', info[name])
    t = out * (0.35 / max(float(np.median(out.mean(2))), 1e-3)); t = np.clip((t / (1 + t)) ** (1 / 2.2), 0, 1)
    cv2.imwrite(f'{src}/sky-preview-{name}.jpg', (t[:300, 56:456] * 255).astype(np.uint8))
json.dump(info, open(f'{dst}/sky/sky-info.json', 'w'), indent=1)
