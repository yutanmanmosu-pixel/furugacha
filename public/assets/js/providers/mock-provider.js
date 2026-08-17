// @ts-check
// 楽天未登録でも全機能が動くモック実装(指示書33,43)。
// 実在商品を騙らないよう、明確に「サンプル」と分かる汎用名のみ生成する。
// 自治体コードをシードにした決定的乱数で、同じ自治体には毎回同じサンプル一覧を返す。

import { CATEGORIES, SUB_LABELS } from "../lib/categories.js";
import { loadMunicipalities } from "../lib/data.js";

/** @typedef {import("../lib/types.js").Product} Product */

/** mulberry32: 軽量シード付き乱数 @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** サンプル返礼品テンプレート: [サブカテゴリ, 品名, 最低額, 最高額] */
const TEMPLATES = /** @type {const} */ ([
  ["meat", "牛肉 切り落とし 1.2kg", 10000, 30000],
  ["meat", "豚肉 小分けセット 2kg", 8000, 16000],
  ["meat", "鶏もも肉 3kg", 5000, 12000],
  ["seafood", "旬の海鮮セット", 12000, 30000],
  ["seafood", "干物詰め合わせ", 8000, 15000],
  ["rice", "お米 10kg", 10000, 20000],
  ["rice", "お米 5kg", 6000, 12000],
  ["vegetable", "季節の野菜セット", 5000, 12000],
  ["fruit", "旬の果物 約2kg", 8000, 20000],
  ["sweets", "銘菓詰め合わせ", 6000, 15000],
  ["drink", "地元飲料セット", 8000, 16000],
  ["processed", "ご当地加工品セット", 5000, 12000],
  ["daily", "日用品まとめセット", 8000, 15000],
  ["goods", "クラフト雑貨", 5000, 15000],
  ["kitchen", "キッチン用品", 10000, 30000],
  ["appliance", "生活家電", 30000, 100000],
  ["interior", "インテリア小物", 8000, 25000],
  ["stay", "宿泊クーポン", 30000, 100000],
  ["voucher", "旅行クーポン", 20000, 100000],
  ["meal", "お食事券", 10000, 30000],
  ["leisure", "レジャー利用券", 8000, 30000],
  ["activity", "体験プログラム", 8000, 30000]
]);

/** @param {string} sub */
function catOf(sub) {
  for (const c of CATEGORIES) if (c.subs.includes(sub)) return c.id;
  return "food";
}

/**
 * 1自治体分のサンプル返礼品を決定的に生成。
 * @param {import("../lib/types.js").Municipality} m
 * @param {number} count
 * @returns {Product[]}
 */
export function generateMockProducts(m, count = 8) {
  const rng = mulberry32(Number(m.municipalityCode) * 7919 + 17);
  const order = TEMPLATES.map((t, i) => ({ t, k: rng() + i * 1e-9 })).sort((a, b) => a.k - b.k).map((x) => x.t);
  /** @type {Product[]} */
  const out = [];
  for (let i = 0; i < Math.min(count, order.length); i++) {
    const tpl = order[i];
    if (!tpl) break;
    const [sub, name, min, max] = tpl;
    const amount = Math.round((min + rng() * (max - min)) / 1000) * 1000;
    const searchUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(`ふるさと納税 ${m.municipality}`)}/`;
    out.push({
      id: `mock:${m.municipalityCode}:${sub}:${i}`,
      municipality: m.municipality,
      prefecture: m.prefecture,
      title: `【サンプル】${name}(${SUB_LABELS[/** @type {keyof typeof SUB_LABELS} */ (sub)] ?? ""}) — お礼の品イメージ`,
      amount,
      imageUrl: `/assets/img/mock/${sub}.svg`,
      productUrl: searchUrl,
      category: catOf(sub),
      subCategory: sub,
      isMock: true
    });
  }
  return out;
}

// FurusatoProductProvider 実装(モック)
export class MockFurusatoProductProvider {
  /** @param {{municipality:string, prefecture:string, municipalityCode:string, limit?:number}} q */
  async searchByMunicipality(q) {
    const m = { municipality: q.municipality, prefecture: q.prefecture, municipalityCode: q.municipalityCode, region: "" };
    return generateMockProducts(m, q.limit ?? 8);
  }

  /** @param {{budget:number, category:string, limit?:number}} q */
  async searchByBudget(q) {
    const { municipalities } = await loadMunicipalities();
    const rng = Math.random;
    /** @type {Product[]} */
    const pool = [];
    // ランダムな自治体からサンプル生成し、カテゴリと予算で絞り込む
    const shuffledMunis = municipalities.slice().sort(() => rng() - 0.5).slice(0, 40);
    for (const m of shuffledMunis) {
      for (const p of generateMockProducts(m, 8)) {
        if (q.category !== "random" && p.category !== q.category) continue;
        if (p.amount > q.budget) continue;
        pool.push(p);
      }
    }
    return pool.slice(0, q.limit ?? 120);
  }
}
