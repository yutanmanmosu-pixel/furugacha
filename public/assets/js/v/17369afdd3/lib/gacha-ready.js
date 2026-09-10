// @ts-check
// 自治体ガチャの「準備状態」から、UI操作の可否と案内表示を決める純関数。
//
// 背景(2026-09-10): HTMLは即座に描画されるが、ES moduleの読み込みと
// municipalities.json の取得が終わるまで gacha-app.js のsubmitハンドラは動けない。
// この空白時間にガチャボタンを押すと【フォームのネイティブ送信】が発生し、
// ?scope-type=all へページごとリロードされていた(取得失敗後もボタンは有効のまま)。
//
// 対策の要は「準備が終わるまで操作させない」ことなので、その判定を画面側の
// 書き方に散らさず、この1か所の純関数に集約する(状態遷移を回帰テストで固定できる)。

/** @typedef {"loading"|"ready"|"error"} GachaDataState */

/**
 * @typedef {Object} GachaControlState
 * @property {boolean} runDisabled      ガチャ実行ボタンを無効にするか
 * @property {boolean} scopeDisabled    範囲UI(ラジオ・セレクト・チップ)を無効にするか
 * @property {boolean} againDisabled    「同じ範囲でもう一回」を無効にするか
 * @property {boolean} loadingVisible   準備中の案内を出すか
 * @property {boolean} errorVisible     読み込み失敗の案内(再試行つき)を出すか
 * @property {boolean} canRun           抽選を開始してよいか(runGachaの入口ガード)
 */

/**
 * 準備状態・演出中フラグ・対象件数から操作可否を決める。
 * - "ready" 以外(=読み込み中/失敗)では、抽選も範囲変更もできない。
 * - 演出中(spinning)は結果と表示範囲の不一致を防ぐため範囲UIをロックし、連打も防ぐ。
 * - 対象0件では抽選できない(範囲変更自体は可能なままにする)。
 * @param {{state: GachaDataState, spinning: boolean, poolSize: number}} s
 * @returns {GachaControlState}
 */
export function gachaControlState(s) {
  const ready = s.state === "ready";
  const locked = !ready || s.spinning;
  return {
    scopeDisabled: locked,
    runDisabled: locked || s.poolSize <= 0,
    againDisabled: locked,
    loadingVisible: s.state === "loading",
    errorVisible: s.state === "error",
    canRun: ready && !s.spinning && s.poolSize > 0
  };
}
