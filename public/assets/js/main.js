// @ts-check
// 全ページ共通: ヘッダーのモバイルメニュー・フッターの年表示・効果音(SE)トグルとクリック音
import { soundEnabled, setSoundEnabled, playClick } from "./lib/sound.js";

const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("site-nav");
if (toggle instanceof HTMLElement && nav instanceof HTMLElement) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  });
  // メニュー内リンクを押したら閉じる
  nav.addEventListener("click", (e) => {
    if (e.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

for (const el of document.querySelectorAll("[data-year]")) {
  el.textContent = String(new Date().getFullYear());
}

// ---------- SEトグル(🔊/🔇) ----------
const seToggle = document.getElementById("se-toggle");
function renderSeToggle() {
  if (!(seToggle instanceof HTMLElement)) return;
  const on = soundEnabled();
  seToggle.setAttribute("aria-pressed", String(on));
  seToggle.setAttribute("aria-label", on ? "効果音をオフにする" : "効果音をオンにする");
  seToggle.classList.toggle("is-off", !on);
  const icon = seToggle.querySelector(".se-toggle__icon");
  if (icon) icon.textContent = on ? "🔊" : "🔇";
}
if (seToggle instanceof HTMLElement) {
  renderSeToggle(); // ページを開いただけでは音は鳴らさない(表示同期のみ)
  seToggle.addEventListener("click", () => {
    const next = !soundEnabled();
    setSoundEnabled(next);
    renderSeToggle();
    if (next) playClick(); // ONにした操作の確認音のみ。OFFは無音
  });
}

// ---------- 主要ボタンの小さなクリック音(イベント委譲) ----------
// 対象: .btn / お気に入り等のiconbtn / 範囲チップ。
// 除外: 楽天へ遷移するリンク(rakuten.co.jp / target=_blank)、テキストリンク、フォーム部品、
//       ガチャ開始系ボタン(#gacha-run / #btn-again はガチャ側の「カチッ」で鳴らすため二重防止)。
document.addEventListener("click", (e) => {
  const el = e.target instanceof Element
    ? e.target.closest("a.btn, button.btn, button.iconbtn, .scope-chips button")
    : null;
  if (!el) return;
  if (el.id === "gacha-run" || el.id === "btn-again") return;
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute("href") ?? "";
    if (el.target === "_blank" || /rakuten\.co\.jp/.test(href)) return;
  }
  playClick();
});

