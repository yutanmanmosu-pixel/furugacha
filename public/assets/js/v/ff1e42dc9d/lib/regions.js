// @ts-check
// 地方区分と都道府県の定義(UI・URL・データ絞り込みで共用)

/** @typedef {{slug:string,name:string,prefs:string[]}} Region */
/** @typedef {{slug:string,name:string,code:string,region:string}} Prefecture */

/** @type {Region[]} 地方区分(北から) */
export const REGIONS = [
  { slug: "hokkaido", name: "北海道", prefs: ["北海道"] },
  { slug: "tohoku",   name: "東北",   prefs: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { slug: "kanto",    name: "関東",   prefs: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { slug: "chubu",    name: "中部",   prefs: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { slug: "kinki",    name: "近畿",   prefs: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { slug: "chugoku",  name: "中国",   prefs: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] },
  { slug: "shikoku",  name: "四国",   prefs: ["徳島県", "香川県", "愛媛県", "高知県"] },
  { slug: "kyushu",   name: "九州",   prefs: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"] },
  { slug: "okinawa",  name: "沖縄",   prefs: ["沖縄県"] }
];

/** @type {Prefecture[]} 47都道府県(JISコード順) */
export const PREFECTURES = [
  { slug: "hokkaido",  name: "北海道",   code: "01", region: "北海道" },
  { slug: "aomori",    name: "青森県",   code: "02", region: "東北" },
  { slug: "iwate",     name: "岩手県",   code: "03", region: "東北" },
  { slug: "miyagi",    name: "宮城県",   code: "04", region: "東北" },
  { slug: "akita",     name: "秋田県",   code: "05", region: "東北" },
  { slug: "yamagata",  name: "山形県",   code: "06", region: "東北" },
  { slug: "fukushima", name: "福島県",   code: "07", region: "東北" },
  { slug: "ibaraki",   name: "茨城県",   code: "08", region: "関東" },
  { slug: "tochigi",   name: "栃木県",   code: "09", region: "関東" },
  { slug: "gunma",     name: "群馬県",   code: "10", region: "関東" },
  { slug: "saitama",   name: "埼玉県",   code: "11", region: "関東" },
  { slug: "chiba",     name: "千葉県",   code: "12", region: "関東" },
  { slug: "tokyo",     name: "東京都",   code: "13", region: "関東" },
  { slug: "kanagawa",  name: "神奈川県", code: "14", region: "関東" },
  { slug: "niigata",   name: "新潟県",   code: "15", region: "中部" },
  { slug: "toyama",    name: "富山県",   code: "16", region: "中部" },
  { slug: "ishikawa",  name: "石川県",   code: "17", region: "中部" },
  { slug: "fukui",     name: "福井県",   code: "18", region: "中部" },
  { slug: "yamanashi", name: "山梨県",   code: "19", region: "中部" },
  { slug: "nagano",    name: "長野県",   code: "20", region: "中部" },
  { slug: "gifu",      name: "岐阜県",   code: "21", region: "中部" },
  { slug: "shizuoka",  name: "静岡県",   code: "22", region: "中部" },
  { slug: "aichi",     name: "愛知県",   code: "23", region: "中部" },
  { slug: "mie",       name: "三重県",   code: "24", region: "近畿" },
  { slug: "shiga",     name: "滋賀県",   code: "25", region: "近畿" },
  { slug: "kyoto",     name: "京都府",   code: "26", region: "近畿" },
  { slug: "osaka",     name: "大阪府",   code: "27", region: "近畿" },
  { slug: "hyogo",     name: "兵庫県",   code: "28", region: "近畿" },
  { slug: "nara",      name: "奈良県",   code: "29", region: "近畿" },
  { slug: "wakayama",  name: "和歌山県", code: "30", region: "近畿" },
  { slug: "tottori",   name: "鳥取県",   code: "31", region: "中国" },
  { slug: "shimane",   name: "島根県",   code: "32", region: "中国" },
  { slug: "okayama",   name: "岡山県",   code: "33", region: "中国" },
  { slug: "hiroshima", name: "広島県",   code: "34", region: "中国" },
  { slug: "yamaguchi", name: "山口県",   code: "35", region: "中国" },
  { slug: "tokushima", name: "徳島県",   code: "36", region: "四国" },
  { slug: "kagawa",    name: "香川県",   code: "37", region: "四国" },
  { slug: "ehime",     name: "愛媛県",   code: "38", region: "四国" },
  { slug: "kochi",     name: "高知県",   code: "39", region: "四国" },
  { slug: "fukuoka",   name: "福岡県",   code: "40", region: "九州" },
  { slug: "saga",      name: "佐賀県",   code: "41", region: "九州" },
  { slug: "nagasaki",  name: "長崎県",   code: "42", region: "九州" },
  { slug: "kumamoto",  name: "熊本県",   code: "43", region: "九州" },
  { slug: "oita",      name: "大分県",   code: "44", region: "九州" },
  { slug: "miyazaki",  name: "宮崎県",   code: "45", region: "九州" },
  { slug: "kagoshima", name: "鹿児島県", code: "46", region: "九州" },
  { slug: "okinawa",   name: "沖縄県",   code: "47", region: "沖縄" }
];

/** @param {string} slug */
export function regionBySlug(slug) { return REGIONS.find((r) => r.slug === slug) ?? null; }
/** @param {string} slug */
export function prefBySlug(slug) { return PREFECTURES.find((p) => p.slug === slug) ?? null; }
/** @param {string} name */
export function prefByName(name) { return PREFECTURES.find((p) => p.name === name) ?? null; }
