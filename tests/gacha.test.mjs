import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterByScope, drawMunicipality, scopeLabel, scopeFromParams, scopeToQuery, rouletteNames } from "../public/assets/js/lib/gacha.js";

const data = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));
const all = data.municipalities;

test("全国ガチャ: 全自治体が対象", () => {
  assert.equal(filterByScope(all, { type: "all" }).length, all.length);
});

test("地方ガチャ: 東北は東北6県のみ", () => {
  const pool = filterByScope(all, { type: "region", slug: "tohoku" });
  assert.ok(pool.length > 0);
  const prefs = new Set(pool.map((m) => m.prefecture));
  for (const p of prefs) assert.ok(["青森県","岩手県","宮城県","秋田県","山形県","福島県"].includes(p), p);
});

test("都道府県ガチャ: 福岡県のみ・糸島市を含む", () => {
  const pool = filterByScope(all, { type: "prefecture", slug: "fukuoka" });
  assert.ok(pool.every((m) => m.prefecture === "福岡県"));
  assert.ok(pool.some((m) => m.municipality === "糸島市"));
});

test("抽選は範囲内から1自治体を返す(同条件再ガチャ含む1000回)", () => {
  for (let i = 0; i < 1000; i++) {
    const m = drawMunicipality(all, { type: "region", slug: "kyushu" });
    assert.ok(m && m.region === "九州");
  }
});

test("空範囲(不正slug)ではnull", () => {
  assert.equal(drawMunicipality(all, { type: "prefecture", slug: "nowhere" }), null);
});

test("範囲ラベル", () => {
  assert.equal(scopeLabel({ type: "all" }), "全国");
  assert.equal(scopeLabel({ type: "region", slug: "tohoku" }), "東北");
  assert.equal(scopeLabel({ type: "prefecture", slug: "fukuoka" }), "福岡県");
});

test("URLパラメータ ↔ 範囲の相互変換と不正値フォールバック", () => {
  assert.deepEqual(scopeFromParams(new URLSearchParams("prefecture=fukuoka")), { type: "prefecture", slug: "fukuoka" });
  assert.deepEqual(scopeFromParams(new URLSearchParams("region=tohoku")), { type: "region", slug: "tohoku" });
  assert.deepEqual(scopeFromParams(new URLSearchParams("region=mars")), { type: "all" });
  assert.equal(scopeToQuery({ type: "prefecture", slug: "fukuoka" }), "prefecture=fukuoka");
  assert.equal(scopeToQuery({ type: "all" }), "");
});

test("ルーレット: 最後は必ず当選自治体", () => {
  const pool = filterByScope(all, { type: "prefecture", slug: "fukuoka" });
  const winner = pool.find((m) => m.municipality === "糸島市");
  const names = rouletteNames(pool, winner, 20);
  assert.equal(names.length, 20);
  assert.equal(names.at(-1), "糸島市");
});
