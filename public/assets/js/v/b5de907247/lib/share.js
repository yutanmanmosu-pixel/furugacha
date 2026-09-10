// @ts-check
// 結果の共有URL・共有テキストの組み立て。
//
// 2026-09-11: 共有先を結果共有ページ /share/gacha/ に統一した。
// 以前は /gacha/?code=… を共有していたが、開くと抽選範囲が【当選県に書き換わり】、
// 「全国から引いた結果」を共有したのに「岐阜県ガチャの結果」と表示される矛盾があった。
// URLの組み立ては lib/share-state.js の1か所に集約し、経路(Xで共有 / リンクをコピー)で
// 範囲や結果が変わらないようにする。

import { gachaShareQuery, shareStamp } from "./share-state.js";

/** @typedef {import("./types.js").Municipality} Municipality */
/** @typedef {import("./types.js").GachaScope} GachaScope */

/**
 * 結果共有ページのURL(抽選範囲つき)。
 * @param {Municipality} m @param {GachaScope} scope この結果を生んだ範囲
 * @param {string} [origin]
 */
export function shareUrl(m, scope, origin = location.origin) {
  return `${origin}/share/gacha/${gachaShareQuery({
    scope, municipalityCode: m.municipalityCode, stamp: shareStamp()
  })}`;
}

/**
 * リンクと一緒にコピーする短い説明。まだ寄附していないので断定しない。
 * @param {Municipality} m
 */
export function shareText(m) {
  return `ふるガチャの結果: 今回の寄附先候補は${m.prefecture}${m.municipality}でした🎰`;
}

/**
 * 結果ページのリンクをクリップボードへコピーする。
 * Web Share API は使わない(共有先ごとに文面が変わると、Xの投稿文と食い違うため)。
 * @param {Municipality} m @param {GachaScope} scope
 * @returns {Promise<"copied"|"failed">}
 */
export async function copyShareLink(m, scope) {
  try {
    await navigator.clipboard.writeText(`${shareText(m)}\n${shareUrl(m, scope)}`);
    return "copied";
  } catch {
    return "failed";
  }
}
