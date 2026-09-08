// @ts-check
// 47都道府県タイルグリッドマップ(SVG)。当選県のハイライト・範囲プレビューに使用。
// 正確な地形ではなく、軽量で分かりやすい「タイル型日本地図」。

/** 都道府県コード → [x, y] グリッド座標 @type {Record<string, [number, number]>} */
export const TILE_POS = {
  "01": [13, 0], "02": [13, 1], "03": [13, 2], "04": [13, 3], "05": [12, 2],
  "06": [12, 3], "07": [12, 4], "08": [13, 5], "09": [12, 5], "10": [11, 5],
  "11": [12, 6], "12": [13, 6], "13": [12, 7], "14": [12, 8], "15": [11, 4],
  "16": [9, 4], "17": [8, 4], "18": [8, 5], "19": [11, 6], "20": [10, 5],
  "21": [9, 5], "22": [10, 7], "23": [9, 6], "24": [9, 7], "25": [8, 6],
  "26": [7, 6], "27": [7, 7], "28": [6, 6], "29": [8, 7], "30": [7, 8],
  "31": [5, 6], "32": [4, 6], "33": [5, 7], "34": [4, 7], "35": [3, 7],
  "36": [6, 8], "37": [5, 8], "38": [4, 8], "39": [5, 9], "40": [2, 8],
  "41": [1, 8], "42": [0, 8], "43": [2, 9], "44": [3, 8], "45": [3, 9],
  "46": [2, 10], "47": [0, 11]
};

const CELL = 30;
const GAP = 4;
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * タイルマップを描画する。
 * @param {HTMLElement} container 出力先(中身は置き換え)
 * @param {{activeCodes?: Set<string>, prefNames?: Record<string,string>}} [opts]
 *   activeCodes: ハイライトする都道府県コード(2桁)の集合
 */
export function renderTileMap(container, opts = {}) {
  const active = opts.activeCodes ?? new Set();
  const names = opts.prefNames ?? {};
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${14 * (CELL + GAP)} ${12 * (CELL + GAP)}`);
  svg.setAttribute("class", "tilemap");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", active.size > 0 ? "日本地図(対象の都道府県をハイライト)" : "日本地図");
  for (const [code, pos] of Object.entries(TILE_POS)) {
    const [x, y] = pos;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x * (CELL + GAP)));
    rect.setAttribute("y", String(y * (CELL + GAP)));
    rect.setAttribute("width", String(CELL));
    rect.setAttribute("height", String(CELL));
    rect.setAttribute("rx", "7");
    rect.setAttribute("class", active.has(code) ? "tilemap__cell tilemap__cell--active" : "tilemap__cell");
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = names[code] ?? code;
    rect.appendChild(title);
    svg.appendChild(rect);
  }
  container.replaceChildren(svg);
}
