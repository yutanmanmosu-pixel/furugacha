// @ts-check
// Xへ投稿する本文の組み立て。
//
// 守ること:
//   ・まだ寄附していないので「寄附した」「ここに決めた」と断定しない(= 寄附先【候補】)
//   ・自治体ガチャは返礼品を抽選していないので「当たった商品」と書かない
//   ・自治体名・金額・共有URLは短縮で壊さない
//   ・楽天アフィリエイトリンクは本文に入れない(自分が運営していないSNSへの掲載になるため)
//     商品リンクはふるガチャ内の共有結果ページ側に置く
//   ・Xの重み付き文字数(日本語=2 / URL=23)で上限判定する → lib/tweet-text.js
//
// 長すぎる場合の削り順(要件): 説明文 → 商品名の短縮 → 掲載点数の削減。

import { TWEET_MAX, weightedLength } from "./tweet-text.js";

/** ハッシュタグ(短縮対象にしない) */
const TAGS = "#ふるガチャ #ふるさと納税";

/** 商品名から落としてよい定型の飾り(内容は足さない・変えない) */
const NOISE_PATTERNS = [
  /^【ふるさと納税】\s*/,       // 先頭の定型表記
  /^ふるさと納税\s*/,
  /【[^】]{0,20}(価格改定|発送|ランキング|楽天|限定|期間)[^】]{0,20}】/g, // 販促タグ
  /《[^》]{0,20}》/g,
  /\s{2,}/g
];
/** 意味の切れ目として使える区切り(この直前で切る) */
const BREAKS = ["／", "/", "｜", "|", "・", " ", "　", "－", "-", "＜", "(", "（", "【", "["];

/**
 * 商品名を「意味を変えずに」短くする。削るだけで、内容・数量・容量は足さない。
 * @param {string} name
 * @param {number} maxChars 目安の文字数(見た目の長さ)
 */
export function shortenProductName(name, maxChars) {
  let s = String(name ?? "").trim();
  for (const re of NOISE_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (s.length <= maxChars) return s;
  const head = s.slice(0, maxChars);
  let cut = -1;
  for (const b of BREAKS) cut = Math.max(cut, head.lastIndexOf(b));
  // 短く切りすぎない範囲に区切りがあれば、そこで切る
  const body = cut >= Math.floor(maxChars * 0.5) ? head.slice(0, cut) : head;
  return `${body.trim()}…`;
}

/* ---------------- 自治体ガチャ ---------------- */

/**
 * @param {{scopeLabel:string, prefecture:string, municipality:string, url:string}} r
 * @returns {string}
 */
export function gachaTweet(r) {
  const head = `🎰 ふるガチャを回したら…\n${r.scopeLabel}から引いた今回の寄附先候補は【${r.prefecture}${r.municipality}】！`;
  const lead = "知らなかったまちとの出会いも、ふるさと納税の楽しみ。";
  const tail = `今回の結果はこちら👇\n${r.url}\n${TAGS}`;
  const full = `${head}\n\n${lead}\n${tail}`;
  if (weightedLength(full) <= TWEET_MAX) return full;
  // 削り順1: 説明文を落とす(自治体名・URL・タグは残す)
  return `${head}\n\n${tail}`;
}

/* ---------------- 予算おまかせガチャ ---------------- */

const NUMS = ["①", "②", "③", "④", "⑤"];

/**
 * @param {{budget:number, total:number, remaining:number,
 *          items:{title:string}[], url:string}} r
 * @returns {string}
 */
export function budgetTweet(r) {
  const yen = (/** @type {number} */ n) => n.toLocaleString("ja-JP");
  const head = `🎰 予算${yen(r.budget)}円で、ふるガチャ！`;
  const lead = "こんな返礼品の組み合わせが出ました👇";
  const foot = `合計${yen(r.total)}円／残り${yen(r.remaining)}円\n${r.url}\n${TAGS}`;
  const all = r.items.slice(0, NUMS.length);

  /**
   * @param {boolean} withLead @param {number} nameMax @param {number} shown
   */
  const build = (withLead, nameMax, shown) => {
    const listed = all.slice(0, shown);
    const lines = listed.map((p, i) => `${NUMS[i]} ${shortenProductName(p.title, nameMax)}`);
    const rest = all.length - listed.length;
    if (rest > 0) lines.push(`ほか${rest}品`);
    return [head, ...(withLead ? [lead] : []), "", ...lines, "", foot].join("\n");
  };

  // 削り順は要件どおり「説明文 → 商品名の短縮 → 掲載点数の削減」。
  // 金額(予算・合計・残り)と共有URL、タグはどの段階でも落とさない。
  /** @type {(() => string)[]} */
  const attempts = [
    () => build(true, 34, all.length),                      // そのまま
    () => build(false, 34, all.length)                      // 1) 説明文を落とす
  ];
  for (const nameMax of [26, 20, 15, 11]) {                 // 2) 商品名を短くする
    attempts.push(() => build(false, nameMax, all.length));
  }
  for (let shown = all.length - 1; shown >= 1; shown--) {   // 3) 載せる点数を減らす
    for (const nameMax of [20, 15, 11]) attempts.push(() => build(false, nameMax, shown));
  }
  for (const attempt of attempts) {
    const text = attempt();
    if (weightedLength(text) <= TWEET_MAX) return text;
  }
  // 最後の手段: 点数だけ伝える(金額とURLは必ず残す)
  return [head, "", `返礼品${all.length}品の組み合わせが出ました`, "", foot].join("\n");
}

/* ---------------- X(Web Intent) ---------------- */

/** X公式のWeb Intent。APIキーもログイン連携も不要で、投稿はユーザー本人が確定する。
 *  参照: https://docs.x.com/x-for-websites/web-intents/overview */
export const X_INTENT_BASE = "https://x.com/intent/tweet";

/** @param {string} text @returns {string} */
export function xIntentUrl(text) {
  return `${X_INTENT_BASE}?text=${encodeURIComponent(text)}`;
}
