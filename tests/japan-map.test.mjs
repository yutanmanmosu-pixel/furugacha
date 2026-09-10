// @ts-check
// 日本地図(2026-09-11 改訂: 長方形・L字を組み合わせた都道府県別の簡略地図)のデータ・描画テスト。
//
// 検証の意図は改訂前と同じ:
//   ・47都道府県が過不足なく、識別できる図形として存在する
//   ・東西南北・隣接関係が実際の日本と大きく食い違わない
//   ・ハイライト(全国 / 地方 / 都道府県 / 当選)が正しく反映される
// 円の座標ではなく、格子上のセル集合と合成された輪郭パスを対象に確認する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { PREF_SHAPES, cellsToPath, renderTileMap } from "../public/assets/js/lib/japan-map.js";
import { PREFECTURES } from "../public/assets/js/lib/regions.js";

/** 最小限のDOMスタブ(renderTileMapが使うAPIだけ実装する) */
function stubDom() {
  const el = (/** @type {string} */ tag) => ({
    tag, attrs: /** @type {Record<string,string>} */ ({}), children: /** @type {any[]} */ ([]), textContent: "",
    setAttribute(/** @type {string} */ k, /** @type {string} */ v) { this.attrs[k] = v; },
    getAttribute(/** @type {string} */ k) { return this.attrs[k]; },
    appendChild(/** @type {any} */ c) { this.children.push(c); return c; }
  });
  return { createElementNS: (/** @type {string} */ _ns, /** @type {string} */ tag) => el(tag) };
}

/** ツリーを平坦化 @param {any} node @returns {any[]} */
function walk(node) {
  return [node, ...node.children.flatMap(walk)];
}

/** @param {{activeCodes?:Set<string>}} [opts] */
function render(opts = {}) {
  const g = /** @type {any} */ (globalThis);
  const orig = g.document;
  g.document = stubDom();
  try {
    const container = { children: /** @type {any[]} */ ([]), replaceChildren(/** @type {any[]} */ ...n) { this.children = n; } };
    const names = Object.fromEntries(PREFECTURES.map((p) => [p.code, p.name]));
    renderTileMap(/** @type {any} */ (container), { ...opts, prefNames: names });
    const svg = container.children[0];
    return { svg, nodes: walk(svg) };
  } finally {
    if (orig === undefined) delete g.document; else g.document = orig;
  }
}

/** @param {any[]} nodes @param {string} cls */
const byClass = (nodes, cls) => nodes.filter((n) => (n.attrs.class ?? "").split(" ").includes(cls));

/** 県の占有セル @param {string} code @returns {Set<string>} */
function cellsOf(code) {
  const out = new Set();
  for (const [x, y, w, h] of PREF_SHAPES[code] ?? []) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.add(`${x + i},${y + j}`);
  }
  return out;
}
/** 2県が辺で接しているか @param {string} a @param {string} b */
function adjacent(a, b) {
  const B = cellsOf(b);
  for (const k of cellsOf(a)) {
    const [x, y] = k.split(",").map(Number);
    if (B.has(`${x + 1},${y}`) || B.has(`${x - 1},${y}`) || B.has(`${x},${y + 1}`) || B.has(`${x},${y - 1}`)) return true;
  }
  return false;
}
/** 県の重心(東西南北の比較用) @param {string} code */
function center(code) {
  const cells = [...cellsOf(code)].map((k) => k.split(",").map(Number));
  const n = cells.length;
  return {
    x: cells.reduce((s, c) => s + (c[0] ?? 0), 0) / n,
    y: cells.reduce((s, c) => s + (c[1] ?? 0), 0) / n
  };
}

/* ---------------- データ ---------------- */

test("地図データ: 47都道府県すべてに図形があり、セットが一致する", () => {
  const codes = PREFECTURES.map((p) => p.code);
  assert.deepEqual(Object.keys(PREF_SHAPES).sort(), codes.slice().sort(), "都道府県コードの過不足がある");
  for (const [code, rects] of Object.entries(PREF_SHAPES)) {
    assert.ok(Array.isArray(rects) && rects.length >= 1, `形状が空: ${code}`);
    for (const [x, y, w, h] of rects) {
      assert.ok(Number.isInteger(x) && Number.isInteger(y), `格子座標が整数でない: ${code}`);
      assert.ok(w >= 1 && h >= 1, `大きさが不正: ${code} ${w}x${h}`);
    }
    assert.ok(cellsOf(code).size >= 2, `図形が小さすぎて識別できない: ${code}`);
  }
});

test("地図データ: 県どうしが重ならない(1つのセルを2県が使わない)", () => {
  /** @type {Map<string, string>} */
  const owner = new Map();
  for (const code of Object.keys(PREF_SHAPES)) {
    for (const k of cellsOf(code)) {
      const prev = owner.get(k);
      assert.equal(prev, undefined, `セル ${k} を ${prev} と ${code} が重複して使っている`);
      owner.set(k, code);
    }
  }
  assert.ok(owner.size >= 47 * 2, `全体のセル数が少なすぎる: ${owner.size}`);
});

test("地図データ: 南北・東西の位置関係が実際の日本と整合する", () => {
  const c = center;
  assert.ok(c("01").y < c("02").y && c("02").y < c("13").y, "北海道→青森→東京の順で南下していない");
  assert.ok(c("13").y < c("46").y && c("46").y < c("47").y, "東京→鹿児島→沖縄の順で南下していない");
  assert.ok(c("42").x < c("13").x && c("13").x < c("01").x, "長崎→東京→北海道の順で東進していない");
  assert.ok(c("39").y > c("33").y, "四国(高知)が中国地方(岡山)より南にない");
  assert.ok(c("47").x < c("46").x + 2 && c("47").y > c("46").y, "沖縄が九州の左下付近にない");
  assert.ok(c("27").x < c("13").x, "大阪が東京より西にない");
});

test("地図データ: 主要な隣接関係が保たれている", () => {
  const shouldTouch = [
    ["02", "03"], ["02", "05"], ["03", "04"], ["05", "06"], ["04", "07"],
    ["07", "15"], ["15", "16"], ["16", "17"], ["17", "18"], ["18", "25"],
    ["25", "21"], ["21", "23"], ["23", "22"], ["22", "14"], ["20", "19"],
    ["11", "13"], ["13", "12"], ["10", "11"], ["09", "08"],
    ["28", "26"], ["26", "27"], ["27", "29"], ["29", "24"], ["24", "30"],
    ["28", "33"], ["33", "34"], ["34", "35"], ["32", "34"], ["31", "33"],
    ["38", "37"], ["37", "36"], ["39", "38"], ["40", "41"], ["41", "42"],
    ["40", "44"], ["43", "45"], ["45", "46"], ["43", "46"]
  ];
  for (const [a, b] of shouldTouch) {
    assert.ok(adjacent(a, b), `隣接しているはずの ${a} と ${b} が接していない`);
  }
  // 海で隔てられている組は接しない(海峡が潰れて陸続きに見えないこと)
  const shouldNotTouch = [["01", "02"], ["35", "40"], ["33", "37"], ["46", "47"], ["34", "38"]];
  for (const [a, b] of shouldNotTouch) {
    assert.ok(!adjacent(a, b), `海で隔てるべき ${a} と ${b} が接している`);
  }
});

test("輪郭合成: 長方形をつなぐと内部に継ぎ目のない1本のパスになる", () => {
  // 2x1 の長方形2つを縦に並べる → 2x2 の正方形1つ(点は4つ)
  const square = cellsToPath([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal((square.match(/M/g) ?? []).length, 1, "ループが1本でない");
  assert.equal((square.match(/[ML]/g) ?? []).length, 4, `正方形が4点にならない: ${square}`);

  // L字(3セル) → 6点
  const ell = cellsToPath([[0, 0], [0, 1], [1, 1]]);
  assert.equal((ell.match(/[ML]/g) ?? []).length, 6, `L字が6点にならない: ${ell}`);

  // 実データもすべて1ループ・妥当な点数(飛び地や自己交差がない)
  for (const code of Object.keys(PREF_SHAPES)) {
    const d = cellsToPath([...cellsOf(code)].map((k) => /** @type {[number,number]} */([...k.split(",").map(Number)])));
    const loops = (d.match(/M/g) ?? []).length;
    const pts = (d.match(/[ML]/g) ?? []).length;
    assert.equal(loops, 1, `${code}: 図形が分断されている(ループ${loops}本)`);
    assert.ok(pts >= 4 && pts % 2 === 0, `${code}: 直角多角形になっていない(${pts}点)`);
  }
});

/* ---------------- 描画 ---------------- */

test("描画: 47県ぶんのパスが出力され、県名は図中に描かない", () => {
  const { svg, nodes } = render();
  assert.equal(svg.tag, "svg");
  assert.equal(svg.attrs.class, "jmap");
  assert.equal(svg.attrs.role, "img");
  assert.ok(/^-?\d+ -?\d+ \d+ \d+$/.test(svg.attrs.viewBox), `viewBoxが不正: ${svg.attrs.viewBox}`);

  const prefs = byClass(nodes, "jmap__pref");
  assert.equal(prefs.length, 47, `県の図形が47個でない: ${prefs.length}`);
  assert.deepEqual(prefs.map((p) => p.attrs["data-code"]).sort(), PREFECTURES.map((p) => p.code).sort());
  assert.ok(prefs.every((p) => p.tag === "path" && /^M[-\d. LMZ]+Z$/.test(p.attrs.d)), "パスでない図形がある");
  // 県名は <title>(ホバー時の補足)だけで、描画テキストは持たない
  assert.equal(nodes.filter((n) => n.tag === "text").length, 0, "県名が地図内に描かれている");
  assert.ok(prefs.every((p) => p.children.some((/** @type {any} */ c) => c.tag === "title" && c.textContent)), "titleが無い県がある");
  // 非選択時は強調なし
  assert.equal(nodes.filter((n) => (n.attrs.class ?? "").includes("is-active")).length, 0);
});

test("描画: 余白は最小限で、地図本体が表示領域を使う", () => {
  const { svg } = render();
  const [x, y, w, h] = svg.attrs.viewBox.split(" ").map(Number);
  const rects = Object.values(PREF_SHAPES).flat();
  const minX = Math.min(...rects.map((r) => r[0])) * 10;
  const maxX = Math.max(...rects.map((r) => r[0] + r[2])) * 10;
  const minY = Math.min(...rects.map((r) => r[1])) * 10;
  const maxY = Math.max(...rects.map((r) => r[1] + r[3])) * 10;
  assert.ok(minX - x <= 4 && maxX - (x + w) >= -4, `左右の余白が広すぎる: viewBox=${svg.attrs.viewBox}`);
  assert.ok(minY - y <= 4 && maxY - (y + h) >= -4, `上下の余白が広すぎる: viewBox=${svg.attrs.viewBox}`);
  // 極端に縦長・横長でない(結果カードの脇に収まる形)
  assert.ok(w / h > 0.7 && w / h < 1.6, `縦横比が極端: ${w}x${h}`);
});

test("描画(抽選結果): 当選県だけが強調され、最前面レイヤーに載る", () => {
  const { nodes } = render({ activeCodes: new Set(["43"]) }); // 熊本県
  const top = byClass(nodes, "jmap__top");
  assert.equal(top.length, 1);
  assert.equal(top[0].children.length, 1, "最前面レイヤーは当選県だけにする");
  assert.equal(top[0].children[0].attrs["data-code"], "43");
  assert.equal(top[0].children[0].children[0].textContent, "熊本県");
  const actives = byClass(nodes, "jmap__pref").filter((p) => p.attrs.class.includes("is-active"));
  assert.equal(actives.length, 1, "強調される県は1つだけ");
});

test("描画(範囲プレビュー): 全国は全県、地方はその地方、都道府県はその県だけが強調される", () => {
  const all = new Set(PREFECTURES.map((p) => p.code));
  const whole = render({ activeCodes: all });
  assert.equal(byClass(whole.nodes, "jmap__pref").filter((p) => p.attrs.class.includes("is-active")).length, 47,
    "全国選択で全県が対象になっていない");

  const shikoku = PREFECTURES.filter((p) => p.region === "四国").map((p) => p.code);
  const region = render({ activeCodes: new Set(shikoku) });
  const on = byClass(region.nodes, "jmap__pref").filter((p) => p.attrs.class.includes("is-active"));
  assert.deepEqual(on.map((p) => p.attrs["data-code"]).sort(), shikoku.slice().sort(), "地方選択の強調が一致しない");

  const one = render({ activeCodes: new Set(["13"]) });
  const onOne = byClass(one.nodes, "jmap__pref").filter((p) => p.attrs.class.includes("is-active"));
  assert.equal(onOne.length, 1);
  assert.equal(onOne[0].attrs["data-code"], "13");
});
