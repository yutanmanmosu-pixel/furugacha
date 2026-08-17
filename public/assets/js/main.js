// @ts-check
// 全ページ共通: ヘッダーのモバイルメニュー・フッターの年表示

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
