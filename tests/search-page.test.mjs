// @ts-check
// 返礼品キーワード検索(2026-09-06)のUI/入力回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { normalizeSearchQuery, SEARCH_QUERY_MAX } from "../public/assets/js/lib/search-query.js";

test("検索入力: 空/空白のみ拒否・日本語OK・50字OK/51字拒否・特殊文字でも例外なし", () => {
  assert.deepEqual(normalizeSearchQuery(""), { ok: false, q: "", reason: "empty" });
  assert.deepEqual(normalizeSearchQuery("   \t "), { ok: false, q: "", reason: "empty" });
  assert.deepEqual(normalizeSearchQuery(" 鶏肉 "), { ok: true, q: "鶏肉" });
  assert.equal(normalizeSearchQuery("あ".repeat(SEARCH_QUERY_MAX)).ok, true);
  const long = normalizeSearchQuery("あ".repeat(SEARCH_QUERY_MAX + 1));
  assert.equal(long.ok, false);
  assert.equal(/** @type {any} */ (long).reason, "too_long");
  assert.doesNotThrow(() => normalizeSearchQuery('<img src=x onerror="a">&"'));
  assert.doesNotThrow(() => encodeURIComponent(normalizeSearchQuery("鶏肉%&?=#").q));
});

test("生成物: /search/ ページが生成され、フォーム・結果エリア・maxlength=50 が存在", () => {
  const f = "public/search/index.html";
  assert.ok(existsSync(f), "/search/ が生成されていない");
  const html = readFileSync(f, "utf8");
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  for (const id of ["search-form", "search-q", "search-run", "search-grid", "search-more-btn", "search-term", "search-pr-badge"]) {
    assert.ok(html.includes(`id="${id}"`), `要素がない: #${id}`);
  }
  assert.ok(html.includes('maxlength="50"'), "maxlength=50がない");
  assert.ok(html.includes('/assets/js/pages/search.js?v='), "search.jsが読み込まれていない");
});

test("導線: ガチャページとトップから /search/ へリンクし、sitemapにも収載される", () => {
  assert.ok(readFileSync("public/gacha/index.html", "utf8").includes('href="/search/"'), "ガチャ→検索の導線がない");
  assert.ok(readFileSync("public/index.html", "utf8").includes('href="/search/"'), "トップ→検索の導線がない");
  assert.ok(readFileSync("public/sitemap.xml", "utf8").includes("<loc>https://furugacha.jp/search/</loc>"), "sitemap未収載");
});

test("search.js: 既存資産の再利用とセキュリティ方針(静的検査)", () => {
  const src = readFileSync("public/assets/js/pages/search.js", "utf8");
  assert.ok(src.includes('from "./product-card.js"'), "商品カードを再利用していない");
  assert.ok(src.includes("splitProducts") && src.includes("moreLabel") && src.includes("PRODUCT_FETCH_LIMIT"), "6+追加表示の既存ページングを再利用していない");
  assert.ok(src.includes("mode=keyword"), "検索APIモード不使用");
  assert.ok(src.includes("encodeURIComponent(q)"), "URLエンコード漏れ");
  assert.ok(!/\.innerHTML\s*[=(]/.test(src), ".innerHTMLを使ってはいけない(XSS対策)");
  assert.ok(!/getProvider|mock-provider/.test(src), "検索でMockフォールバックしてはいけない");
  assert.ok(src.includes('#q='), "検索状態はフラグメント(#q=)で保持する");
});
