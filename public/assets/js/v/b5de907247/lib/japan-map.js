// @ts-check
// 日本地図(SVG)。当選県のハイライト・範囲プレビューに使用。
//
// 2026-09-11: 円を重ねたシルエットから【長方形・L字を組み合わせた都道府県別の簡略地図】へ変更。
// 円の集合では「どの県がどこか」「当選県がどのあたりか」が読み取りにくかったため。
//
// 仕組み: 各県を格子セルの集合として持ち、隣り合うセルの継ぎ目を打ち消して1本の輪郭パスに合成する。
//   ・同じ県の内部には線が出ない(長方形を2つ並べればL字・階段状の形になる)
//   ・県どうしは細い白線(CSS)で分かれる
// 正確な県境・海岸線ではなく、隣接関係と東西南北が伝わることだけを目的とした簡略表現。
// 県名は地図内に描かない(結果カードの見出しが自治体名を示すため)。

/** 格子1マスの描画単位。おおよそ2マスで「標準的な県1つ」ぶん。 */
const CELL = 10;
/** 図の外周に足す余白(枠線ぶん)。詰めて地図本体を大きく見せる。 */
const PAD = 2;

/**
 * 都道府県コード → 形を作る長方形 [x, y, w, h](格子座標。1 = 半セル)。
 * 長方形を複数並べるとL字・階段になる(例: 北海道の南西の出っ張り、新潟の段差)。
 *
 * 配置の考え方:
 *   ・北海道 → 津軽海峡(1マスの空き) → 東北 → 関東/中部 → 近畿 → 中国 →(瀬戸内海)→ 四国
 *   ・九州は左端、関門海峡ぶんの空きを挟んで中国地方の西
 *   ・沖縄は九州の左下へコンパクトに(枠や大きな余白は作らない)
 * @type {Record<string, [number, number, number, number][]>}
 */
export const PREF_SHAPES = {
  // --- 北海道(本体 + 南西へ渡島半島が伸びるL字。先端は津軽海峡を挟んで青森の西端に向く) ---
  "01": [[24, 0, 7, 5], [23, 3, 1, 3]],
  // --- 東北(2列。青森と福島は2マス幅で上下を締める) ---
  "02": [[23, 7, 4, 2]],   // 青森
  "05": [[23, 9, 2, 2]],   // 秋田
  "03": [[25, 9, 2, 2]],   // 岩手
  "06": [[23, 11, 2, 2]],  // 山形
  "04": [[25, 11, 2, 2]],  // 宮城
  "07": [[23, 13, 4, 2]],  // 福島
  // --- 中部(北陸・甲信・東海) ---
  "15": [[19, 13, 4, 2], [21, 12, 2, 1]], // 新潟(山形の西へ一段上がる)
  "16": [[17, 13, 2, 2]],  // 富山
  "17": [[15, 12, 2, 3]],  // 石川(能登ぶん上へ長い)
  "18": [[13, 15, 4, 2]],  // 福井(東西に長い)
  "20": [[19, 15, 2, 7]],  // 長野(南北に長い)
  "21": [[17, 15, 2, 4]],  // 岐阜
  "19": [[21, 19, 2, 2]],  // 山梨
  "23": [[17, 19, 2, 4]],  // 愛知
  "22": [[19, 22, 3, 2]],  // 静岡(東西に長い)
  // --- 関東 ---
  "10": [[21, 15, 2, 2]],  // 群馬
  "09": [[23, 15, 2, 2]],  // 栃木
  "08": [[25, 15, 2, 3]],  // 茨城
  "11": [[21, 17, 4, 2]],  // 埼玉(東西に長い)
  "13": [[23, 19, 2, 2]],  // 東京
  "12": [[25, 18, 2, 4]],  // 千葉(南北に長い)
  "14": [[21, 21, 4, 1]],  // 神奈川
  // --- 近畿 ---
  "28": [[11, 17, 2, 4]],  // 兵庫(南北に長い)
  "26": [[13, 17, 2, 2]],  // 京都
  "25": [[15, 17, 2, 2]],  // 滋賀
  "27": [[13, 19, 1, 3]],  // 大阪(細い)
  "29": [[14, 19, 1, 3]],  // 奈良(細い)
  "24": [[15, 19, 2, 4]],  // 三重(南北に長い)
  "30": [[13, 22, 2, 2]],  // 和歌山
  // --- 中国 ---
  "35": [[5, 17, 2, 3]],   // 山口
  "32": [[7, 17, 2, 1]],   // 島根(日本海側の細長い県)
  "34": [[7, 18, 2, 2]],   // 広島
  "31": [[9, 17, 2, 1]],   // 鳥取(日本海側の細長い県)
  "33": [[9, 18, 2, 2]],   // 岡山
  // --- 四国(瀬戸内海ぶん1マス空ける) ---
  "38": [[7, 21, 2, 2]],   // 愛媛
  "37": [[9, 21, 2, 1]],   // 香川
  "36": [[9, 22, 2, 1]],   // 徳島
  "39": [[7, 23, 4, 1]],   // 高知(南岸に沿って東西に長い)
  // --- 九州(関門海峡ぶん1マス空けて中国地方の西) ---
  "41": [[0, 17, 2, 1]],   // 佐賀
  "40": [[2, 17, 2, 2]],   // 福岡
  "42": [[0, 18, 2, 2]],   // 長崎
  "44": [[2, 19, 2, 2]],   // 大分
  "43": [[0, 20, 2, 2]],   // 熊本
  "45": [[2, 21, 2, 2]],   // 宮崎
  "46": [[0, 22, 2, 3]],   // 鹿児島(南へ長い)
  // --- 沖縄(九州の左下。離れすぎない位置に1県ぶん) ---
  "47": [[0, 26, 2, 2]]
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** 長方形の並び → 格子セルの一覧 @param {[number,number,number,number][]} rects */
function toCells(rects) {
  /** @type {[number, number][]} */
  const cells = [];
  for (const [x, y, w, h] of rects) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) cells.push([x + i, y + j]);
  }
  return cells;
}

/* 進行方向(SVG座標なのでyは下向き)。時計回りで外周をたどる。 */
const DIRS = /** @type {[number, number][]} */ ([[1, 0], [0, 1], [-1, 0], [0, -1]]);
/** @param {number} dx @param {number} dy */
const dirIndex = (dx, dy) => DIRS.findIndex((d) => d[0] === dx && d[1] === dy);

/**
 * 格子セルの集合 → 外周パス(内部の継ぎ目を消す)。
 * 各セルを時計回りの4辺に分解し、逆向きの辺どうしを打ち消すと外周だけが残る。
 * 残った辺を端点でつなぎ、直線上の点を間引いてパス文字列にする。
 * @param {[number, number][]} cells
 * @returns {string}
 */
export function cellsToPath(cells) {
  /** @type {Map<string, [number, number, number, number]>} 有向辺 "x1,y1|x2,y2" */
  const edges = new Map();
  const id = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ c, /** @type {number} */ d) => `${a},${b}|${c},${d}`;
  const add = (/** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2) => {
    const rev = id(x2, y2, x1, y1);
    if (edges.has(rev)) edges.delete(rev); // 内部の継ぎ目 → 相殺
    else edges.set(id(x1, y1, x2, y2), [x1, y1, x2, y2]);
  };
  for (const [x, y] of cells) {
    add(x, y, x + 1, y);
    add(x + 1, y, x + 1, y + 1);
    add(x + 1, y + 1, x, y + 1);
    add(x, y + 1, x, y);
  }

  /** 始点 → その点から出る辺 @type {Map<string, [number,number,number,number][]>} */
  const outgoing = new Map();
  for (const e of edges.values()) {
    const k = `${e[0]},${e[1]}`;
    const list = outgoing.get(k);
    if (list) list.push(e); else outgoing.set(k, [e]);
  }

  const used = new Set();
  /** @type {string[]} */
  const parts = [];
  for (const start of edges.values()) {
    if (used.has(id(...start))) continue;
    /** @type {[number, number][]} */
    const pts = [[start[0], start[1]]];
    let cur = start;
    for (let guard = 0; guard < 10000; guard++) {
      used.add(id(...cur));
      pts.push([cur[2], cur[3]]);
      if (cur[2] === start[0] && cur[3] === start[1]) break; // 閉じた
      const cands = (outgoing.get(`${cur[2]},${cur[3]}`) ?? []).filter((e) => !used.has(id(...e)));
      if (cands.length === 0) break;
      // 1点に複数の辺が集まる場合(対角に接するセル)は、時計回りを保つため右折を優先する
      const from = dirIndex(cur[2] - cur[0], cur[3] - cur[1]);
      const rank = (/** @type {[number,number,number,number]} */ e) =>
        (dirIndex(e[2] - e[0], e[3] - e[1]) - from + 4) % 4; // 0=直進,1=右折,3=左折
      const next = cands.slice().sort((a, b) => order(rank(a)) - order(rank(b)))[0];
      if (!next) break;
      cur = next;
    }
    parts.push(toPathData(simplify(pts)));
  }
  return parts.join(" ");
}

/** 右折(1) → 直進(0) → 左折(3) → 逆走(2) の優先順 @param {number} turn */
function order(turn) {
  return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
}

/** 直線上に並んだ点を間引く @param {[number, number][]} pts */
function simplify(pts) {
  /** @type {[number, number][]} */
  const out = [];
  for (const p of pts) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a && b && (a[0] === b[0]) === (b[0] === p[0]) && (a[1] === b[1]) === (b[1] === p[1])) out.pop();
    out.push(p);
  }
  if (out.length > 1) {
    const first = out[0], last = out[out.length - 1];
    if (first && last && first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

/** @param {[number, number][]} pts */
function toPathData(pts) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0] * CELL} ${p[1] * CELL}`).join(" ") + " Z";
}

/** 都道府県コード → 輪郭パス(前計算) */
const PREF_PATHS = Object.fromEntries(
  Object.entries(PREF_SHAPES).map(([code, rects]) => [code, cellsToPath(toCells(rects))])
);

/** viewBox(全県が収まる範囲を前計算。余白は最小限) */
const BOX = (() => {
  const rects = Object.values(PREF_SHAPES).flat();
  const x0 = Math.min(...rects.map((r) => r[0])) * CELL - PAD;
  const y0 = Math.min(...rects.map((r) => r[1])) * CELL - PAD;
  const x1 = Math.max(...rects.map((r) => r[0] + r[2])) * CELL + PAD;
  const y1 = Math.max(...rects.map((r) => r[1] + r[3])) * CELL + PAD;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`);
  svg.setAttribute("class", "jmap");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", active.size > 0 ? "日本地図(対象の都道府県をハイライト)" : "日本地図");

  const base = document.createElementNS(SVG_NS, "g");
  base.setAttribute("class", "jmap__base");
  // 対象県は最前面へ。隣県の区切り線に縁を削られず、小さい県でもはっきり見えるようにする。
  const top = document.createElementNS(SVG_NS, "g");
  top.setAttribute("class", "jmap__top");

  for (const [code, d] of Object.entries(PREF_PATHS)) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    const on = active.has(code);
    path.setAttribute("class", on ? "jmap__pref is-active" : "jmap__pref");
    path.setAttribute("data-code", code);
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = names[code] ?? code;
    path.appendChild(title);
    (on ? top : base).appendChild(path);
  }
  svg.appendChild(base);
  svg.appendChild(top);
  container.replaceChildren(svg);
}
