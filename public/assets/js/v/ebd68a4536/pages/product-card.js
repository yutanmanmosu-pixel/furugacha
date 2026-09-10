// @ts-check
// 返礼品カードの共通描画(自治体ガチャ・予算ガチャ・お気に入りで共用)。
// XSS対策: ユーザー・API由来の文字列はすべて textContent で挿入する。

import { getProductDestinationUrl, ctaLabel } from "../lib/product-link.js";
import { yen } from "../lib/format.js";
import { toggleFavProduct, isFavProduct } from "../lib/storage.js";

/** @typedef {import("../lib/types.js").Product} Product */

/**
 * @param {Product} p
 * @param {{onFavChange?: (on:boolean)=>void}} [opts]
 * @returns {HTMLElement}
 */
export function productCard(p, opts = {}) {
  const card = document.createElement("article");
  card.className = "product-card";

  const media = document.createElement("div");
  media.className = "product-card__media";
  if (p.imageUrl) {
    const img = document.createElement("img");
    img.src = p.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.width = 400; img.height = 400;
    img.addEventListener("error", () => { media.replaceChildren(fallbackThumb()); });
    media.append(img);
  } else {
    media.append(fallbackThumb());
  }
  if (p.isMock) {
    const badge = document.createElement("span");
    badge.className = "badge badge--sample";
    badge.textContent = "サンプル";
    media.append(badge);
  }

  const body = document.createElement("div");
  body.className = "product-card__body";
  const title = document.createElement("h4");
  title.className = "product-card__title";
  title.textContent = p.title;
  const meta = document.createElement("p");
  meta.className = "product-card__meta";
  meta.textContent = p.municipality ? `${p.prefecture}${p.municipality}` : (p.shopName ?? "");
  const price = document.createElement("p");
  price.className = "product-card__price";
  const strong = document.createElement("strong");
  strong.textContent = yen(p.amount);
  price.append("寄附額 ", strong);

  const actions = document.createElement("div");
  actions.className = "product-card__actions";
  const link = document.createElement("a");
  link.className = "btn btn--rakuten";
  link.href = getProductDestinationUrl(p);
  link.target = "_blank";
  link.rel = "sponsored noopener noreferrer";
  link.textContent = ctaLabel(p);
  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "iconbtn";
  const paint = (/** @type {boolean} */ on) => {
    fav.textContent = on ? "♥" : "♡";
    fav.setAttribute("aria-pressed", String(on));
    fav.setAttribute("aria-label", on ? "お気に入りから外す" : "返礼品をお気に入りに追加");
  };
  paint(isFavProduct(p));
  fav.addEventListener("click", () => {
    const on = toggleFavProduct(p);
    paint(on);
    opts.onFavChange?.(on);
  });
  actions.append(link, fav);

  body.append(title, meta, price, actions);
  card.append(media, body);
  return card;
}

export function fallbackThumb() {
  const d = document.createElement("div");
  d.className = "product-card__noimg";
  d.setAttribute("aria-hidden", "true");
  d.textContent = "🎁";
  return d;
}

export function loadingEl() {
  const d = document.createElement("p");
  d.className = "loading";
  d.textContent = "返礼品を探しています…";
  return d;
}

/** @param {string} text */
export function msgEl(text) {
  const d = document.createElement("p");
  d.className = "note";
  d.textContent = text;
  return d;
}
