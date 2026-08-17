// @ts-check
// クライアントが現在のモード(mock/rakuten)を知るためのエンドポイント。秘密情報は一切返さない。

/** @param {{env: Record<string, string|undefined>}} ctx */
export function onRequestGet({ env }) {
  const hasCreds = !!(env.RAKUTEN_APPLICATION_ID && env.RAKUTEN_ACCESS_KEY);
  const mockMode = String(env.MOCK_MODE ?? "").toLowerCase() === "true";
  const mode = hasCreds && !mockMode ? "rakuten" : "mock";
  return new Response(JSON.stringify({ mode, hasAffiliate: !!env.RAKUTEN_AFFILIATE_ID }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
