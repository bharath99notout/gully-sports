#!/usr/bin/env python3
"""Build Play feature graphic (1024x500) using this repo's PWA icon + manifest colors."""

from __future__ import annotations

import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Match src/app/manifest.ts
THEME = (16, 185, 129)  # #10b981
BG = (3, 7, 18)  # #030712
TEXT = (249, 250, 251)
SUB = (156, 163, 175)

# public/playstore/ → public/icons/
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parent
ICON = PUBLIC / "icons" / "icon-512.png"
OUT = ROOT / "feature-graphic-1024x500.png"

W, H = 1024, 500


def main() -> None:
    if not ICON.is_file():
        raise SystemExit(f"Missing app icon: {ICON}")

    base = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((480, -120, 1180, 680), fill=(*THEME, 38))
    g.ellipse((600, 20, 1080, 520), fill=(*THEME, 22))
    img = Image.alpha_composite(base.convert("RGBA"), glow).convert("RGB")

    icon = Image.open(ICON).convert("RGBA")
    icon_sz = 252
    icon = icon.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
    radius = 40
    mask = Image.new("L", (icon_sz, icon_sz), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, icon_sz, icon_sz), radius=radius, fill=255
    )
    rounded = Image.new("RGBA", (icon_sz, icon_sz), (0, 0, 0, 0))
    rounded.paste(icon, (0, 0), mask)

    ix, iy = 44, (H - icon_sz) // 2
    layer = img.convert("RGBA")
    layer.paste(rounded, (ix, iy), rounded)
    img = layer.convert("RGB")
    draw = ImageDraw.Draw(img)

    title_font = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf", 52
    )
    sub_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 21)

    lx = ix + icon_sz + 26
    draw.rectangle([lx, iy + 18, lx + 5, iy + icon_sz - 18], fill=THEME)

    tx = lx + 22
    ty = iy + 36
    draw.text((tx, ty), "GullySports", fill=TEXT, font=title_font)
    bb = draw.textbbox((tx, ty), "GullySports", font=title_font)
    sub_text = (
        "Score gully cricket, football, badminton, table tennis & foosball. "
        "Track stats and build your caliber."
    )
    lines = textwrap.wrap(sub_text, width=48)
    y = bb[3] + 16
    for line in lines:
        draw.text((tx, y), line, fill=SUB, font=sub_font)
        y += 26

    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
