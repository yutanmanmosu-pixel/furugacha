// @ts-check
// 日本地図(SVG)。当選県のハイライト・範囲プレビューに使用。
// 2026-09-08: 均等なタイルグリッドから「実際の緯度経度に基づく配置」へ変更し、
// 日本列島のシルエットに寄せた。地方(9区分)ごとにグループ化し、当選地方を淡く色づける。
// 正確な県境ではなく、面積に応じた大きさの円を重ねた簡易表現(軽量・保守しやすい)。

import { REGIONS, PREFECTURES } from "./regions.js";

/**
 * 都道府県コード → 島の形をなす円の並び [緯度, 経度, 大きさ]。
 * 大きさは面積の目安(1.0 ≒ 標準的な県)。大きい/細長い県は複数の円で形を作る。
 * @type {Record<string, [number, number, number][]>}
 */
export const PREF_GEO = {
  "01": [[44.6, 142.6, 1.5], [43.8, 142.3, 1.7], [43.1, 141.8, 1.5], [43.4, 143.8, 1.5], [42.5, 141.0, 1.2], [42.9, 143.4, 1.2]],
  "02": [[40.9, 140.6, 1.1], [40.6, 141.3, 0.9]],
  "03": [[39.8, 141.3, 1.2], [39.2, 141.4, 1.0]],
  "04": [[38.5, 140.9, 1.0], [38.1, 140.9, 0.9]],
  "05": [[39.9, 140.3, 1.1], [39.3, 140.4, 0.9]],
  "06": [[38.6, 140.2, 0.9], [38.1, 140.1, 0.9]],
  "07": [[37.5, 140.3, 1.2], [37.3, 139.6, 1.0]],
  "08": [[36.3, 140.4, 1.0]],
  "09": [[36.7, 139.8, 1.0]],
  "10": [[36.5, 138.95, 1.0]],
  "11": [[35.95, 139.4, 0.85]],
  "12": [[35.5, 140.25, 0.95]],
  "13": [[35.7, 139.5, 0.7]],
  "14": [[35.4, 139.3, 0.8]],
  "15": [[37.9, 139.3, 1.1], [37.3, 138.7, 1.1]],
  "16": [[36.65, 137.2, 0.85]],
  "17": [[36.8, 136.8, 0.8], [36.3, 136.5, 0.7]],
  "18": [[35.9, 136.2, 0.85]],
  "19": [[35.6, 138.6, 0.85]],
  "20": [[36.5, 138.2, 1.1], [35.8, 137.9, 1.0]],
  "21": [[35.9, 137.1, 1.0], [35.5, 136.8, 0.9]],
  "22": [[35.0, 138.4, 1.0], [34.8, 137.9, 0.9]],
  "23": [[35.1, 137.1, 0.9], [34.8, 136.9, 0.8]],
  "24": [[34.8, 136.4, 0.9], [34.2, 136.2, 0.8]],
  "25": [[35.15, 136.1, 0.85]],
  "26": [[35.3, 135.5, 0.9], [35.0, 135.7, 0.8]],
  "27": [[34.6, 135.5, 0.7]],
  "28": [[35.1, 134.8, 1.0], [34.7, 135.0, 0.85]],
  "29": [[34.4, 135.9, 0.8]],
  "30": [[33.95, 135.5, 0.9]],
  "31": [[35.4, 134.0, 0.85]],
  "32": [[35.2, 132.9, 0.9], [34.8, 132.3, 0.8]],
  "33": [[34.85, 133.85, 1.0]],
  "34": [[34.6, 132.8, 1.0]],
  "35": [[34.3, 131.7, 0.9], [34.1, 131.2, 0.8]],
  "36": [[33.7, 134.4, 0.8]],
  "37": [[33.9, 133.95, 0.6]],
  "38": [[33.5, 132.85, 0.85]],
  "39": [[33.3, 133.5, 0.85], [33.25, 132.95, 0.7]],
  "40": [[33.6, 130.7, 0.95]],
  "41": [[33.3, 130.15, 0.7]],
  "42": [[32.9, 129.85, 0.9]],
  "43": [[32.7, 130.8, 1.0]],
  "44": [[33.2, 131.5, 0.95]],
  "45": [[32.1, 131.3, 1.0]],
  "46": [[31.6, 130.6, 1.0], [31.1, 130.5, 0.8]],
  "47": [[26.4, 127.9, 0.9]]
};

/** 沖縄は本土から遠いため、地図の左下へ寄せて描く(一般的な日本地図の表現に合わせる) */
const OKINAWA_OFFSET = { code: "47", dx: -42, dy: -78 };

// --- 投影(簡易正距円筒図法): 経度は緯度38度あたりの縮みを掛けて横に潰す ---
const DEG = 11.0;                 // 緯度1度あたりの描画単位
const LON_SCALE = 0.79;          // cos(38°) ≒ 0.79
const LON0 = 128.6;
const LAT0 = 45.6;
const PAD = 8;
const COAST = 1.8;               // 海岸線ぶんの膨らみ(全ブロブの下に一回り大きい層を敷く)
const px = (/** @type {number} */ lon) => (lon - LON0) * DEG * LON_SCALE;
const py = (/** @type {number} */ lat) => (LAT0 - lat) * DEG;

const SVG_NS = "http://www.w3.org/2000/svg";

/** 都道府県コード → 地方名(regions.js を唯一の定義元として再利用) */
const REGION_BY_CODE = Object.fromEntries(PREFECTURES.map((p) => [p.code, p.region]));
/** 地方名 → CSSで使えるslug(regions.js の定義をそのまま使う) */
const REGION_SLUG = Object.fromEntries(REGIONS.map((r) => [r.name, r.slug]));

/** 描画用に前計算した円(コード順・地方ごとにまとめる) */
const BLOBS = (() => {
  /** @type {{code:string, region:string, cx:number, cy:number, r:number}[]} */
  const out = [];
  for (const [code, shape] of Object.entries(PREF_GEO)) {
    const off = OKINAWA_OFFSET.code === code ? OKINAWA_OFFSET : { dx: 0, dy: 0 };
    for (const [lat, lon, size] of shape) {
      out.push({
        code,
        region: REGION_BY_CODE[code] ?? "",
        cx: px(lon) + off.dx,
        cy: py(lat) + off.dy,
        r: size * 4.6
      });
    }
  }
  return out;
})();

/** viewBox(全ブロブが収まる範囲を前計算) */
const BOX = (() => {
  const xs = BLOBS.flatMap((b) => [b.cx - b.r, b.cx + b.r]);
  const ys = BLOBS.flatMap((b) => [b.cy - b.r, b.cy + b.r]);
  const minX = Math.min(...xs) - PAD, minY = Math.min(...ys) - PAD;
  return { minX, minY, w: Math.max(...xs) + PAD - minX, h: Math.max(...ys) + PAD - minY };
})();

/**
 * 日本地図を描画する。
 * @param {HTMLElement} container 出力先(中身は置き換え)
 * @param {{activeCodes?: Set<string>, prefNames?: Record<string,string>}} [opts]
 *   activeCodes: ハイライトする都道府県コード(2桁)の集合
 */
export function renderTileMap(container, opts = {}) {
  const active = opts.activeCodes ?? new Set();
  const names = opts.prefNames ?? {};
  // 当選県が属する地方(複数可)。地方単位の淡い色づけに使う。
  const activeRegions = new Set([...active].map((c) => REGION_BY_CODE[c]).filter(Boolean));

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${round(BOX.minX)} ${round(BOX.minY)} ${round(BOX.w)} ${round(BOX.h)}`);
  svg.setAttribute("class", "jmap");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", active.size > 0 ? "日本地図(対象の都道府県をハイライト)" : "日本地図");

  // 沖縄は本土と離れた位置に描くため、別枠であることが分かる枠線を添える
  const oki = BLOBS.filter((b) => b.code === OKINAWA_OFFSET.code);
  if (oki.length > 0) {
    const x0 = Math.min(...oki.map((b) => b.cx - b.r)) - 5;
    const y0 = Math.min(...oki.map((b) => b.cy - b.r)) - 5;
    const frame = document.createElementNS(SVG_NS, "rect");
    frame.setAttribute("x", round(x0));
    frame.setAttribute("y", round(y0));
    frame.setAttribute("width", round(Math.max(...oki.map((b) => b.cx + b.r)) + 5 - x0));
    frame.setAttribute("height", round(Math.max(...oki.map((b) => b.cy + b.r)) + 5 - y0));
    frame.setAttribute("rx", "5");
    frame.setAttribute("class", "jmap__inset");
    svg.appendChild(frame);
  }

  // 海岸線: 全ブロブを一回り大きく敷き、地方色の下から一本の輪郭として見せる
  const coast = document.createElementNS(SVG_NS, "g");
  coast.setAttribute("class", "jmap__coast");
  for (const b of BLOBS) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", round(b.cx));
    c.setAttribute("cy", round(b.cy));
    c.setAttribute("r", round(b.r + COAST));
    coast.appendChild(c);
  }
  svg.appendChild(coast);

  /** @param {typeof BLOBS[number]} b */
  const circle = (b) => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", round(b.cx));
    c.setAttribute("cy", round(b.cy));
    c.setAttribute("r", round(b.r));
    c.setAttribute("class", "jmap__pref");
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = names[b.code] ?? b.code;
    c.appendChild(title);
    return c;
  };

  // 地方ごとのグループ。対象県は最前面のレイヤーへ回し、隣県に隠されないようにする。
  /** @type {Map<string, SVGGElement>} */
  const groups = new Map();
  const top = document.createElementNS(SVG_NS, "g");
  top.setAttribute("class", "jmap__top");
  for (const b of BLOBS) {
    if (active.has(b.code)) { top.appendChild(circle(b)); continue; }
    let g = groups.get(b.region);
    if (!g) {
      g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", `jmap__region jmap__region--${REGION_SLUG[b.region] ?? "other"}` +
        (activeRegions.has(b.region) ? " is-active" : ""));
      groups.set(b.region, g);
      svg.appendChild(g);
    }
    g.appendChild(circle(b));
  }
  svg.appendChild(top);
  container.replaceChildren(svg);
}

/** @param {number} n */
function round(n) {
  return String(Math.round(n * 10) / 10);
}
