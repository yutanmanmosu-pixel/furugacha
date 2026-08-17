// @ts-check
// 予算おまかせガチャのカテゴリ定義(初期版は4種のみ)
// ※ functions/api/_lib/rakuten.js 側のキーワード表と対応。変更時は両方を更新。

/** @type {{id:"random"|"food"|"life"|"travel", label:string, subs:string[]}[]} */
export const CATEGORIES = [
  { id: "random", label: "完全ランダム", subs: [] },
  { id: "food",   label: "食品",         subs: ["meat", "seafood", "rice", "vegetable", "fruit", "sweets", "drink", "processed"] },
  { id: "life",   label: "暮らし",       subs: ["daily", "goods", "kitchen", "appliance", "interior"] },
  { id: "travel", label: "旅行・体験",   subs: ["stay", "voucher", "meal", "leisure", "activity"] }
];

/** @param {string} id */
export function categoryById(id) { return CATEGORIES.find((c) => c.id === id) ?? null; }

/** サブカテゴリの日本語ラベル(画像alt等で使用) */
export const SUB_LABELS = {
  meat: "肉", seafood: "海鮮", rice: "米", vegetable: "野菜", fruit: "果物",
  sweets: "スイーツ", drink: "飲料", processed: "加工品",
  daily: "日用品", goods: "雑貨", kitchen: "キッチン用品", appliance: "家電", interior: "インテリア",
  stay: "宿泊", voucher: "旅行券", meal: "食事", leisure: "レジャー", activity: "体験"
};
