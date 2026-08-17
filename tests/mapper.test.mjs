import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRakutenItem, pickImage, isFurusatoShopOf } from "../functions/api/_lib/mapper.js";

const ctx = { municipality: "糸島市", prefecture: "福岡県" };

test("formatVersion=2(フラット)を変換できる", () => {
  const p = mapRakutenItem({
    itemName: "テスト返礼品", itemPrice: 10000, itemCode: "shop:123",
    itemUrl: "https://item.rakuten.co.jp/x/y/",
    affiliateUrl: "https://hb.afl.rakuten.co.jp/...",
    mediumImageUrls: ["https://thumbnail.image.rakuten.co.jp/img.jpg?_ex=128x128"],
    shopCode: "f402303-itoshima", shopName: "福岡県糸島市"
  }, ctx);
  assert.equal(p.title, "テスト返礼品");
  assert.equal(p.amount, 10000);
  assert.equal(p.municipality, "糸島市");
  assert.ok(p.affiliateUrl.startsWith("https://"));
  assert.match(p.imageUrl, /_ex=400x400/);
  assert.equal(p.isMock, false);
});

test("formatVersion=1(item入れ子・imageUrlオブジェクト)にも耐える", () => {
  const p = mapRakutenItem({ item: {
    itemName: "A", itemPrice: "5000", itemUrl: "https://item.rakuten.co.jp/a/",
    mediumImageUrls: [{ imageUrl: "https://thumbnail.image.rakuten.co.jp/i.jpg?_ex=128x128" }]
  } }, ctx);
  assert.equal(p.amount, 5000);
  assert.match(p.imageUrl, /400x400/);
});

test("不正レスポンスはnull(落ちない)", () => {
  assert.equal(mapRakutenItem(null, ctx), null);
  assert.equal(mapRakutenItem({}, ctx), null);
  assert.equal(mapRakutenItem({ itemName: "x", itemPrice: -1, itemUrl: "https://a" }, ctx), null);
});

test("affiliateUrl未提供でもproductUrlで成立(未登録時の安全動作)", () => {
  const p = mapRakutenItem({ itemName: "B", itemPrice: 8000, itemUrl: "https://item.rakuten.co.jp/b/" }, ctx);
  assert.equal(p.affiliateUrl, undefined);
  assert.equal(p.productUrl, "https://item.rakuten.co.jp/b/");
});

test("ふるさと納税ショップ判定(f+自治体コード)", () => {
  assert.ok(isFurusatoShopOf({ shopCode: "f402303-itoshima" }, "402303"));
  assert.ok(!isFurusatoShopOf({ shopCode: "some-shop" }, "402303"));
});

test("pickImage: https以外は使わない", () => {
  assert.equal(pickImage({ mediumImageUrls: ["http://insecure/img.jpg"] }), undefined);
});
