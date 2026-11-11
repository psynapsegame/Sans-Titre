"""Assemble les sprites rendus par make_sprites.py en fichiers prêts pour le jeu.
Usage : python pack_sprites.py <rendus> <sources> <assets/sprites>
  <sources> contient clouds.webp (atlas de nuages Cycles) et la texture aerial_rocks (Poly Haven, CC0).
"""
import sys, os
from PIL import Image, ImageFilter, ImageOps

src, extra, dst = sys.argv[1:4]
os.makedirs(dst, exist_ok=True)

def strip(prefix, n, name):
    frames = [Image.open(f'{src}/{prefix}_{i}.png').convert('RGBA') for i in range(n)]
    w, h = frames[0].size
    sheet = Image.new('RGBA', (w * n, h), (0, 0, 0, 0))
    for i, f in enumerate(frames): sheet.paste(f, (i * w, 0))
    sheet.save(f'{dst}/{name}.png', optimize=True)

strip('bird', 8, 'birds')
strip('falcon', 4, 'falcon')
for n in ('feather', 'pine0', 'pine1', 'pine0_shadow', 'pine1_shadow', 'stack0', 'stack1', 'stack2'):
    Image.open(f'{src}/{n}.png').convert('RGBA').save(f'{dst}/{n}.png', optimize=True)
Image.open(f'{extra}/clouds.webp').save(f'{dst}/clouds.webp', quality=88, method=6)

# texture de roche stylisée : scan réel ramené à quelques aplats (gouache), en nuances de gris pour être teintée
rock = Image.open(f'{extra}/aerial_rocks_02_diff_1k.jpg').convert('L').resize((384, 384), Image.LANCZOS)
rock = ImageOps.autocontrast(rock.filter(ImageFilter.MedianFilter(7)), cutoff=2)
rock = ImageOps.posterize(rock.convert('RGB'), 3).convert('L').filter(ImageFilter.GaussianBlur(0.6))
rock.save(f'{dst}/rock.jpg', quality=86)
for f in sorted(os.listdir(dst)): print(f, os.path.getsize(f'{dst}/{f}') // 1024, 'Ko')
