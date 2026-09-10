// @ts-check
// サイト共通の型定義(JSDoc)。UIは楽天固有レスポンスに依存せず、この共通Product型のみを扱う。

/**
 * @typedef {Object} Municipality
 * @property {string} prefecture      都道府県名 (例: "福岡県")
 * @property {string} municipality    自治体名 (例: "糸島市")
 * @property {string} municipalityCode 全国地方公共団体コード6桁 (例: "402303")
 * @property {string} region          地方区分 (例: "九州")
 */

/**
 * @typedef {Object} Product
 * @property {string} id              一意ID (楽天: itemCode / モック: mock:...)
 * @property {string} municipality    自治体名
 * @property {string} prefecture      都道府県名
 * @property {string} title           返礼品名
 * @property {number} amount          寄附額(円)
 * @property {string} [imageUrl]      商品画像URL
 * @property {string} productUrl      通常の商品/検索URL
 * @property {string} [affiliateUrl]  アフィリエイトURL(設定時のみ)
 * @property {string} [category]      カテゴリ (random|food|life|travel)
 * @property {string} [subCategory]   サブカテゴリ (meat, rice, ...)
 * @property {boolean} [isMock]       モックデータかどうか
 * @property {string} [shopName]      店舗名(楽天)
 */

/**
 * ガチャ範囲
 * @typedef {{type:"all"}|{type:"region",slug:string}|{type:"prefecture",slug:string}} GachaScope
 */

export {};
