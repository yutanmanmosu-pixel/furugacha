// @ts-check
// 2026-08-18 v3(SE・6+追加表示・UI仕上げ)の回帰テスト。DOMライブラリは使わない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  PRODUCT_FETCH_LIMIT,
  PRODUCT_INITIAL_COUNT,
  splitProducts,
  moreLabel
} from "../public/assets/js/lib/product-paging.js";
// 静的import時点では localStorage / AudioContext が無い素のNode環境
import * as soundPlain from "../public/assets/js/lib/sound.js";

// ---------- 返礼品 6件 + さらに◯件 ----------
test("paging: API要求は最大12・初期表示6(定数の固定)", () => {
  assert.equal(PRODUCT_FETCH_LIMIT, 12);
  assert.equal(PRODUCT_INITIAL_COUNT, 6);
});

test("paging: 12件→6+6 / 8件→さらに2件 / 10件→さらに4件 / 6件以下→追加なし(重複なし・順序維持)", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
  {
    const { first, rest } = splitProducts(mk(12));
    assert.equal(first.length, 6);
    assert.equal(rest.length, 6);
    assert.equal(moreLabel(rest.length), "返礼品をさらに6件見る");
    const ids = new Set([...first, ...rest].map((p) => p.id));
    assert.equal(ids.size, 12, "重複禁止");
    assert.equal(first[0]?.id, "p0");
    assert.equal(rest[0]?.id, "p6", "取得順を維持");
  }
  assert.equal(splitProducts(mk(8)).rest.length, 2);
  assert.equal(moreLabel(2), "返礼品をさらに2件見る");
  assert.equal(splitProducts(mk(10)).rest.length, 4);
  assert.equal(moreLabel(4), "返礼品をさらに4件見る");
  assert.equal(splitProducts(mk(6)).rest.length, 0);
  assert.equal(splitProducts(mk(3)).rest.length, 0);
  assert.equal(moreLabel(0), "", "restが0ならボタン非表示(空ラベル)");
  // 12超は先頭12件に切り詰め(APIのlimitと二重の安全)
  assert.equal(splitProducts(mk(20)).rest.length, 6);
});

test("paging: 追加表示は取得済みデータの分割のみで完結する(fetch非依存の純関数=再通信しない設計)", () => {
  // splitProducts / moreLabel はネットワークAPIを一切参照しない純関数であることを、
  // 関数ソースにfetch等が現れないことで固定する(将来の混入防止)。
  for (const fn of [splitProducts, moreLabel]) {
    const src = fn.toString();
    assert.ok(!/fetch|XMLHttpRequest|provider/.test(src), "追加表示ロジックに通信を混ぜない");
  }
});

test("フラグメント: 外部『もっと見る』リンクを削除し、サイト内ボタン#products-more-btnに置換 / kicker削除", () => {
  const core = readFileSync("scripts/content/gacha-core.html", "utf8");
  assert.ok(!core.includes("products-more-link"), "旧外部リンクIDが残っている");
  assert.ok(!core.includes('search.rakuten.co.jp'), "フラグメントに外部検索URLを直書きしない");
  assert.ok(core.includes('id="products-more-btn"'), "追加表示ボタンがない");
  assert.ok(core.includes('type="button"') && core.includes("hidden"), "ボタンは初期hiddenのtype=button");
  assert.ok(!core.includes("メイン機能"), "kicker『メイン機能』が残っている");
  const budget = readFileSync("scripts/content/budget-gacha.html", "utf8");
  assert.ok(!budget.includes("サブ機能"), "kicker『サブ機能』が残っている");
  // ヘッダーのSEトグル(生成元)
  const gen = readFileSync("scripts/generate-pages.py", "utf8");
  assert.ok(gen.includes('id="se-toggle"') && gen.includes('aria-pressed'), "SEトグルが生成テンプレにない");
});

test("gacha-app: 12件取得(limit定数)・rakutenLink(緑CTA)は維持・SEは既存タイミングへ便乗", () => {
  const src = readFileSync("public/assets/js/pages/gacha-app.js", "utf8");
  assert.ok(src.includes("limit: PRODUCT_FETCH_LIMIT"), "APIへ12件要求していない");
  assert.ok(!src.includes("products-more-link"), "旧リンク参照が残っている");
  assert.ok(src.includes("els.rakutenLink.href = searchUrl"), "結果カードの緑CTA(従来仕様)を消してはいけない");
  assert.ok(src.includes("RATTLE_AT"), "カラカラSEのtick定義がない");
  const m = src.match(/RATTLE_AT = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m && m[1]);
  const count = (m ? m[1] : "").split(",").filter((x) => x.trim() !== "").length;
  assert.ok(count >= 5 && count <= 9, `抽選SEは5〜9回の範囲(現在${count})`);
  assert.ok(!src.includes("SPIN_DELAYS = [52, 52, 52, 52, 52, 56, 62, 70, 80, 92, 106, 124, 146, 172, 205, 248, 305, 370, "),
    "SPIN_DELAYS(演出タイミング)を変更してはいけない");
});

// ---------- SEエンジン ----------
test("SE: AudioContext/localStorageが無い環境でも全再生関数が例外なくno-op", () => {
  assert.equal(soundPlain.soundEnabled(), true, "未設定の初期状態はON");
  assert.doesNotThrow(() => soundPlain.playClick());
  assert.doesNotThrow(() => soundPlain.playGachaStart());
  assert.doesNotThrow(() => soundPlain.playRattle());
  assert.doesNotThrow(() => soundPlain.playLand());
});

test("SE: OFF時は再生関数がAudioContextに触れず即return(no-op)", () => {
  // OFFにした状態で、AudioContextコンストラクタが呼ばれないことを検証
  let constructed = 0;
  /** @type {any} */ (globalThis).AudioContext = class {
    constructor() { constructed++; }
  };
  try {
    soundPlain.setSoundEnabled(false);
    soundPlain.playClick();
    soundPlain.playRattle();
    soundPlain.playLand();
    assert.equal(constructed, 0, "OFFなのにAudioContextが生成された");
  } finally {
    delete (/** @type {any} */ (globalThis)).AudioContext;
    soundPlain.setSoundEnabled(true);
  }
});

test("SE: localStorageの設定を復元する(furugacha:se-enabled)", async () => {
  const bag = new Map([["furugacha:se-enabled", "0"]]);
  /** @type {any} */ (globalThis).localStorage = {
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => { bag.set(k, v); },
    removeItem: (k) => { bag.delete(k); }
  };
  try {
    const url = pathToFileURL("public/assets/js/lib/sound.js").href + "?case=restore-off";
    const sound = await import(url);
    assert.equal(sound.soundEnabled(), false, "保存されたOFFを復元できていない");
    assert.doesNotThrow(() => sound.playClick(), "OFF時のno-opが例外");
    sound.setSoundEnabled(true);
    assert.equal(bag.get("furugacha:se-enabled"), "1", "ONへの変更が保存されない");
    const url2 = pathToFileURL("public/assets/js/lib/sound.js").href + "?case=restore-on";
    const sound2 = await import(url2);
    assert.equal(sound2.soundEnabled(), true, "保存されたONを復元できていない");
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});
