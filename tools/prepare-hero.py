#!/usr/bin/env python3
"""Připraví fotografii rodiny pro hero sekci (RODINNÝ ŠTÍT).

Použití:  python3 tools/prepare-hero.py <originál.jpg|png>
Výstup:   assets/hero-family-{800,1400}.{webp,jpg}  (poměr 5:4, bez EXIF/GPS metadat)
Zdroj obrázku a licenci zapište do assets/CREDITS.md.
"""
import sys, pathlib
from PIL import Image, ImageOps

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).resolve().parent.parent / 'assets'
im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
# ořez na 5:4 (střed vodorovně, svisle zachovat horní část kvůli hlavám)
w, h = im.size
target = 5 / 4
if w / h > target:
    nw = round(h * target); left = (w - nw) // 2; im = im.crop((left, 0, left + nw, h))
elif w / h < target:
    nh = round(w / target); im = im.crop((0, 0, w, nh))
for width in (800, 1400):
    r = im.resize((width, round(width * 4 / 5)), Image.LANCZOS) if im.width > width else im
    r.save(out / f'hero-family-{width}.webp', 'WEBP', quality=80, method=6)   # bez metadat
    r.save(out / f'hero-family-{width}.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
    print(width, r.size, [(p.name, p.stat().st_size // 1024, 'kB') for p in out.glob(f'hero-family-{width}.*')])
