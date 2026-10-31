#!/usr/bin/env python3
"""Připraví fotografii Prahy pro první obrazovku pilotu (RODINNÝ ŠTÍT).

Použití:  python3 tools/prepare-prague.py <originál.jpg|png>
Výstup:   assets/prague-{800,1600}.{webp,jpg}  (poměr 16:9, bez metadat)
"""
import sys, pathlib
from PIL import Image, ImageOps

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).resolve().parent.parent / 'assets'
im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
w, h = im.size; target = 16 / 9
if w / h > target:
    nw = round(h * target); left = (w - nw) // 2; im = im.crop((left, 0, left + nw, h))
elif w / h < target:
    nh = round(w / target); top = (h - nh) // 2; im = im.crop((0, top, w, top + nh))
for width in (800, 1600):
    r = im.resize((width, round(width * 9 / 16)), Image.LANCZOS) if im.width > width else im
    r.save(out / f'prague-{width}.webp', 'WEBP', quality=80, method=6)
    r.save(out / f'prague-{width}.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
    print(width, r.size, [(p.name, p.stat().st_size // 1024, 'kB') for p in out.glob(f'prague-{width}.*')])
