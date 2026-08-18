// @ts-check
// メイン機能「自治体ガチャ」の画面制御。トップページと /gacha/ で共用。
// 抽選ロジックは lib/gacha.js(純関数)、データ取得は providers 経由。

import { loadMunicipalities, findMunicipalityByCode } from "../lib/data.js";
import { filterByScope, drawMunicipality, scopeLabel, scopeFromParams, scopeToQuery, rouletteNames } from "../lib/gacha.js";
import { REGIONS, PREFECTURES, prefByName } from "../lib/regions.js";
import { renderTileMap } from "../lib/japan-map.js";
import { muniNote } from "../lib/muni-notes.js";
import { getProvider, fetchStatus } from "../providers/index.js";
import { toggleFavMunicipality, isFavMunicipality, pushGachaHistory } from "../lib/storage.js";
import { productCard, loadingEl, msgEl } from "./product-card.js";
import { playGachaStart, playRattle, playLand } from "../lib/sound.js";
import { PRODUCT_FETCH_LIMIT, splitProducts, moreLabel } from "../lib/product-paging.js";
import { shareResult } from "../lib/share.js";

/** @typedef {import("../lib/types.js").Municipality} Municipality */
/** @typedef {import("../lib/types.js").GachaScope} GachaScope */
/** @typedef {import("../lib/types.js").Product} Product */

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

const els = {
  form: must("#scope-form"),
  typeRadios: /** @type {HTMLInputElement[]} */ ([...document.querySelectorAll('input[name="scope-type"]')]),
  regionWrap: must("#scope-region-wrap"),
  prefWrap: must("#scope-pref-wrap"),
  regionSelect: /** @type {HTMLSelectElement} */ (must("#scope-region")),
  prefSelect: /** @type {HTMLSelectElement} */ (must("#scope-pref")),
  chips: must("#scope-chips"),
  count: must("#scope-count"),
  mapPreview: must("#scope-map"),
  run: /** @type {HTMLButtonElement} */ (must("#gacha-run")),
  stage: must("#gacha-stage"),
  slot: must("#gacha-slot"),
  status: must("#gacha-status"),
  confetti: must("#gacha-confetti"),
  result: must("#gacha-result"),
  resultScope: must("#result-scope"),
  resultPref: must("#result-pref"),
  resultMuni: must("#result-muni"),
  resultNote: must("#result-note"),
  resultGenres: must("#result-genres"),
  resultMap: must("#result-map"),
  btnAgain: /** @type {HTMLButtonElement} */ (must("#btn-again")),
  btnChange: /** @type {HTMLButtonElement} */ (must("#btn-change")),
  btnFav: /** @type {HTMLButtonElement} */ (must("#btn-fav-muni")),
  btnShare: /** @type {HTMLButtonElement} */ (must("#btn-share")),
  shareDone: must("#share-done"),
  rakutenLink: /** @type {HTMLAnchorElement} */ (must("#result-rakuten-link")),
  products: must("#products"),
  productsTitle: must("#products-title-name"),
  prBadge: must("#pr-badge"),
  productsNote: must("#products-note"),
  productsGrid: must("#products-grid"),
  productsMore: /** @type {HTMLButtonElement} */ (must("#products-more-btn"))
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 減速カーブ(ms): 高速 → 中速 → 減速 → 最後の数候補。最終要素は停止側で扱うため未使用。 */
const SPIN_DELAYS = [52, 52, 52, 52, 52, 56, 62, 70, 80, 92, 106, 124, 146, 172, 205, 248, 305, 370];
/** カラカラSEを鳴らすtickの位置(全7回)。既存のSPIN_DELAYSの間隔に便乗するため、
 *  高速中は短い間隔・減速に合わせて自然に間隔が開く。アニメーション自体は不変更。 */
const RATTLE_AT = new Set([0, 3, 6, 9, 12, 14, 16]);

/** 回転中にマシン周囲へ小さな光を出す(reduced-motion時は呼ばれない) */
function spawnSparks() {
  clearSparks();
  for (let i = 0; i < 7; i++) {
    const sp = document.createElement("span");
    sp.className = "gm-spark";
    sp.style.left = `${16 + Math.random() * 68}%`;
    sp.style.top = `${4 + Math.random() * 46}%`;
    sp.style.animationDelay = `${(Math.random() * 0.9).toFixed(2)}s`;
    els.stage.append(sp);
  }
}
function clearSparks() {
  for (const sp of els.stage.querySelectorAll(".gm-spark")) sp.remove();
}
const PREF_NAME_BY_CODE = Object.fromEntries(PREFECTURES.map((p) => [p.code, p.name]));

/** @type {Municipality[]} */
let all = [];
/** @type {GachaScope} */
let scope = { type: "all" };
/** @type {Municipality | null} */
let current = null;
let spinning = false;
/** この結果を生んだ範囲(演出中にUIで範囲を変えても結果表示とURLは一致させる) @type {GachaScope} */
let resultScopeState = { type: "all" };
/** 返礼品取得の世代トークン(連続ガチャ時に古い応答でUIを上書きしない) */
let loadSeq = 0;
let revealTimer = 0;
/** 追加表示待ちの返礼品(loadProductsで取得済み。ボタンは描画のみ行い再通信しない) @type {Product[]} */
let pendingRest = [];
let confettiTimer = 0;
let shareTimer = 0;

init().catch((e) => {
  console.error(e);
  els.count.textContent = "データの読み込みに失敗しました。再読み込みしてください。";
});

async function init() {
  fillSelects();
  const params = new URLSearchParams(location.search);
  scope = scopeFromParams(params);
  syncScopeUi();

  const { municipalities } = await loadMunicipalities();
  all = municipalities;
  updateCount();

  // 範囲UIのイベント
  for (const r of els.typeRadios) r.addEventListener("change", onScopeUiChange);
  els.regionSelect.addEventListener("change", onScopeUiChange);
  els.prefSelect.addEventListener("change", onScopeUiChange);
  els.chips.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-region]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    const slug = btn.dataset.region ?? "";
    scope = slug === "all" ? { type: "all" } : { type: "region", slug };
    syncScopeUi();
    updateCount();
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    void runGacha();
  });
  els.productsMore.addEventListener("click", () => {
    if (pendingRest.length === 0) return;
    const frag = document.createDocumentFragment();
    for (const p of pendingRest) frag.append(productCard(p));
    els.productsGrid.append(frag);
    pendingRest = [];
    els.productsMore.hidden = true;
  });

  els.btnAgain.addEventListener("click", () => {
    if (current) { scope = resultScopeState; syncScopeUi(); updateCount(); } // ラベル通り「同じ範囲」を保証
    void runGacha();
  });
  els.btnChange.addEventListener("click", () => {
    els.result.hidden = true;
    els.products.hidden = true;
    els.stage.hidden = true;
    must("#gacha").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    els.typeRadios[0]?.focus();
  });
  els.btnFav.addEventListener("click", () => {
    if (!current) return;
    const on = toggleFavMunicipality(current);
    paintFavButton(on);
  });
  els.btnShare.addEventListener("click", async () => {
    if (!current) return;
    const r = await shareResult(current);
    els.shareDone.textContent = r === "copied" ? "リンクをコピーしました" : r === "failed" ? "共有できませんでした" : "";
    if (r !== "shared") { clearTimeout(shareTimer); shareTimer = setTimeout(() => { els.shareDone.textContent = ""; }, 3000); }
  });

  // 共有リンク(?code=)からの直接表示
  const code = params.get("code");
  if (code && /^\d{6}$/.test(code)) {
    const m = await findMunicipalityByCode(code);
    if (m) {
      const pref = prefByName(m.prefecture);
      if (pref) scope = { type: "prefecture", slug: pref.slug };
      syncScopeUi();
      updateCount();
      resultScopeState = scope;
      await showResult(m, { animate: false, recordHistory: false });
    }
  }
}

function fillSelects() {
  for (const r of REGIONS) {
    const o = document.createElement("option");
    o.value = r.slug; o.textContent = r.name;
    els.regionSelect.append(o);
  }
  for (const p of PREFECTURES) {
    const o = document.createElement("option");
    o.value = p.slug; o.textContent = p.name;
    els.prefSelect.append(o);
  }
}

/** UI → scope */
function onScopeUiChange() {
  const t = els.typeRadios.find((r) => r.checked)?.value ?? "all";
  if (t === "region") scope = { type: "region", slug: els.regionSelect.value || "hokkaido" };
  else if (t === "prefecture") scope = { type: "prefecture", slug: els.prefSelect.value || "hokkaido" };
  else scope = { type: "all" };
  syncScopeUi();
  updateCount();
}

/** scope → UI */
function syncScopeUi() {
  for (const r of els.typeRadios) r.checked = r.value === scope.type;
  els.regionWrap.hidden = scope.type !== "region";
  els.prefWrap.hidden = scope.type !== "prefecture";
  if (scope.type === "region") els.regionSelect.value = scope.slug;
  if (scope.type === "prefecture") els.prefSelect.value = scope.slug;
  for (const b of els.chips.querySelectorAll("button")) {
    const active = (scope.type === "all" && b.dataset.region === "all") ||
      (scope.type === "region" && b.dataset.region === scope.slug);
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", String(active));
  }
}

/** 抽選演出中は範囲変更UIをロックする(結果と表示範囲の不一致防止) @param {boolean} on */
function setScopeControlsDisabled(on) {
  for (const r of els.typeRadios) r.disabled = on;
  els.regionSelect.disabled = on;
  els.prefSelect.disabled = on;
  for (const b of els.chips.querySelectorAll("button")) b.disabled = on;
}

function updateCount() {
  const pool = filterByScope(all, scope);
  els.count.textContent = `対象範囲: ${scopeLabel(scope)}(${pool.length}自治体)`;
  const active = new Set(pool.map((m) => prefByName(m.prefecture)?.code ?? ""));
  renderTileMap(els.mapPreview, { activeCodes: active, prefNames: PREF_NAME_BY_CODE });
  els.run.disabled = pool.length === 0;
}

async function runGacha() {
  if (spinning) return;
  const pool = filterByScope(all, scope);
  const winner = drawMunicipality(all, scope); // 演出前に当選を確定(等確率・ロジック変更なし)
  if (!winner) {
    els.count.textContent = "この範囲には対象の自治体がありません。範囲を変えてお試しください。";
    return;
  }
  spinning = true;
  playGachaStart(); // SE: 開始の「カチッ」(タイミング・演出は不変更、音のみ)
  resultScopeState = scope; // この時点の範囲で確定(以後の表示・履歴・URLはこれを使う)
  els.run.disabled = true;
  els.btnAgain.disabled = true;
  setScopeControlsDisabled(true);
  try {
    els.result.hidden = true;
    els.products.hidden = true;
    els.stage.hidden = false;
    els.stage.classList.remove("is-landed", "is-spinning");
    els.slot.classList.remove("is-landed", "is-holding", "is-spinning");
    els.status.textContent = "抽選中…";
    els.stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    if (!reduceMotion && pool.length > 1) {
      await playRoulette(pool, winner);
    } else {
      // reduced-motion または候補1件: 演出なしで即決定表示(決定音のみ)
      els.slot.textContent = winner.municipality;
      playLand();
    }
    await showResult(winner, { animate: !reduceMotion, recordHistory: true });
  } finally {
    spinning = false;
    els.run.disabled = false;
    els.btnAgain.disabled = false;
    setScopeControlsDisabled(false);
  }
}

/**
 * 演出: 開始 → 高速切替 → 減速 → タメ → 当選自治体で停止。
 * 抽選は呼び出し前に完了しており、最終停止は必ず winner(rouletteNamesの末尾要素)。
 * @param {Municipality[]} pool @param {Municipality} winner
 */
async function playRoulette(pool, winner) {
  const names = rouletteNames(pool, winner, SPIN_DELAYS.length);
  // Phase 1: 開始 — ランプ点灯・マシン始動
  els.stage.classList.add("is-spinning");
  els.slot.classList.add("is-spinning");
  spawnSparks();
  els.slot.textContent = "抽選スタート!";
  await sleep(300);
  // Phase 2-3: 高速切替 → 減速(最後の1つ手前まで)
  for (let i = 0; i < names.length - 1; i++) {
    els.slot.textContent = names[i] ?? winner.municipality;
    if (RATTLE_AT.has(i)) playRattle(); // SE: 文字切替ごとではなく計7回のみ
    await sleep(SPIN_DELAYS[i] ?? 300);
  }
  // タメ: 止まりそうで止まらない
  els.slot.classList.add("is-holding");
  els.status.textContent = "そろそろ止まります…";
  await sleep(480);
  // Phase 4: 決定 — 必ず当選自治体で停止
  els.slot.classList.remove("is-holding", "is-spinning");
  els.stage.classList.remove("is-spinning");
  clearSparks();
  els.slot.textContent = names[names.length - 1] ?? winner.municipality;
  els.slot.classList.add("is-landed");
  els.stage.classList.add("is-landed");
  playLand(); // SE: 決定の「コトン+キラ」(1セットのみ)
  await sleep(640); // バウンス・カプセル排出・フラッシュを見せる
}

/**
 * @param {Municipality} m
 * @param {{animate:boolean, recordHistory:boolean}} opts
 */
async function showResult(m, opts) {
  current = m;
  els.stage.hidden = true;
  els.stage.classList.remove("is-spinning", "is-landed");
  els.slot.classList.remove("is-spinning", "is-holding", "is-landed");
  clearSparks();
  els.result.hidden = false;
  els.result.classList.remove("is-reveal");
  if (opts.animate) {
    void els.result.offsetWidth; // アニメーション再トリガー用リフロー
    els.result.classList.add("is-reveal");
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => els.result.classList.remove("is-reveal"), 700);
  }
  els.resultScope.textContent = `${scopeLabel(resultScopeState)}ガチャの結果`;
  els.resultPref.textContent = m.prefecture;
  els.resultMuni.textContent = m.municipality;
  els.status.textContent = `決定! 今回の運命の自治体は ${m.prefecture}${m.municipality} です`;
  els.resultNote.textContent = muniNote(m.municipalityCode) ??
    `${m.prefecture}のまち、${m.municipality}。どんな返礼品と出会えるか、下のピックアップをのぞいてみてください。`;
  const prefCode = prefByName(m.prefecture)?.code ?? "";
  renderTileMap(els.resultMap, { activeCodes: new Set([prefCode]), prefNames: PREF_NAME_BY_CODE });
  paintFavButton(isFavMunicipality(m));

  // 結果カードの緑CTAは自治体名での楽天内検索(従来仕様・非アフィリエイト)。
  // 旧「楽天ふるさと納税でもっと見る」外部リンクは2026-08-18に削除(非正規アフィ導線のため)。
  // 追加の返礼品はサイト内ボタン(#products-more-btn)で取得済みデータを描画する。
  const searchUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(`ふるさと納税 ${m.municipality}`)}/`;
  els.rakutenLink.href = searchUrl;

  // 履歴・URL(共有可能なディープリンク)
  if (opts.recordHistory) pushGachaHistory({ scopeLabel: scopeLabel(resultScopeState), municipality: m });
  const qs = scopeToQuery(resultScopeState);
  history.replaceState(null, "", `${location.pathname}?${qs ? qs + "&" : ""}code=${m.municipalityCode}`);

  if (opts.animate) burstConfetti();
  els.result.scrollIntoView({ behavior: opts.animate ? "smooth" : "auto", block: "start" });
  await loadProducts(m);
}

/** @param {boolean} on */
function paintFavButton(on) {
  els.btnFav.setAttribute("aria-pressed", String(on));
  els.btnFav.textContent = on ? "♥ お気に入り済み" : "♡ 自治体をお気に入り";
}

function burstConfetti() {
  els.confetti.replaceChildren();
  const colors = ["#F58220", "#FFC93C", "#2E7D4F", "#EF6351", "#7EC8E3"];
  for (let i = 0; i < 30; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.style.setProperty("--x", `${Math.random() * 100}%`);
    s.style.setProperty("--d", `${0.9 + Math.random() * 1.1}s`);
    s.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    s.style.setProperty("--s", `${7 + Math.random() * 7}px`);
    s.style.background = colors[i % colors.length] ?? "#F58220";
    els.confetti.append(s);
  }
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => els.confetti.replaceChildren(), 2400);
}

/** @param {Municipality} m */
async function loadProducts(m) {
  const seq = ++loadSeq;
  els.products.hidden = false;
  els.productsTitle.textContent = m.municipality;
  els.productsGrid.setAttribute("aria-busy", "true");
  els.productsGrid.replaceChildren(loadingEl());
  pendingRest = [];
  els.productsMore.hidden = true;
  try {
    const [{ provider, mode }, status] = await Promise.all([getProvider(), fetchStatus()]);
    // 1回のAPI呼び出しで最大12件取得し、初期6件+「さらに◯件」はクライアント側で出し分ける(再通信なし)
    const products = await provider.searchByMunicipality({
      municipality: m.municipality, prefecture: m.prefecture, municipalityCode: m.municipalityCode, limit: PRODUCT_FETCH_LIMIT
    });
    if (seq !== loadSeq) return; // すでに次のガチャが始まっている
    const isMock = mode === "mock" || products.every((p) => p.isMock);
    els.prBadge.hidden = !(status.hasAffiliate && !isMock);
    els.productsNote.textContent = isMock
      ? "※現在はサンプル表示です(実在の商品ではありません)。実際の返礼品はリンク先の楽天ふるさと納税でご確認ください。"
      : status.hasAffiliate
        ? "※以下には広告(楽天アフィリエイトのリンク)を含みます。寄附額・内容は必ずリンク先でご確認ください。"
        : "※楽天市場の検索結果をもとに表示しています。寄附額・内容は必ずリンク先でご確認ください。";
    renderProducts(products, m);
    renderGenres(products);
  } catch (e) {
    console.error(e);
    if (seq !== loadSeq) return;
    els.productsGrid.replaceChildren(msgEl("返礼品情報の取得に失敗しました。時間をおいて再度お試しください。"));
  } finally {
    if (seq === loadSeq) els.productsGrid.setAttribute("aria-busy", "false");
  }
}

/** @param {Product[]} products @param {Municipality} m */
function renderProducts(products, m) {
  if (products.length === 0) {
    els.productsGrid.replaceChildren(msgEl(`${m.municipality}の返礼品が見つかりませんでした。楽天ふるさと納税で直接検索してみてください。`));
    return;
  }
  const frag = document.createDocumentFragment();
  const { first, rest } = splitProducts(products);
  for (const p of first) frag.append(productCard(p));
  pendingRest = rest;
  els.productsMore.textContent = moreLabel(rest.length);
  els.productsMore.hidden = rest.length === 0;
  els.productsGrid.replaceChildren(frag);
}

/** @param {Product[]} products */
function renderGenres(products) {
  /** @type {string[]} */
  const genres = [];
  for (const p of products) {
    const g = guessGenre(p);
    if (g && !genres.includes(g)) genres.push(g);
    if (genres.length >= 3) break;
  }
  els.resultGenres.replaceChildren();
  for (const g of genres) {
    const li = document.createElement("li");
    li.textContent = g;
    els.resultGenres.append(li);
  }
  const wrap = els.resultGenres.parentElement;
  if (wrap instanceof HTMLElement) wrap.hidden = genres.length === 0;
}

const GENRE_RULES = /** @type {[string, RegExp][]} */ ([
  ["お肉", /肉|牛|豚|鶏|ハム|ソーセージ|ジビエ/],
  ["海鮮", /海鮮|魚|ほたて|ホタテ|いくら|うなぎ|えび|エビ|かに|カニ|鮭|サーモン|干物|しらす|明太/],
  ["お米", /米|ごはん|ご飯|パックライス/],
  ["果物", /果物|フルーツ|りんご|みかん|ぶどう|マスカット|桃|梨|いちご|苺|メロン|柑橘/],
  ["野菜", /野菜|トマト|じゃがいも|玉ねぎ|アスパラ/],
  ["スイーツ", /スイーツ|菓子|ケーキ|プリン|アイス|チョコ/],
  ["飲みもの", /ビール|酒|ワイン|焼酎|ジュース|水|コーヒー|お茶/],
  ["日用品・雑貨", /タオル|ティッシュ|トイレットペーパー|洗剤|日用品|雑貨|食器|包丁/],
  ["旅行・体験", /宿泊|旅行|チケット|利用券|体験|クーポン|食事券|ペア/]
]);

/** @param {Product} p @returns {string | null} */
function guessGenre(p) {
  for (const [label, re] of GENRE_RULES) if (re.test(p.title)) return label;
  return null;
}
