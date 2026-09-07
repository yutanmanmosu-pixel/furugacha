// @ts-check
// 自治体ガチャ結果の返礼品が0件のときの案内文言(2026-09-07)。
// 方針: 「楽天ふるさと納税で現在確認できなかった」範囲に限定し、
//       「この自治体には返礼品がない」等の断定はしない。APIエラーは別文言で区別する。

/**
 * @param {boolean} fetchOk 楽天APIが正常応答したか(false=通信/上流エラー)
 * @returns {{kind: "empty"|"error", title: string, sub: string}}
 */
export function productsEmptyState(fetchOk) {
  if (!fetchOk) {
    return {
      kind: "error",
      title: "返礼品を取得できませんでした。",
      sub: "時間をおいてもう一度お試しください。"
    };
  }
  return {
    kind: "empty",
    title: "現在、楽天ふるさと納税でこの自治体の返礼品を確認できませんでした。",
    sub: "掲載状況は変更される場合があります。もう一度ガチャを回すか、キーワードから探すこともできます。"
  };
}
