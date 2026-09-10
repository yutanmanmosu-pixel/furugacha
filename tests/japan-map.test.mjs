// @ts-check
// 日本地図(2026-09-08 改訂: 緯度経度ベースの簡易シルエット + 地方色分け)のデータ・描画テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { PREF_GEO, renderTileMap } from "../public/assets/js/lib/japan-map.js";
import { PREFECTURES, REGIONS } from "../public/assets/js/lib/regions.js";

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

test("地図データ: 47都道府県すべてに座標があり、日本の緯度経度の範囲に収まる", () => {
  const codes = PREFECTURES.map((p) => p.code);
  assert.deepEqual(Object.keys(PREF_GEO).sort(), codes.slice().sort(), "都道府県コードの過不足がある");
  for (const [code, shape] of Object.entries(PREF_GEO)) {
    assert.ok(Array.isArray(shape) && shape.length >= 1, `形状が空: ${code}`);
    for (const [lat, lon, size] of shape) {
      assert.ok(lat >= 24 && lat <= 46, `緯度が日本の範囲外: ${code} ${lat}`);
      assert.ok(lon >= 122 && lon <= 146, `経度が日本の範囲外: ${code} ${lon}`);
      assert.ok(size > 0 && size <= 2, `大きさが不正: ${code} ${size}`);
    }
  }
});

test("地図データ: 南北・東西の位置関係が実際の日本と整合する", () => {
  /** @param {string} code */
  const lat = (code) => PREF_GEO[code]?.[0]?.[0] ?? 0;
  /** @param {string} code */
  const lon = (code) => PREF_GEO[code]?.[0]?.[1] ?? 0;
  assert.ok(lat("01") > lat("02") && lat("02") > lat("13"), "北海道→青森→東京の順で南下していない");
  assert.ok(lat("13") > lat("46") && lat("46") > lat("47"), "東京→鹿児島→沖縄の順で南下していない");
  assert.ok(lon("42") < lon("13") && lon("13") < lon("01"), "長崎→東京→北海道の順で東進していない");
  assert.ok(lat("39") < lat("33"), "四国(高知)が中国地方(岡山)より南にない");
});

test("描画: 地方ごとにグループ化され、海岸線と沖縄インセットを持つ", () => {
  const { svg, nodes } = render();
  assert.equal(svg.tag, "svg");
  assert.equal(svg.attrs.class, "jmap");
  assert.equal(svg.attrs.role, "img");
  assert.ok(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(svg.attrs.viewBox), `viewBoxが不正: ${svg.attrs.viewBox}`);
  assert.equal(byClass(nodes, "jmap__region").length, REGIONS.length, "地方グループが9つでない");
  assert.equal(byClass(nodes, "jmap__coast").length, 1, "海岸線レイヤーがない");
  assert.equal(byClass(nodes, "jmap__inset").length, 1, "沖縄インセットの枠がない");
  // 非選択時は強調なし
  assert.equal(nodes.filter((n) => (n.attrs.class ?? "").includes("is-active")).length, 0);
  const prefs = byClass(nodes, "jmap__pref");
  assert.ok(prefs.length >= 47, `県ブロブが少なすぎる: ${prefs.length}`);
  assert.ok(prefs.every((p) => p.children.some((/** @type {any} */ c) => c.tag === "title" && c.textContent)), "titleが無いブロブがある");
});

test("描画: 当選県は最前面レイヤーへ、その地方グループだけが強調される", () => {
  const { nodes } = render({ activeCodes: new Set(["43"]) });  // 熊本県 → 九州
  const top = byClass(nodes, "jmap__top");
  assert.equal(top.length, 1);
  assert.equal(top[0].children.length, PREF_GEO["43"]?.length, "当選県が最前面レイヤーに載っていない");
  assert.equal(top[0].children[0].children[0].textContent, "熊本県");

  const activeRegions = byClass(nodes, "jmap__region").filter((g) => g.attrs.class.includes("is-active"));
  assert.equal(activeRegions.length, 1, "強調される地方は1つだけ");
  assert.ok(activeRegions[0].attrs.class.includes("jmap__region--kyushu"), activeRegions[0].attrs.class);
  // 当選県は自分の地方グループには残さない(重ね順で隠れないようにするため)
  assert.ok(!activeRegions[0].children.some((/** @type {any} */ c) => c.children[0]?.textContent === "熊本県"));
});

test("描画: 範囲プレビュー(全国)では全ブロブが強調レイヤーに入る", () => {
  const all = new Set(PREFECTURES.map((p) => p.code));
  const { nodes } = render({ activeCodes: all });
  const top = byClass(nodes, "jmap__top")[0];
  assert.equal(byClass(nodes, "jmap__pref").length, top.children.length, "一部の県が強調されていない");
});
