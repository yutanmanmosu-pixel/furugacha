import { test } from "node:test";
import assert from "node:assert/strict";
import { getProductDestinationUrl, ctaLabel } from "../public/assets/js/lib/product-link.js";

test("affiliateUrlがあれば優先", () => {
  assert.equal(getProductDestinationUrl({ productUrl: "https://a", affiliateUrl: "https://hb.afl.rakuten.co.jp/x" }), "https://hb.afl.rakuten.co.jp/x");
});
test("なければ通常URL(疑似パラメータを付加しない)", () => {
  assert.equal(getProductDestinationUrl({ productUrl: "https://item.rakuten.co.jp/a/" }), "https://item.rakuten.co.jp/a/");
});
test("httpsでないaffiliateUrlは無視", () => {
  assert.equal(getProductDestinationUrl({ productUrl: "https://a", affiliateUrl: "javascript:alert(1)" }), "https://a");
});
test("CTAラベル: モックは『探す』表記", () => {
  assert.equal(ctaLabel({ isMock: true }), "楽天ふるさと納税で探す");
  assert.equal(ctaLabel({ isMock: false }), "楽天ふるさと納税で見る");
});
