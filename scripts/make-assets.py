#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""favicon.svg とモック返礼品SVG(18種)を生成する。依存: 標準ライブラリのみ"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "public" / "assets" / "img"
MOCK = IMG / "mock"
MOCK.mkdir(parents=True, exist_ok=True)

FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#FBF4E4"/><circle cx="32" cy="24" r="17" fill="#EAF6FF" stroke="#BFDCE8" stroke-width="2"/><circle cx="26" cy="20" r="5" fill="#EF6351"/><circle cx="37" cy="17" r="4.5" fill="#FFC93C"/><circle cx="39" cy="27" r="5" fill="#7EC8E3"/><circle cx="28" cy="29" r="4.5" fill="#fff" stroke="#E3D9C2"/><rect x="13" y="37" width="38" height="20" rx="7" fill="#2E7D46"/><rect x="21" y="41" width="22" height="8" rx="4" fill="#FBF4E4"/><circle cx="32" cy="45" r="2.6" fill="#B9C3CC"/><rect x="25" y="52" width="14" height="3.5" rx="1.75" fill="#1E4027"/></svg>"""
(IMG / "favicon.svg").write_text(FAVICON, encoding="utf-8")

def svg(bg, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
            f'<rect width="200" height="200" fill="{bg}"/>{body}</svg>')

C = dict(ink="#5B4A2F", white="#FFFFFF", cream="#FFF7E6", red="#E85D6A", pink="#F3B0A5",
         orange="#F7A64B", yellow="#FFD95E", green="#7DB65C", dgreen="#4E8D4A",
         blue="#7EC8E3", dblue="#4E7FA0", brown="#B07B4F", gray="#C6CDD4")

ICONS = {
 # --- food ---
 "meat": ("#FDE7E0", f'<ellipse cx="100" cy="108" rx="62" ry="44" fill="{C["red"]}"/><ellipse cx="100" cy="108" rx="62" ry="44" fill="none" stroke="{C["pink"]}" stroke-width="10" stroke-dasharray="2 18" stroke-linecap="round"/><ellipse cx="82" cy="96" rx="16" ry="9" fill="{C["pink"]}"/><circle cx="146" cy="70" r="14" fill="{C["white"]}" stroke="{C["gray"]}" stroke-width="4"/>'),
 "seafood": ("#E3F0F7", f'<path d="M40 104 q42 -34 96 0 q-20 30 -48 30 q-28 0 -48 -30Z" fill="{C["blue"]}"/><path d="M136 104 l30 -20 v40 Z" fill="{C["dblue"]}"/><circle cx="62" cy="100" r="5" fill="#1F3D52"/><path d="M52 132 q10 8 20 0" stroke="{C["dblue"]}" stroke-width="4" fill="none" stroke-linecap="round"/>'),
 "rice": ("#FFF6DA", f'<path d="M46 108 h108 a54 34 0 0 1 -108 0Z" fill="{C["brown"]}"/><path d="M46 108 h108 a54 34 0 0 1 -108 0Z" fill="none" stroke="#8F5E38" stroke-width="5"/><ellipse cx="100" cy="98" rx="46" ry="20" fill="{C["white"]}"/><circle cx="84" cy="90" r="6" fill="{C["cream"]}"/><circle cx="106" cy="86" r="6" fill="{C["cream"]}"/><circle cx="118" cy="96" r="6" fill="{C["cream"]}"/>'),
 "vegetable": ("#E7F2E3", f'<path d="M100 70 q30 6 26 52 q-4 34 -26 48 q-22 -14 -26 -48 q-4 -46 26 -52Z" fill="{C["orange"]}"/><path d="M100 70 q-4 -20 -18 -26 q16 -4 22 8 q4 -16 20 -14 q-12 6 -12 22Z" fill="{C["dgreen"]}"/><path d="M92 96 h16 M90 116 h20 M92 136 h16" stroke="#D9822B" stroke-width="4" stroke-linecap="round"/>'),
 "fruit": ("#FFEFE3", f'<circle cx="100" cy="112" r="52" fill="{C["orange"]}"/><circle cx="84" cy="98" r="10" fill="#FFC98A"/><path d="M100 62 q4 -16 20 -18 q-2 14 -20 18Z" fill="{C["dgreen"]}"/><path d="M100 62 q-2 -10 2 -18" stroke="#8F5E38" stroke-width="5" fill="none" stroke-linecap="round"/>'),
 "sweets": ("#FBE4EC", f'<path d="M60 112 h80 v34 a12 12 0 0 1 -12 12 h-56 a12 12 0 0 1 -12 -12Z" fill="{C["yellow"]}"/><path d="M56 112 q10 -34 44 -34 q34 0 44 34 q-22 12 -44 12 q-22 0 -44 -12Z" fill="#8C5A3B"/><circle cx="100" cy="72" r="9" fill="{C["red"]}"/><path d="M72 122 v22 M100 124 v24 M128 122 v22" stroke="#E8B84B" stroke-width="5" stroke-linecap="round"/>'),
 "drink": ("#E9F3EF", f'<rect x="76" y="70" width="48" height="94" rx="12" fill="{C["dgreen"]}"/><rect x="86" y="46" width="28" height="28" rx="8" fill="{C["dgreen"]}"/><rect x="86" y="40" width="28" height="12" rx="4" fill="{C["brown"]}"/><rect x="84" y="96" width="32" height="40" rx="6" fill="{C["cream"]}"/>'),
 "processed": ("#F6ECD9", f'<rect x="64" y="76" width="72" height="88" rx="14" fill="#E7A03C"/><rect x="64" y="76" width="72" height="88" rx="14" fill="none" stroke="#B9782B" stroke-width="5"/><rect x="60" y="56" width="80" height="24" rx="8" fill="{C["brown"]}"/><rect x="76" y="102" width="48" height="36" rx="6" fill="{C["cream"]}"/>'),
 # --- life ---
 "daily": ("#EAF2F8", f'<rect x="52" y="84" width="96" height="60" rx="10" fill="{C["white"]}" stroke="{C["gray"]}" stroke-width="5"/><path d="M84 84 q16 -26 32 0 q-8 10 -16 4 q-8 6 -16 -4Z" fill="{C["blue"]}"/><rect x="52" y="124" width="96" height="20" rx="10" fill="#DDE9F2"/>'),
 "goods": ("#F3EDE2", f'<rect x="58" y="88" width="84" height="72" rx="10" fill="{C["cream"]}" stroke="{C["brown"]}" stroke-width="5"/><rect x="94" y="88" width="12" height="72" fill="{C["brown"]}"/><rect x="58" y="112" width="84" height="12" fill="{C["brown"]}" opacity=".55"/><path d="M100 88 q-14 -20 -24 -6 q8 12 24 6Z" fill="{C["red"]}"/><path d="M100 88 q14 -20 24 -6 q-8 12 -24 6Z" fill="{C["red"]}"/>'),
 "kitchen": ("#FDEBD7", f'<rect x="56" y="96" width="88" height="52" rx="12" fill="{C["gray"]}"/><rect x="56" y="96" width="88" height="14" fill="#AEB6BE"/><rect x="140" y="112" width="26" height="10" rx="5" fill="#AEB6BE"/><rect x="34" y="112" width="26" height="10" rx="5" fill="#AEB6BE"/><rect x="74" y="72" width="52" height="18" rx="9" fill="{C["dgreen"]}"/>'),
 "appliance": ("#E8EDF3", f'<rect x="56" y="66" width="88" height="72" rx="10" fill="#3E4A55"/><rect x="64" y="74" width="72" height="56" rx="6" fill="{C["blue"]}"/><rect x="88" y="142" width="24" height="12" fill="#3E4A55"/><rect x="72" y="154" width="56" height="8" rx="4" fill="#3E4A55"/>'),
 "interior": ("#F2EEE6", f'<path d="M100 54 l34 44 h-68Z" fill="{C["yellow"]}"/><rect x="96" y="98" width="8" height="42" fill="{C["brown"]}"/><rect x="72" y="140" width="56" height="10" rx="5" fill="{C["brown"]}"/><circle cx="100" cy="76" r="8" fill="{C["white"]}" opacity=".7"/>'),
 # --- travel ---
 "stay": ("#E7F2E3", f'<rect x="44" y="104" width="112" height="40" rx="8" fill="{C["white"]}" stroke="{C["gray"]}" stroke-width="5"/><rect x="44" y="128" width="112" height="16" rx="8" fill="#DDE9F2"/><circle cx="70" cy="96" r="12" fill="{C["yellow"]}"/><rect x="88" y="88" width="66" height="18" rx="9" fill="{C["dgreen"]}"/>'),
 "voucher": ("#FFF3D0", f'<rect x="42" y="76" width="116" height="56" rx="10" fill="{C["orange"]}"/><circle cx="42" cy="104" r="10" fill="#FFF3D0"/><circle cx="158" cy="104" r="10" fill="#FFF3D0"/><path d="M118 76 v56" stroke="{C["cream"]}" stroke-width="5" stroke-dasharray="6 8"/><rect x="56" y="92" width="48" height="8" rx="4" fill="{C["cream"]}"/><rect x="56" y="108" width="34" height="8" rx="4" fill="{C["cream"]}"/>'),
 "meal": ("#FDE7E0", f'<circle cx="104" cy="108" r="44" fill="{C["white"]}" stroke="{C["gray"]}" stroke-width="5"/><circle cx="104" cy="108" r="26" fill="{C["cream"]}"/><path d="M46 70 v40 M40 70 v18 M52 70 v18 M46 110 v28" stroke="{C["ink"]}" stroke-width="5" stroke-linecap="round"/><path d="M162 70 q-10 22 0 34 v34" stroke="{C["ink"]}" stroke-width="5" fill="none" stroke-linecap="round"/>'),
 "leisure": ("#E3F0F7", f'<path d="M100 50 v96" stroke="{C["brown"]}" stroke-width="6" stroke-linecap="round"/><path d="M100 52 l52 14 -52 16Z" fill="{C["red"]}"/><path d="M64 150 q36 -14 72 0" stroke="{C["dgreen"]}" stroke-width="8" fill="none" stroke-linecap="round"/>'),
 "activity": ("#EAF4E6", f'<circle cx="100" cy="100" r="52" fill="none" stroke="{C["dgreen"]}" stroke-width="7"/><path d="M100 62 l11 24 26 3 -19 18 5 26 -23 -13 -23 13 5 -26 -19 -18 26 -3Z" fill="{C["yellow"]}" stroke="#D9A62A" stroke-width="3" stroke-linejoin="round"/>'),
}

for name, (bg, body) in ICONS.items():
    (MOCK / f"{name}.svg").write_text(svg(bg, body), encoding="utf-8")
print(f"wrote favicon.svg + {len(ICONS)} mock svgs -> {MOCK}")
