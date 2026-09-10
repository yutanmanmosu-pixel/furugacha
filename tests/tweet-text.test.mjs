// @ts-check
// Xの投稿文の長さ判定(2026-09-11)。
// 素の String#length で判定すると、日本語(1文字=2)・絵文字(=2)・URL(=23固定)で
// 実際の上限と大きくずれる。twitter-text の公開設定 v3 と同じ数え方になることを固定する。
//   https://github.com/twitter/twitter-text/blob/master/config/v3.json
import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedLength, fitsInTweet, TWEET_MAX, URL_WEIGHT } from "../public/assets/js/lib/tweet-text.js";

test("設定値: 上限280 / URLは23として数える", () => {
  assert.equal(TWEET_MAX, 280);
  assert.equal(URL_WEIGHT, 23);
});

test("半角英数は1文字ぶん", () => {
  assert.equal(weightedLength(""), 0);
  assert.equal(weightedLength("a"), 1);
  assert.equal(weightedLength("hello world"), 11);
  assert.equal(weightedLength("a".repeat(280)), 280);
  assert.equal(fitsInTweet("a".repeat(280)), true);
  assert.equal(fitsInTweet("a".repeat(281)), false);
});

test("日本語は1文字=2(280の重みで140文字)", () => {
  assert.equal(weightedLength("あ"), 2);
  assert.equal(weightedLength("ふるガチャ"), 10);
  assert.equal(weightedLength("あ".repeat(140)), 280);
  assert.equal(fitsInTweet("あ".repeat(140)), true);
  assert.equal(fitsInTweet("あ".repeat(141)), false);
  // String#length では 141 も「141文字」で収まって見えてしまう(これが判定を誤らせる)
  assert.equal("あ".repeat(141).length, 141);
});

test("URLは実際の長さに関係なく23として数える", () => {
  const short = "https://a.jp";
  const long = "https://furugacha.jp/share/budget/?b=2000000&c=travel&t=20342&i=" + "x".repeat(200);
  assert.equal(weightedLength(short), 23);
  assert.equal(weightedLength(long), 23);
  assert.equal(weightedLength(`結果はこちら ${long}`), 2 * 6 + 1 + 23);
});

test("絵文字は結合絵文字でもまとめて2", () => {
  assert.equal(weightedLength("🎰"), 2);          // サロゲートペア(String#lengthは2)
  assert.equal(weightedLength("👇"), 2);
  assert.equal(weightedLength("👨‍👩‍👧"), 2);      // ZWJ結合しても1つぶん
  assert.equal(weightedLength("👍🏽"), 2);          // 肌の色の修飾つき
  assert.equal(weightedLength("①②③④⑤"), 10);      // 丸数字はCJK扱い(2)
});

test("重み100の範囲(記号・約物)が設定どおり1として数えられる", () => {
  // config v3 の ranges: [8192,8205] [8208,8223] [8242,8247]
  assert.equal(weightedLength(" "), 1);
  assert.equal(weightedLength("‐"), 1);
  assert.equal(weightedLength("′"), 1);
  // 範囲外(全角約物)は2
  assert.equal(weightedLength("、"), 2);
  assert.equal(weightedLength("…"), 2);
});

test("混在文でも合計が一致する", () => {
  const text = "🎰 ふるガチャ\nhttps://furugacha.jp/share/gacha/?code=402303&t=20342\n#ふるガチャ";
  const expected =
    2 /* 🎰 */ + 1 /* 空白 */ + 5 * 2 /* ふるガチャ */ + 1 /* 改行 */ +
    23 /* URL */ + 1 /* 改行 */ + 1 /* # */ + 5 * 2 /* ふるガチャ */;
  assert.equal(weightedLength(text), expected);
});
