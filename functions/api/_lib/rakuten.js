// @ts-check
// 楽天市場商品検索API v2026-07-01 との通信。
// エンドポイント: https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701
// 必須: applicationId + accessKey(ヘッダー可) / 任意: affiliateId(付与するとaffiliateUrlが返る)
// 参照: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
// 注意: 旧 20220601 版は2026-08-17で廃止済み。仕様変更時はこのファイルとmapper.jsのみ修正する。

export const RAKUTEN_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

/** カテゴリ → 検索キーワード補助語(public/assets/js/lib/categories.js と対応) */
export const CATEGORY_KEYWORDS = {
  random: "",
  food: "食品",
  life: "日用品 雑貨",
  travel: "旅行 宿泊 体験"
};

/**
 * 楽天APIを1回呼ぶ。
 * @param {{RAKUTEN_APPLICATION_ID:string, RAKUTEN_ACCESS_KEY:string, RAKUTEN_AFFILIATE_ID?:string}} creds
 * @param {Record<string,string>} query
 * @returns {Promise<any>} パース済みJSON
 */
export async function callRakuten(creds, query) {
  const url = new URL(RAKUTEN_ENDPOINT);
  url.searchParams.set("applicationId", creds.RAKUTEN_APPLICATION_ID);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  if (creds.RAKUTEN_AFFILIATE_ID) url.searchParams.set("affiliateId", creds.RAKUTEN_AFFILIATE_ID);
  for (const [k, v] of Object.entries(query)) if (v !== "") url.searchParams.set(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        // accessKeyはURLに載せずヘッダーで送る(ログ露出を避ける)
        accessKey: creds.RAKUTEN_ACCESS_KEY,
        accept: "application/json"
      }
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body && body.error ? `${body.error}: ${body.error_description ?? ""}` : `HTTP ${res.status}`;
      const err = new Error(`Rakuten API error ${msg}`);
      /** @type {any} */ (err).status = res.status;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
