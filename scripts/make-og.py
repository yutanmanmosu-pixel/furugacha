#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OGP画像(1200x630 og.png)を生成。依存: Pillow + Noto CJK フォント"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import glob

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "img" / "og.png"

def font(size, weight="Bold"):
    cands = glob.glob(f"/usr/share/fonts/opentype/noto/NotoSansCJK-{weight}.ttc") \
          + glob.glob(f"/usr/share/fonts/**/NotoSansCJK*{weight}*.ttc", recursive=True) \
          + glob.glob("/usr/share/fonts/**/*CJK*.ttc", recursive=True)
    if not cands:
        raise SystemExit("Noto CJK font not found")
    return ImageFont.truetype(cands[0], size)

W, H = 1200, 630
CREAM, GREEN, DGREEN, ORANGE, INK = "#FBF4E4", "#2E7D46", "#1E5D33", "#EF7C1A", "#40381F"
img = Image.new("RGB", (W, H), CREAM)
d = ImageDraw.Draw(img)

# 背景の水玉
for x, y, r, c in [(1080, 90, 130, "#F6EBD2"), (120, 540, 100, "#F1E6CC"), (1130, 520, 70, "#F1E6CC")]:
    d.ellipse((x - r, y - r, x + r, y + r), fill=c)

# ガチャマシン(右側)
mx = 900
d.ellipse((mx - 150, 60, mx + 150, 360), fill="#EAF6FF", outline="#C7DEEA", width=8)  # dome
for cx, cy, r, c in [(mx - 55, 150, 42, "#EF6351"), (mx + 40, 120, 36, "#FFC93C"),
                     (mx + 62, 215, 42, "#7EC8E3"), (mx - 30, 235, 36, "#FFFFFF")]:
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=c, outline="#E3D9C2" if c == "#FFFFFF" else None, width=3)
    d.ellipse((cx - r + 8, cy - r + 8, cx - r + 22, cy - r + 22), fill="#FFFFFF")
d.rounded_rectangle((mx - 135, 205, mx + 135, 275), 35, fill="#FFFDF6", outline=GREEN, width=7)  # sign
sf = font(46)
tw = d.textlength("ふるガチャ", font=sf)
d.text((mx - tw / 2, 212), "ふるガチャ", font=sf, fill=GREEN)
d.rounded_rectangle((mx - 175, 330, mx + 175, 560), 40, fill=GREEN)  # body
d.rounded_rectangle((mx - 115, 365, mx + 115, 470), 24, fill=CREAM)
d.ellipse((mx - 32, 388, mx + 32, 452), fill="#E7EDF3", outline="#AEB9C4", width=6)  # knob
d.rounded_rectangle((mx - 62, 495, mx + 62, 528), 14, fill="#173B22")

# 左テキスト
d.text((80, 120), "今年のふるさと納税、", font=font(58), fill=INK)
d.text((80, 195), "どこにする?", font=font(110), fill=DGREEN)
d.text((80, 350), "知らない地域との出会いを、ガチャで。", font=font(40), fill=INK)
d.rounded_rectangle((80, 440, 560, 520), 40, fill=ORANGE)
bf = font(38)
label = "🎰 自治体ガチャをまわす"
label = "自治体ガチャをまわす"
tw = d.textlength(label, font=bf)
d.text((80 + (480 - tw) / 2, 458), label, font=bf, fill="#FFFFFF")
d.text((80, 555), "無料・ログイン不要|furugacha", font=font(28), fill="#6E6547")

img.save(OUT, optimize=True)
print("wrote", OUT, OUT.stat().st_size, "bytes")
