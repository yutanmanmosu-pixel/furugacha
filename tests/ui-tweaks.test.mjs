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

test("ホーム: 予算注記は2行構造を維持+左右共通の上余白 / 控除注記は意味単位の2スパンで『税理士等に』を分断しない", () => {
  const html = readFileSync("public/index.html", "utf8");
  // 予算カード: 2行構造(改行スパン)・ガチャ玉回避(--clear)・ボタンとの余白(--spaced)
  assert.ok(html.includes('<p class="note teaser__note--clear teaser__note--spaced">※提案はランダムです。<span class="teaser__note-break">何度でも引き直せます。</span></p>'));
  // 控除カード: 文言は不変。「詳細は税理士等にご相談ください。」を1つの意味単位として保持する
  assert.ok(html.includes('<p class="note teaser__note--spaced teaser__disclaimer"><span class="teaser__note-break">※控除額は目安です。</span><span class="teaser__note-break">詳細は税理士等にご相談ください。</span></p>'));
  assert.ok(!/税理士等に<\/span>/.test(html) && !/<span[^>]*>ご相談ください/.test(html), "『税理士等に』と『ご相談ください』を分断してはいけない");
  assert.ok(!/nowrap[^"]*">詳細は税理士等に/.test(html), "nowrapで横スクロールを起こしてはいけない");
  const css = readFileSync("public/assets/css/style.css", "utf8");
  // PC: 左右で共通(整合した)上余白ルールが1箇所で定義され、片側だけの旧ルールは残っていない
  assert.match(css, /\.teaser__note--spaced \{ margin-top: 14px; \}/);
  assert.ok(!/\.teaser__disclaimer \{ margin-top/.test(css), "片側だけの余白ルールが残っている");
  // 2カラム時は左CTAの白枠(3px×2)ぶんだけ右カード注記を下げ、左右の開始位置を揃える
  const two = css.slice(css.indexOf("@media (min-width: 861px) {"));
  assert.match(two, /\.teaser--budget \.teaser__note--spaced \{ margin-top: 20px; \}/);
  // 狭幅(≤640px): 余白拡大・ガチャ玉回避・意味単位改行・控除カードは装飾を注記の下へ逃がす
  const mobile = css.slice(css.lastIndexOf("@media (max-width: 640px) {"));
  assert.match(mobile, /\.teaser__note--spaced \{ margin-top: 18px; \}/);
  assert.match(mobile, /\.teaser__note--clear \{ padding-right: 98px; \}/);
  assert.match(mobile, /\.teaser__note-break \{ display: block; \}/);
  assert.match(mobile, /\.teaser--calc \{ padding-bottom: 84px; \}/);
  // 文字サイズは小さくしない(.note の既定を上書きしていない)
  assert.ok(!/\.teaser__note--spaced \{[^}]*font-size/.test(css));
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
