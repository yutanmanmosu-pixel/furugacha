// @ts-check
// お気に入り(自治体・返礼品)。localStorageのみ・ログイン不要。
import { favMunicipalities, favProducts, toggleFavMunicipality } from "../lib/storage.js";
import { productCard, msgEl } from "./product-card.js";

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

const muniList = must("#fav-munis");
const prodGrid = must("#fav-products");

function render() {
  const munis = favMunicipalities();
  muniList.replaceChildren();
  if (munis.length === 0) {
    muniList.append(msgEl("お気に入りの自治体はまだありません。ガチャ結果の「♡ 自治体をお気に入り」から追加できます。"));
  } else {
    for (const m of munis) {
      const li = document.createElement("li");
      li.className = "fav-muni";
      const name = document.createElement("span");
      name.className = "fav-muni__name";
      name.textContent = `${m.prefecture} ${m.municipality}`;
      const view = document.createElement("a");
      view.className = "btn btn--ghost btn--sm";
      view.href = `/gacha/?code=${encodeURIComponent(m.municipalityCode)}`;
      view.textContent = "返礼品を見る";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "iconbtn";
      del.textContent = "♥";
      del.setAttribute("aria-label", `${m.municipality}をお気に入りから外す`);
      del.addEventListener("click", () => { toggleFavMunicipality(m); render(); });
      li.append(name, view, del);
      muniList.append(li);
    }
  }

  const prods = favProducts();
  prodGrid.replaceChildren();
  if (prods.length === 0) {
    prodGrid.append(msgEl("お気に入りの返礼品はまだありません。返礼品カードの「♡」から追加できます。"));
  } else {
    for (const p of prods) prodGrid.append(productCard(p, { onFavChange: (on) => { if (!on) render(); } }));
  }
}
render();
