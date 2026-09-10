#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OGP画像(1200x630)を生成。依存: Pillow + 日本語フォント(Noto Sans CJK/JP 等)

生成物:
  public/assets/img/og-v2.png         … 全ページ共通(自治体ガチャ訴求)
  public/assets/img/og-budget-v2.png  … /budget-gacha/ 専用(予算ガチャ訴求)

旧 og.png は既存URLから参照されうるため削除しない(このスクリプトは上書きもしない)。
画像を作り直すときはファイル名の版数を上げ、generate-pages.py の参照も合わせて更新する
(Xやカードキャッシュは画像URL単位で保持されるため、同名上書きでは更新が届かない)。

レイアウトの原則:
  ・文字位置はすべて textbbox() の「実際の描画範囲(インク境界)」から算出する。
    フォントのアセンダ/ディセンダ分の余白は上下中央判定に含めない。
  ・左テキスト段は TEXT_RIGHT_LIMIT で打ち切り、右のガチャイラストと重ねない。
  ・Xがカード下部にページタイトルを重ねる場合に備え、SAFE_BOTTOM より下に文字を置かない。
  最後に assert で上記を実測検証する(はみ出したら生成を失敗させる)。
"""
from __future__ import annotations

import glob
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "public" / "assets" / "img"

# ====== キャンバスと配色 ======
W, H = 1200, 630
CREAM, GREEN, DGREEN, ORANGE, INK = "#FBF4E4", "#2E7D46", "#1E5D33", "#EF7C1A", "#40381F"
SUB_INK = "#6E6547"

# ====== 安全域 ======
MACHINE_CX = 900                 # ガチャイラストの中心X
TEXT_X = 80                      # 左テキスト段の左端
TEXT_RIGHT_LIMIT = 700           # 文字を置いてよい右端(イラスト左端725pxとの間に25px以上の余白)
TEXT_MAX_W = TEXT_RIGHT_LIMIT - TEXT_X   # = 620
SAFE_TOP = 62
SAFE_BOTTOM = 535                # Xのタイトル帯を見込んだ下端


# ====== フォント探索 ======
# Noto Sans CJK / Noto Sans JP を最優先。可変フォント(VF)の場合はウェイトを指定する。
FONT_CANDIDATES = [
    # Linux (Noto CJK)
    "/usr/share/fonts/opentype/noto/NotoSansCJK-{weight}.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKjp-{weight}.otf",
    # Windows (Noto Sans JP 可変フォント → 游ゴシック → メイリオ → BIZ UDゴシック)
    "C:/Windows/Fonts/NotoSansJP-VF.ttf",
    "C:/Windows/Fonts/YuGoth{yu}.ttc",
    "C:/Windows/Fonts/meiryo{mei}.ttc",
    "C:/Windows/Fonts/BIZ-UDGothic{biz}.ttc",
    # macOS
    "/System/Library/Fonts/Hiragino Sans W{hira}.ttc",
]
_GLOB_FALLBACKS = [
    "/usr/share/fonts/**/NotoSansCJK*{weight}*.ttc",
    "/usr/share/fonts/**/NotoSansJP*.ttf",
    "/usr/share/fonts/**/*CJK*.ttc",
]

_font_source: dict[str, str] = {}


def _resolve_font_path(weight: str) -> str:
    subs = {
        "Bold": dict(weight="Bold", yu="B", mei="b", biz="B", hira="6"),
        "Regular": dict(weight="Regular", yu="R", mei="", biz="R", hira="3"),
    }[weight]
    for tmpl in FONT_CANDIDATES:
        path = tmpl.format(**subs)
        if os.path.exists(path):
            return path
    for tmpl in _GLOB_FALLBACKS:
        hits = sorted(glob.glob(tmpl.format(**subs), recursive=True))
        if hits:
            return hits[0]
    raise SystemExit("日本語フォントが見つかりません。Noto Sans CJK / Noto Sans JP を入れてください。")


def font(size: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:
    path = _resolve_font_path(weight)
    f = ImageFont.truetype(path, size)
    if path.endswith("-VF.ttf"):
        # 可変フォントは既定インスタンスが Regular なのでウェイトを明示する
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
    _font_source[weight] = path
    return f


# ====== 実測ユーティリティ ======
_probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))


def ink(text: str, f: ImageFont.FreeTypeFont) -> tuple[int, int, int, int]:
    """(x0, y0, x1, y1) — 原点(0,0)に描いたときの実際のインク境界"""
    return _probe.textbbox((0, 0), text, font=f)


def ink_w(text: str, f) -> int:
    b = ink(text, f)
    return b[2] - b[0]


def ink_h(text: str, f) -> int:
    b = ink(text, f)
    return b[3] - b[1]


def fit_font(lines: list[str], max_w: int, size: int, min_size: int, weight: str = "Bold"):
    """最大幅に収まるまで1ptずつ縮める。min_size を下回るなら失敗させる
       (読めないほど小さくして重なりを回避するのを防ぐため)。"""
    s = size
    while s >= min_size:
        f = font(s, weight)
        if max(ink_w(t, f) for t in lines) <= max_w:
            return f
        s -= 1
    raise SystemExit(f"{lines} が幅{max_w}pxに収まりません(最小{min_size}pt)")


class Canvas:
    """描いた文字のインク境界を記録し、最後に安全域を検証する描画面"""

    def __init__(self) -> None:
        self.img = Image.new("RGB", (W, H), CREAM)
        self.d = ImageDraw.Draw(self.img)
        self.boxes: list[tuple[str, tuple[float, float, float, float]]] = []

    def text_at(self, x: float, ink_top: float, s: str, f, fill: str) -> None:
        """左端x・インク上端ink_top に合わせて描く(フォント上部の余白分を差し引く)"""
        b = ink(s, f)
        px, py = x - b[0], ink_top - b[1]
        self.d.text((px, py), s, font=f, fill=fill)
        self.boxes.append((s, (px + b[0], py + b[1], px + b[2], py + b[3])))

    def text_centered_in(self, rect: tuple[float, float, float, float], s: str, f, fill: str) -> None:
        """矩形に対し、インク境界の中心が矩形中心と一致するよう配置する"""
        x0, y0, x1, y1 = rect
        b = ink(s, f)
        w, h = b[2] - b[0], b[3] - b[1]
        px = x0 + (x1 - x0 - w) / 2 - b[0]
        py = y0 + (y1 - y0 - h) / 2 - b[1]
        self.d.text((px, py), s, font=f, fill=fill)
        self.boxes.append((s, (px + b[0], py + b[1], px + b[2], py + b[3])))

    def verify(self) -> tuple[float, float]:
        for s, (x0, y0, x1, y1) in self.boxes:
            assert x1 <= TEXT_RIGHT_LIMIT, f"『{s}』がイラスト側にはみ出し: 右端{x1}px > {TEXT_RIGHT_LIMIT}px"
            assert y1 <= SAFE_BOTTOM, f"『{s}』が下端安全域を超過: 下端{y1}px > {SAFE_BOTTOM}px"
            assert x0 >= 0 and y0 >= 0, f"『{s}』が画面外: {(x0, y0)}"
        return max(b[2] for _, b in self.boxes), max(b[3] for _, b in self.boxes)


# ====== イラスト(ガチャマシン) ======
# ドームに重ねていた「ふるガチャ」看板(白い看板背景+緑の角丸枠+文字)は描かない。
# 看板があった位置にもカプセルを置き、ドーム内が不自然に空かないようにする。
# (dx はマシン中心からの相対X。すべてドーム内周に収まる位置)
CAPSULES = [
    (-55, 150, 42, "#EF6351"),
    (42, 122, 36, "#FFC93C"),
    (64, 214, 42, "#7EC8E3"),
    (-32, 232, 36, "#FFFFFF"),
    (-86, 254, 32, "#FFC93C"),
    (-6, 296, 38, "#EF6351"),
    (66, 288, 32, "#FFFFFF"),
]


def draw_machine(d: ImageDraw.ImageDraw, mx: int = MACHINE_CX) -> None:
    # 背景の水玉
    for x, y, r, c in [(1080, 90, 130, "#F6EBD2"), (120, 540, 100, "#F1E6CC"), (1130, 520, 70, "#F1E6CC")]:
        d.ellipse((x - r, y - r, x + r, y + r), fill=c)

    # 透明ドーム
    d.ellipse((mx - 150, 60, mx + 150, 360), fill="#EAF6FF", outline="#C7DEEA", width=8)

    # カプセル
    for dx, cy, r, c in CAPSULES:
        cx = mx + dx
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=c,
                  outline="#E3D9C2" if c == "#FFFFFF" else None, width=3)
        if c != "#FFFFFF":
            d.ellipse((cx - r + 8, cy - r + 8, cx - r + 22, cy - r + 22), fill="#FFFFFF")

    # 本体・受け皿・ハンドル・取り出し口
    d.rounded_rectangle((mx - 175, 330, mx + 175, 560), 40, fill=GREEN)
    d.rounded_rectangle((mx - 115, 365, mx + 115, 470), 24, fill=CREAM)
    d.ellipse((mx - 32, 388, mx + 32, 452), fill="#E7EDF3", outline="#AEB9C4", width=6)
    d.rounded_rectangle((mx - 62, 495, mx + 62, 528), 14, fill="#173B22")


# ====== 1枚分の指定 ======
FOOTER = "無料・ログイン不要|furugacha"

COMMON = dict(
    out="og-v2.png",
    intro="今年のふるさと納税、",
    headline="どこにする?",
    desc=["知らない地域との出会いを、", "ガチャで。"],
    button="自治体ガチャをまわす",
)

# /budget-gacha/ 専用。リンク先の機能と画像の文言を一致させる。
# 制度変更・締切など時期限定の文言は入れない(画像URLは長期間キャッシュされるため)。
BUDGET = dict(
    out="og-budget-v2.png",
    intro="ふるさと納税、",
    headline="予算で選ぼう。",
    desc=["予算内の返礼品の", "組み合わせをご提案"],
    button="予算ガチャを試す",
)


def render(spec: dict) -> Path:
    c = Canvas()
    draw_machine(c.d)

    f_intro = fit_font([spec["intro"]], TEXT_MAX_W, 46, 34)
    f_head = fit_font([spec["headline"]], TEXT_MAX_W, 96, 68)
    f_desc = fit_font(spec["desc"], TEXT_MAX_W, 36, 30)
    f_btn = fit_font([spec["button"]], TEXT_MAX_W - 112, 38, 30)
    f_foot = fit_font([FOOTER], TEXT_MAX_W, 26, 20)

    desc_lh = round(f_desc.size * 1.45)
    btn_pad_x, btn_pad_y = 56, 20
    btn_ink_w, btn_ink_h = ink_w(spec["button"], f_btn), ink_h(spec["button"], f_btn)
    btn_w = min(btn_ink_w + btn_pad_x * 2, TEXT_MAX_W)
    btn_h = btn_ink_h + btn_pad_y * 2

    # 各ブロックの高さは実測。説明文は行送り一定で、先頭行のインク上端を基準にする。
    desc_first_off = ink(spec["desc"][0], f_desc)[1]
    desc_last_bottom = (len(spec["desc"]) - 1) * desc_lh + ink(spec["desc"][-1], f_desc)[3]
    heights = [
        ink_h(spec["intro"], f_intro),
        ink_h(spec["headline"], f_head),
        desc_last_bottom - desc_first_off,
        btn_h,
        ink_h(FOOTER, f_foot),
    ]
    gaps = [14, 46, 40, 26]   # 導入→大見出し→説明→ボタン→フッター

    total = sum(heights) + sum(gaps)
    avail = SAFE_BOTTOM - SAFE_TOP
    if total > avail:
        raise SystemExit(f"レイアウトが安全域に収まりません: {total}px > {avail}px")
    y = SAFE_TOP + (avail - total) // 2

    c.text_at(TEXT_X, y, spec["intro"], f_intro, INK)
    y += heights[0] + gaps[0]

    c.text_at(TEXT_X, y, spec["headline"], f_head, DGREEN)
    y += heights[1] + gaps[1]

    em_top = y - desc_first_off
    for i, line in enumerate(spec["desc"]):
        c.text_at(TEXT_X, em_top + i * desc_lh + ink(line, f_desc)[1], line, f_desc, INK)
    y += heights[2] + gaps[2]

    rect = (TEXT_X, y, TEXT_X + btn_w, y + btn_h)
    c.d.rounded_rectangle(rect, btn_h // 2, fill=ORANGE)
    c.text_centered_in(rect, spec["button"], f_btn, "#FFFFFF")
    y += heights[3] + gaps[3]

    c.text_at(TEXT_X, y, FOOTER, f_foot, SUB_INK)

    right, bottom = c.verify()
    out = IMG_DIR / spec["out"]
    c.img.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size} bytes) | "
          f"文字インク右端={right:.0f}px(上限{TEXT_RIGHT_LIMIT}) 下端={bottom:.0f}px(上限{SAFE_BOTTOM}) | "
          f"見出し{f_head.size}pt / 説明{f_desc.size}pt / ボタン{f_btn.size}pt")
    return out


if __name__ == "__main__":
    for spec in (COMMON, BUDGET):
        render(spec)
    for weight, path in sorted(_font_source.items()):
        print(f"font[{weight}] = {path}")
