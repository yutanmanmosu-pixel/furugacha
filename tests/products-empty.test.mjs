// @ts-check
// 自治体ガチャ: 返礼品0件 / 楽天APIエラー時の案内表示(2026-09-07)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productsEmptyState } from "../public/assets/js/lib/products-empty.js";

const FORBIDDEN = ["返礼品がありません", "実施していません", "寄附できません", "返礼品はありません"];

test("0件(楽天正常): 『楽天ふるさと納税で…確認できませんでした』に限定し、断定表現を含まない", () => {
  const st = productsEmptyState(true);
  assert.equal(st.kind, "empty");
  assert.ok(st.title.includes("楽天ふるさと納税で"), "楽天ふるさと納税での確認に限定していない");
  assert.ok(st.title.includes("確認できませんでした"));
  assert.ok(st.sub.includes("掲載状況は変更される場合があります"));
  for (const ng of FORBIDDEN) assert.ok(!(st.title + st.sub).includes(ng), `断定表現: ${ng}`);
});

test("APIエラー: 『取得できませんでした』系で、0件メッセージと混同しない", () => {
  const st = productsEmptyState(false);
  assert.equal(st.kind, "error");
  assert.ok(st.title.includes("取得できませんでした"));
  assert.ok(st.sub.includes("時間をおいて"));
  assert.ok(!st.title.includes("確認できませんでした"), "エラー時に0件文言を出してはいけない");
  for (const ng of FORBIDDEN) assert.ok(!(st.title + st.sub).includes(ng));
});

test("生成物: 案内ブロック・再ガチャ導線・/search/ CTAが商品セクション内に揃っている", () => {
  const html = readFileSync("public/gacha/index.html", "utf8");
  const sec = html.slice(html.indexOf('id="products"'), html.indexOf("</section>", html.indexOf('id="products"')));
  assert.ok(sec.includes('<div id="products-empty" class="products-empty" hidden>'), "案内ブロックがない/初期非表示でない");
  assert.ok(sec.includes('id="products-empty-title"') && sec.includes('id="products-empty-sub"'));
  assert.ok(sec.includes('<button id="products-empty-again" type="button" class="btn btn--ghost">'), "再ガチャ導線がない");
  assert.ok(sec.includes('class="search-fallback-cta__link" href="/search/"'), "/search/ CTAが同セクションにない");
  assert.equal((html.match(/search-fallback-cta__link/g) ?? []).length, 1, "検索CTAを複製してはいけない(既存を再利用)");
});

test("実装: 楽天モードのフォールバックサンプルを表示せず0件/エラーを区別する(静的検査)", () => {
  const app = readFileSync("public/assets/js/pages/gacha-app.js", "utf8");
  assert.ok(app.includes("getLastMunicipalityFetch()"), "取得結果の状態を参照していない");
  assert.ok(app.includes('mode === "rakuten" && products.length > 0 && products.every((p) => p.isMock)'), "フォールバックサンプルの検出がない");
  assert.ok(app.includes("showProductsEmpty(fetchState.ok)") || app.includes("renderProducts(shown, m, fetchState.ok)"), "0件/エラーの分岐がない");
  assert.ok(app.includes("showProductsEmpty(false)"), "例外時のエラー案内がない");
  assert.ok(app.includes("els.btnAgain.click()"), "既存の再抽選導線を再利用していない");
  const prov = readFileSync("public/assets/js/providers/index.js", "utf8");
  assert.ok(prov.includes("export function getLastMunicipalityFetch"), "状態フックが公開されていない");
  assert.ok(prov.includes('lastMunicipalityFetch = { ok: false, mode: "rakuten" };'), "エラー時にok:falseを記録していない");
  assert.ok(prov.includes("return mock.searchByMunicipality(q);"), "フォールバック仕様自体は変更しない");
});
