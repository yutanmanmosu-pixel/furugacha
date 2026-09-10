// @ts-check
// Xの投稿文の組み立て(2026-09-11)。
// 守ること:
//   ・寄附前なので断定しない / 自治体ガチャで「商品が当たった」と書かない
//   ・自治体名・金額・共有URLは短縮しても壊さない
//   ・楽天アフィリエイトリンクを本文に入れない(自分が運営していないSNSへの掲載になるため)
//   ・長い名前・5品・絵文字でも通常投稿(重み280)に収まる
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gachaTweet, budgetTweet, shortenProductName, xIntentUrl, X_INTENT_BASE } from "../public/assets/js/lib/share-text.js";
import { weightedLength, TWEET_MAX } from "../public/assets/js/lib/tweet-text.js";

const SHARE_URL = "https://furugacha.jp/share/gacha/?code=402303&region=kyushu&t=20342";
/** 実データ中もっとも長い「都道府県+自治体名」 */
const LONGEST = { prefecture: "鹿児島県", municipality: "いちき串木野市" };

/** 断定・煽り・商品当選の誤表現が入っていないこと @param {string} text */
function assertSafeWording(text) {
  for (const ng of ["寄附しました", "寄付しました", "ここに決めた", "決定しました", "当たりました",
    "当たった", "ゲットしました", "今すぐ", "急いで", "お得です"]) {
    assert.ok(!text.includes(ng), `断定・煽りの表現が入っている: ${ng}\n${text}`);
  }
  // 楽天アフィリエイトのリンクは本文に絶対に入れない
  assert.ok(!/hb\.afl\.rakuten\.co\.jp|rakuten\.co\.jp/.test(text), `楽天リンクが本文に入っている\n${text}`);
}

/* ---------------- 自治体ガチャ ---------------- */

test("自治体ガチャ: 範囲・自治体名・共有URL・タグが入り、280に収まる", () => {
  for (const scopeLabel of ["全国", "四国", "北海道"]) {
    const text = gachaTweet({ scopeLabel, prefecture: "福岡県", municipality: "糸島市", url: SHARE_URL });
    assert.ok(text.includes(`${scopeLabel}から引いた`), `範囲が反映されていない: ${scopeLabel}`);
    assert.ok(text.includes("【福岡県糸島市】"), "自治体名が省略されている");
    assert.ok(text.includes("寄附先候補"), "「候補」と書いていない(寄附済みと誤解される)");
    assert.ok(text.includes(SHARE_URL), "共有URLが入っていない");
    assert.ok(text.includes("#ふるガチャ") && text.includes("#ふるさと納税"), "ハッシュタグがない");
    assert.ok(weightedLength(text) <= TWEET_MAX, `280を超える: ${weightedLength(text)}`);
    assertSafeWording(text);
  }
});

test("自治体ガチャ: 返礼品を抽選していないので商品の話をしない", () => {
  const text = gachaTweet({ scopeLabel: "全国", prefecture: "福岡県", municipality: "糸島市", url: SHARE_URL });
  for (const ng of ["返礼品が当", "この商品", "商品が出", "が当選"]) {
    assert.ok(!text.includes(ng), `返礼品を当てたような表現: ${ng}`);
  }
});

test("自治体ガチャ: 最長の自治体名でも自治体名を削らずに収まる", () => {
  const text = gachaTweet({ scopeLabel: "九州", ...LONGEST, url: SHARE_URL });
  assert.ok(text.includes(`【${LONGEST.prefecture}${LONGEST.municipality}】`), "自治体名が省略された");
  assert.ok(weightedLength(text) <= TWEET_MAX, `280を超える: ${weightedLength(text)}`);
});

/* ---------------- 商品名の短縮 ---------------- */

test("商品名の短縮: 内容を足さず、定型の飾りを外して区切りで切る", () => {
  const raw = "【ふるさと納税】《最短翌日発送》オリオン ザ・ドラフト＜350ml×24缶＞- オリオンビール 1ケース 沖縄県 八重瀬町【価格改定YJ】";
  const short = shortenProductName(raw, 20);
  assert.ok(!short.includes("【ふるさと納税】"), "定型の先頭表記が残っている");
  assert.ok(!short.includes("【価格改定YJ】"), "販促タグが残っている");
  assert.ok(short.length <= 21, `長すぎる: ${short}`);
  // 元の名前に無い語を足していない(…以外はすべて元文字列に含まれる)
  const cleaned = raw.replace(/【[^】]*】|《[^》]*》/g, " ").replace(/\s+/g, " ").trim();
  for (const ch of short.replace(/…$/, "").trim()) {
    assert.ok(cleaned.includes(ch), `元の名前に無い文字を作っている: ${ch} / ${short}`);
  }
});

test("商品名の短縮: 短い名前はそのまま(不要に…を付けない)", () => {
  assert.equal(shortenProductName("お米 10kg", 20), "お米 10kg");
  assert.equal(shortenProductName("【ふるさと納税】お米 10kg", 20), "お米 10kg");
});

/* ---------------- 予算ガチャ ---------------- */

/** @param {number} n @param {number} [nameLen] */
function items(n, nameLen = 18) {
  return Array.from({ length: n }, (_, i) => ({ title: `返礼品${i + 1}${"あ".repeat(nameLen)}` }));
}

test("予算ガチャ: 1〜5品それぞれで金額・URL・タグが入り280に収まる", () => {
  for (let n = 1; n <= 5; n++) {
    const text = budgetTweet({
      budget: 50000, total: 48000, remaining: 2000, items: items(n), url: SHARE_URL
    });
    assert.ok(text.includes("予算50,000円"), "予算が入っていない");
    assert.ok(text.includes("合計48,000円／残り2,000円"), `合計・残額が入っていない\n${text}`);
    assert.ok(text.includes(SHARE_URL), "共有URLが入っていない");
    assert.ok(text.includes("#ふるガチャ"), "ハッシュタグがない");
    assert.ok(weightedLength(text) <= TWEET_MAX, `${n}品で280を超える: ${weightedLength(text)}`);
    assertSafeWording(text);
  }
});

test("予算ガチャ: 実際に提案された点数だけを載せる(勝手に増やさない)", () => {
  const text = budgetTweet({ budget: 20000, total: 18000, remaining: 2000, items: items(2, 6), url: SHARE_URL });
  assert.ok(text.includes("①") && text.includes("②"), "2品が載っていない");
  assert.ok(!text.includes("③"), "存在しない3品目を作っている");
});

test("予算ガチャ: 長い商品名5品でも、削り順は 説明文 → 名前短縮 → 点数削減", () => {
  const long = Array.from({ length: 5 }, (_, i) => ({
    title: `【ふるさと納税】特大ボリューム 訳あり 冷凍 小分け 返礼品${i + 1} ${"あ".repeat(60)}`
  }));
  const text = budgetTweet({ budget: 100000, total: 99000, remaining: 1000, items: long, url: SHARE_URL });
  assert.ok(weightedLength(text) <= TWEET_MAX, `280を超える: ${weightedLength(text)}`);
  // 金額・URLは必ず残る
  assert.ok(text.includes("予算100,000円"));
  assert.ok(text.includes("合計99,000円／残り1,000円"));
  assert.ok(text.includes(SHARE_URL));
  // 説明文が先に落ちている
  assert.ok(!text.includes("こんな返礼品の組み合わせが出ました"), "説明文より先に商品を削っている");
  // 全部載らない場合は「ほかN品」で件数を正しく伝える
  const listed = (text.match(/[①②③④⑤]/g) ?? []).length;
  const rest = /ほか(\d+)品/.exec(text);
  assert.equal(listed + (rest ? Number(rest[1]) : 0), 5, `点数の合計が合わない\n${text}`);
});

test("予算ガチャ: 短い名前なら説明文を残したまま5品とも載る", () => {
  const text = budgetTweet({
    budget: 50000, total: 49000, remaining: 1000,
    items: [{ title: "お米 5kg" }, { title: "牛肉 500g" }, { title: "みかん 3kg" }, { title: "タオル 5枚" }, { title: "ビール 24本" }],
    url: SHARE_URL
  });
  assert.ok(text.includes("こんな返礼品の組み合わせが出ました👇"), "説明文が不要に落ちている");
  assert.ok(text.includes("⑤"), "5品とも載っていない");
  assert.ok(!text.includes("ほか"), "省略していないのに「ほか」が出ている");
  assert.ok(weightedLength(text) <= TWEET_MAX);
});

test("予算ガチャ: 年収・家族構成など控除の入力値は投稿文に出さない", () => {
  const text = budgetTweet({ budget: 61000, total: 60000, remaining: 1000, items: items(3), url: SHARE_URL });
  for (const ng of ["年収", "扶養", "配偶者", "控除上限", "シミュレーター"]) {
    assert.ok(!text.includes(ng), `控除まわりの情報が漏れている: ${ng}`);
  }
});

/* ---------------- Web Intent ---------------- */

test("X Web Intent: 公式のURL形式で、本文が壊れずに載る", () => {
  assert.equal(X_INTENT_BASE, "https://x.com/intent/tweet");
  const text = gachaTweet({ scopeLabel: "全国", prefecture: "福岡県", municipality: "糸島市", url: SHARE_URL });
  const u = new URL(xIntentUrl(text));
  assert.equal(u.origin + u.pathname, X_INTENT_BASE);
  assert.equal(u.searchParams.get("text"), text, "改行や記号がエンコードで壊れている");
  assert.ok(u.searchParams.get("text")?.includes("\n"), "改行が保持されていない");
});

test("実装がアフィリエイトURLを本文に混ぜる作りになっていない", () => {
  const src = readFileSync("public/assets/js/lib/share-text.js", "utf8");
  assert.ok(!/affiliateUrl|productUrl|getProductDestinationUrl/.test(src),
    "投稿文の組み立てが商品リンクを参照している(SNSへのアフィリエイト掲載になる)");
});
