// @ts-check
// 楽天市場商品検索API(v2026-07-01)のレスポンスをサイト共通のProduct型へ変換する層。
// 楽天API仕様が変わってもUI全体は変更不要(この層だけ直す)。
// formatVersion=1(items[].item)と2(items[]フラット)の両形式に耐えるよう防御的に書く。

/**
 * @param {any} raw 楽天APIのitem(v1のラップ/ v2のフラット両対応)
 * @param {{municipality:string, prefecture:string, category?:string}} ctx
 * @returns {import("../../../public/assets/js/lib/types.js").Product | null}
 */
export function mapRakutenItem(raw, ctx) {
  const item = raw && typeof raw === "object" && "item" in raw ? raw.item : raw;
  if (!item || typeof item !== "object") return null;
  const title = typeof item.itemName === "string" ? item.itemName : null;
  const price = Number(item.itemPrice);
  const productUrl = typeof item.itemUrl === "string" ? item.itemUrl : null;
  if (!title || !productUrl || !Number.isFinite(price) || price <= 0) return null;

  const affiliateUrl = typeof item.affiliateUrl === "string" && item.affiliateUrl.startsWith("https://")
    ? item.affiliateUrl : undefined;

  return {
    id: typeof item.itemCode === "string" ? item.itemCode : `rakuten:${hash(productUrl)}`,
    municipality: ctx.municipality,
    prefecture: ctx.prefecture,
    title,
    amount: Math.floor(price),
    imageUrl: pickImage(item),
    productUrl,
    ...(affiliateUrl ? { affiliateUrl } : {}),
    ...(ctx.category ? { category: ctx.category } : {}),
    ...(typeof item.shopName === "string" ? { shopName: item.shopName } : {}),
    isMock: false
  };
}

/**
 * mediumImageUrls は v1で [{imageUrl}] / v2で [string]。どちらでも取り出す。
 * 128px画像URLの _ex パラメータを 400x400 に引き上げる(楽天が公式にサポートするサイズ指定)。
 * @param {any} item
 * @returns {string | undefined}
 */
export function pickImage(item) {
  const arr = Array.isArray(item.mediumImageUrls) ? item.mediumImageUrls : [];
  const first = arr[0];
  const url = typeof first === "string" ? first
    : first && typeof first.imageUrl === "string" ? first.imageUrl : undefined;
  if (!url || !url.startsWith("https://")) return undefined;
  return url.replace(/_ex=\d+x\d+/, "_ex=400x400");
}

/**
 * 楽天ふるさと納税の出店shopCodeは「f + 自治体コード6桁 + -名称」形式。
 * 自治体コードで結果を絞る際に使う。
 * @param {any} item @param {string} municipalityCode
 */
export function isFurusatoShopOf(item, municipalityCode) {
  const shopCode = typeof item?.shopCode === "string" ? item.shopCode
    : typeof item?.item?.shopCode === "string" ? item.item.shopCode : "";
  return shopCode.startsWith(`f${municipalityCode}`);
}

/** @param {string} s */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
