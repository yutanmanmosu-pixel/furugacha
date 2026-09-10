// @ts-check
// 共有結果ページと共有API の構造テスト(2026-09-11)。
// 生成物・サーバー側の前提(noindex / 必要な要素 / 入力検証 / アフィリエイトの扱い)が
// 再生成や改修で崩れないように固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gachaShare = readFileSync("public/share/gacha/index.html", "utf8");
const budgetShare = readFileSync("public/share/budget/index.html", "utf8");
const gachaPage = readFileSync("public/gacha/index.html", "utf8");
const homePage = readFileSync("public/index.html", "utf8");
const budgetPage = readFileSync("public/budget-gacha/index.html", "utf8");
const shareApi = readFileSync("functions/api/share-items.js", "utf8");

/* ---------------- 共有ページの生成 ---------------- */

test("共有ページ: noindexで、sitemapにも入れない(類似URLを大量に積まない)", () => {
  for (const [name, html] of [["gacha", gachaShare], ["budget", budgetShare]]) {
    assert.match(html, /<meta name="robots" content="noindex">/, `${name}: noindexが無い`);
  }
  const xml = readFileSync("public/sitemap.xml", "utf8");
  assert.ok(!xml.includes("/share/"), "共有ページがsitemapに入っている");
});

test("共有ページ(自治体): 範囲・自治体名・地図・返礼品導線・自分も回すCTAが揃っている", () => {
  for (const id of ["share-scope", "share-pref", "share-muni", "share-map", "share-rakuten",
    "share-products-grid", "share-date", "share-error", "share-loading"]) {
    assert.ok(gachaShare.includes(`id="${id}"`), `要素が無い: #${id}`);
  }
  assert.ok(/href="\/gacha\/"[^>]*>[\s\S]{0,80}自分も/.test(gachaShare), "自分もガチャを回すCTAが無い");
  // 再取得した返礼品を「共有時点の一覧」と誤認させない
  assert.match(gachaShare, /現在の返礼品候補/);
  assert.match(gachaShare, /共有された時点の一覧ではありません/);
});

test("共有ページ(予算): 予算・カテゴリ・点数・合計・残額・全商品・CTAが揃っている", () => {
  for (const id of ["share-budget", "share-summary", "share-meta", "share-date",
    "share-items-grid", "share-items-note", "share-items-error", "share-items-retry",
    "share-pr-badge", "share-again", "share-error", "share-loading"]) {
    assert.ok(budgetShare.includes(`id="${id}"`), `要素が無い: #${id}`);
  }
  // 「同じ予算で再抽選」は共有された結果とは別物だと明記する
  assert.match(budgetShare, /新しく抽選/, "再抽選と共有結果の区別が書かれていない");
});

/* ---------------- 共有UI(ガチャ側) ---------------- */

test("ガチャ画面: Xで共有は通常のリンクで、投稿文プレビューとコピー手段がある", () => {
  for (const [name, html, prefix] of [["home", homePage, "gacha"], ["gacha", gachaPage, "gacha"], ["budget", budgetPage, "budget"]]) {
    const link = new RegExp(`<a id="${prefix}-share-x"[^>]*>`).exec(html)?.[0] ?? "";
    assert.ok(link, `${name}: 共有リンクが無い`);
    assert.match(link, /href="https:\/\/x\.com\/intent\/tweet"/, `${name}: X公式のWeb Intentでない`);
    assert.match(link, /target="_blank"/, `${name}: 別タブで開かない`);
    assert.match(link, /rel="noopener noreferrer"/, `${name}: relが不足`);
    // 折りたたみプレビュー + コピー + 手動コピー用のテキストエリア
    assert.ok(html.includes(`<details id="${prefix}-share-details"`), `${name}: 投稿文プレビューが無い`);
    assert.ok(html.includes(`<textarea id="${prefix}-share-text"`), `${name}: 手動コピー用の本文が無い`);
    assert.ok(html.includes(`id="${prefix}-share-copy"`), `${name}: コピーボタンが無い`);
    assert.match(html, /自動で投稿することはありません/, `${name}: 自動投稿しない旨の説明が無い`);
    // 初期状態は非表示(結果が出るまで共有できない)
    assert.match(new RegExp(`<div id="${prefix}-share"[^>]*>`).exec(html)?.[0] ?? "", /\bhidden\b/, `${name}: 最初から共有が出ている`);
  }
});

test("ガチャ画面: 共有UIは再ガチャ・楽天CTAより後ろに置く(主要導線を邪魔しない)", () => {
  // 自治体ガチャ: 「同じ範囲でもう一回」より後ろ
  assert.ok(gachaPage.indexOf('id="btn-again"') < gachaPage.indexOf('id="gacha-share"'), "再ガチャより前に共有がある");
  // 予算ガチャ: 「同じ条件でもう一回」より後ろ
  assert.ok(budgetPage.indexOf('id="budget-again"') < budgetPage.indexOf('id="budget-share"'), "再ガチャより前に共有がある");
});

/* ---------------- 共有API ---------------- */

test("共有API: itemCodeを厳格に検証し、最大5件・読み取り専用", () => {
  assert.match(shareApi, /const MAX_CODES = 5/, "件数上限が無い");
  assert.match(shareApi, /ITEM_CODE_RE\s*=\s*\/\^/, "itemCodeの検証が無い");
  assert.match(shareApi, /onRequestGet/, "GET以外を受けている");
  assert.ok(!/onRequestPost|onRequestPut|onRequestDelete/.test(shareApi), "書き込み系のハンドラがある");
  // 保存はしない = 乱用で大量保存されようがない
  assert.ok(!/KV|D1|put\(|\.write/.test(shareApi.replace(/cache\.put\([^)]*\)/g, "")), "保存処理がある");
});

test("共有API: 商品情報は楽天APIの戻り値のみを使い、URLは受け取らない", () => {
  assert.match(shareApi, /mapRakutenItem/, "共通のマッパーを通していない");
  // クライアントから渡せるのは codes だけ
  const params = [...shareApi.matchAll(/searchParams\.get\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(params)], ["codes"], `想定外の入力を受けている: ${params.join(",")}`);
  // アフィリエイトURLの組み立て・改変をしていない
  assert.ok(!/affiliateUrl\s*=|hb\.afl\.rakuten|\?scid=|affiliateId=/.test(shareApi), "アフィリエイトURLを自前で作っている");
});

test("共有API: 資格情報が無い/モック時は実商品を返さない", () => {
  assert.match(shareApi, /MOCK_MODE/, "モード判定が無い");
  assert.match(shareApi, /provider_unavailable/, "サンプル時の応答が無い");
});

/* ---------------- 表示の安全性 ---------------- */

test("共有ページの描画は textContent 経由で、外部データをHTMLとして流し込まない", () => {
  for (const f of ["public/assets/js/pages/share-gacha.js", "public/assets/js/pages/share-budget.js"]) {
    const src = readFileSync(f, "utf8");
    const innerHtml = [...src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    // 空文字での初期化以外の innerHTML 代入を禁止(商品名などをHTMLとして解釈させない)
    for (const v of innerHtml) {
      assert.ok(v === '""' || v === "''", `${f}: innerHTMLに値を流し込んでいる: ${v}`);
    }
    assert.ok(!/insertAdjacentHTML|document\.write/.test(src), `${f}: 生HTML挿入がある`);
  }
});
