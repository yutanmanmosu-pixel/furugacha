// @ts-check
// 2026-09-07 UI改善(検索サブ導線2行 / ホームティーザー注記 / 点数選択UI)の静的回帰テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CTA_RE = /<p class="search-fallback-cta"><span class="search-fallback-cta__lead">やっぱり普通に探したい方は<\/span><a class="search-fallback-cta__link" href="\/search\/">返礼品をキーワードから探す ›<\/a><\/p>/;

test("検索サブ導線: 自治体ガチャ結果・予算ガチャ結果の両方に同一構造の2行CTA(リンク先/search/)", () => {
  for (const f of ["public/gacha/index.html", "public/budget-gacha/index.html", "public/index.html"]) {
    const html = readFileSync(f, "utf8");
    assert.match(html, CTA_RE, f);
    assert.ok(!html.includes("やっぱり普通に探したい方は <a"), `旧1行CTAが残っている: ${f}`);
  }
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /\.search-fallback-cta__lead \{ display: block; \}/);
  assert.match(css, /\.search-fallback-cta__link \{[^}]*font-weight: 700/);
});

test("ホーム: 予算カード注記が2行構造(装飾回避クラス+改行スパン)、控除注記に専用余白クラス", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.ok(html.includes('<p class="note teaser__note--clear">※提案はランダムです。<span class="teaser__note-break">何度でも引き直せます。</span></p>'));
  assert.ok(html.includes('<p class="note teaser__note--clear teaser__disclaimer">※控除額は目安です。<span class="teaser__note-break">詳細は税理士等にご相談ください。</span></p>'));
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /\.teaser__disclaimer \{ margin-top: 14px; \}/);
  // 狭幅(≤640px)ブロック内に「右余白」と「意味単位の改行」の両方が定義されていること(コメントの有無は問わない)
  const mobile = css.slice(css.lastIndexOf("@media (max-width: 640px) {"));
  assert.match(mobile, /\.teaser__note--clear \{ padding-right: 98px; \}/);
  assert.match(mobile, /\.teaser__note-break \{ display: block; \}/);
});

test("予算ガチャ: 10,000円以上用の点数選択UI(おまかせ+1〜5点)と説明用noteが存在し、初期は非表示", () => {
  const html = readFileSync("public/budget-gacha/index.html", "utf8");
  assert.ok(html.includes('<div id="budget-count-field" class="field" hidden>'));
  assert.ok(html.includes('<select id="budget-count" name="budget-count">'));
  for (const v of ["auto", "1", "2", "3", "4", "5"]) assert.ok(html.includes(`<option value="${v}"`), `option ${v}`);
  assert.ok(!html.includes('<option value="6"'), "6点の選択肢があってはいけない");
  assert.ok(html.includes('id="budget-count-note"'));
  const js = readFileSync("public/assets/js/pages/budget.js", "utf8");
  assert.ok(js.includes("normalizeBudgetCount(") && js.includes("maxItems: BUDGET_MAX_ITEMS"), "ページ側が最大5点/点数指定を使っていない");
  assert.ok(!js.includes("maxItems: 6"), "旧maxItems:6が残っている");
});
