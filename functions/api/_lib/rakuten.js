// @ts-check
// 楽天市場商品検索API v2026-07-01 との通信。
// エンドポイント: https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701
// 認証: applicationId + accessKey(公式仕様: header / query いずれも可)。
//   ※本実装は accessKey を【クエリパラメータ】で送る。理由:
//     - 楽天公式 API Test Form が生成する成功リクエストと同一形式(実証済みの形)。
//     - fetch仕様によりカスタムヘッダー名はワイヤ上で小文字化(accesskey)されるため、
//       ヘッダー方式は上流の解釈に依存する。クエリ方式は解釈差が生じない。
// 【秘密保持】組み立てたURLには資格情報が含まれる。URL・creds・envを
//   console / エラーメッセージ / レスポンス に出力することを禁止する(このファイル内で完結)。
// 参照: https://webservice.rakuten.co.jp/documentation/ichiba-item-search

export const RAKUTEN_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

/** カテゴリ → 検索キーワード補助語(public/assets/js/lib/categories.js と対応) */
export const CATEGORY_KEYWORDS = {
  random: "",
  food: "食品",
  life: "日用品 雑貨",
  travel: "旅行 宿泊 体験"
};

/** Cloudflare Workersのfetchは既定でUser-Agentを送らないため明示する(UA無し拒否対策・素性明示) */
export const USER_AGENT = "furugacha/1.0 (+https://furugacha.jp)";

/**
 * 楽天アプリ設定「Allowed websites」(furugacha.jp登録済み)によるアクセス制御対策。
 * 本番ログで 403 かつエラーボディ空(APIロジック手前=エッジ層での拒否)を確認したため、
 * 呼び出し元サイトを Origin / Referer で明示する。サーバー間通信では既定で両ヘッダーが
 * 送られず、登録サイト照合に失敗し得る。値は公開情報のみ(秘密は含まない)。
 */
export const RAKUTEN_ORIGIN = "https://furugacha.jp";
export const RAKUTEN_REFERER = "https://furugacha.jp/";

/**
 * 楽天APIを1回呼ぶ。
 * @param {{RAKUTEN_APPLICATION_ID:string, RAKUTEN_ACCESS_KEY:string, RAKUTEN_AFFILIATE_ID?:string}} creds
 * @param {Record<string,string>} query
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [opts] テスト用の注入口(本番は省略)
 * @returns {Promise<any>} パース済みJSON(2xxかつJSON不正時はnull)
 */
export async function callRakuten(creds, query, opts = {}) {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = new URL(RAKUTEN_ENDPOINT);
  url.searchParams.set("applicationId", creds.RAKUTEN_APPLICATION_ID);
  url.searchParams.set("accessKey", creds.RAKUTEN_ACCESS_KEY); // 公式Test Formと同じくクエリで送信
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  if (creds.RAKUTEN_AFFILIATE_ID) url.searchParams.set("affiliateId", creds.RAKUTEN_AFFILIATE_ID);
  for (const [k, v] of Object.entries(query)) if (v !== "") url.searchParams.set(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8_000);
  try {
    const res = await doFetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
        origin: RAKUTEN_ORIGIN,
        referer: RAKUTEN_REFERER
      }
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // 診断ログ: 楽天が返したstatusとerrorコード/説明のみ(URL・資格情報は絶対に出さない)
      const code = body && typeof body.error === "string" ? body.error : "";
      const desc = body && typeof body.error_description === "string" ? body.error_description.slice(0, 160) : "";
      console.error("[rakuten] upstream error", res.status, code, desc);
      const err = new Error(`Rakuten API error ${code ? `${code}: ${desc}` : `HTTP ${res.status}`}`);
      /** @type {any} */ (err).status = res.status;
      /** @type {any} */ (err).rakutenError = code;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
