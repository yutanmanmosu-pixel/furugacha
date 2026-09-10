// @ts-check
// Xの投稿文の長さ判定。
//
// 素の String#length では判定できない。Xは「重み付き文字数」で数えるため:
//   ・日本語(CJK)や絵文字は 1文字 = 2
//   ・URLは実際の長さに関わらず t.co 短縮後の 23 として数える
// 出典: twitter-text の公開設定 config/v3.json
//   https://github.com/twitter/twitter-text/blob/master/config/v3.json
//   version 3 / maxWeightedTweetLength 280 / scale 100 / defaultWeight 200 /
//   transformedURLLength 23 / emojiParsingEnabled true /
//   ranges(weight 100): [0,4351] [8192,8205] [8208,8223] [8242,8247]
// 依存パッケージは足さず、この設定値だけを写して実装する(値は上記の公開仕様)。

/** 一般アカウントで投稿できる重み付き上限 */
export const TWEET_MAX = 280;
/** URLは短縮後の固定長で数える */
export const URL_WEIGHT = 23;

const SCALE = 100;
const DEFAULT_WEIGHT = 200;
const LIGHT_WEIGHT = 100;
/** 重み100(=1文字扱い)のコードポイント範囲 */
const LIGHT_RANGES = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];

/** 投稿文に載せるURLは自分で組み立てるため、この程度の判定で足りる */
const URL_RE = /https?:\/\/[^\s]+/g;
/** 絵文字(結合絵文字・肌色・異体字セレクタを含むまとまり)を1つとして数えるための判定 */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** @param {number} cp */
function codePointWeight(cp) {
  for (const [start, end] of LIGHT_RANGES) {
    if (start !== undefined && end !== undefined && cp >= start && cp <= end) return LIGHT_WEIGHT;
  }
  return DEFAULT_WEIGHT;
}

/** 書記素(絵文字1つ = 1要素)に分ける @param {string} s @returns {string[]} */
function graphemes(s) {
  const Seg = /** @type {any} */ (globalThis).Intl?.Segmenter;
  if (Seg) {
    return [...new Seg("ja", { granularity: "grapheme" }).segment(s)].map((/** @type {any} */ g) => g.segment);
  }
  // Intl.Segmenter が無い環境向けの控えめな代替(絵文字の連結だけまとめる)
  return s.match(/\p{Extended_Pictographic}(️|[\u{1F3FB}-\u{1F3FF}])*(‍\p{Extended_Pictographic}(️|[\u{1F3FB}-\u{1F3FF}])*)*|[\s\S]/gu) ?? [];
}

/** URLを除いた本文の重み(スケール前) @param {string} s */
function plainWeight(s) {
  let total = 0;
  for (const g of graphemes(s)) {
    if (EMOJI_RE.test(g)) { total += DEFAULT_WEIGHT; continue; }
    for (const ch of g) total += codePointWeight(ch.codePointAt(0) ?? 0);
  }
  return total;
}

/**
 * Xの重み付き文字数を返す(URLは23、日本語・絵文字は2として数える)。
 * @param {string} text
 * @returns {number}
 */
export function weightedLength(text) {
  const s = String(text ?? "");
  let total = 0;
  let plain = "";
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    plain += s.slice(last, at);
    total += URL_WEIGHT * SCALE;
    last = at + m[0].length;
  }
  plain += s.slice(last);
  total += plainWeight(plain);
  return Math.ceil(total / SCALE);
}

/** 通常投稿に収まるか @param {string} text */
export function fitsInTweet(text) {
  return weightedLength(text) <= TWEET_MAX;
}

/** 上限までの残り @param {string} text */
export function remainingWeight(text) {
  return TWEET_MAX - weightedLength(text);
}
