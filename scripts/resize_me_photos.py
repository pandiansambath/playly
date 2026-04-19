"""Resize and recompress photos in frontend/public/me/ in place.

Target: longest edge 1600px, JPEG quality 80, progressive.
Preserves filenames/paths. Keeps orientation (exif transpose).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ME_DIR = ROOT / "frontend" / "public" / "me"
MAX_EDGE = 1600
QUALITY = 80

def main() -> int:
    if not ME_DIR.exists():
        print(f"Missing: {ME_DIR}", file=sys.stderr)
        return 1
    files = sorted([p for p in ME_DIR.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
    total_before = sum(p.stat().st_size for p in files)
    total_after = 0
    for i, p in enumerate(files, 1):
        before = p.stat().st_size
        try:
            with Image.open(p) as im:
                im = ImageOps.exif_transpose(im)
                if im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                w, h = im.size
                longest = max(w, h)
                if longest > MAX_EDGE:
                    scale = MAX_EDGE / longest
                    im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
                tmp = p.with_suffix(p.suffix + ".tmp")
                im.save(tmp, format="JPEG", quality=QUALITY, optimize=True, progressive=True)
            os.replace(tmp, p)
            after = p.stat().st_size
            total_after += after
            print(f"[{i:2d}/{len(files)}] {p.name}: {before/1024:.0f}KB -> {after/1024:.0f}KB")
        except Exception as e:
            print(f"FAIL {p.name}: {e}", file=sys.stderr)
            total_after += before
    print(f"\nTotal: {total_before/1024/1024:.1f}MB -> {total_after/1024/1024:.1f}MB")
    return 0

if __name__ == "__main__":
    sys.exit(main())
