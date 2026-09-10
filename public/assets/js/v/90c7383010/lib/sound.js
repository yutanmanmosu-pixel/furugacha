// @ts-check
// 効果音(SE)エンジン。外部音源・ライブラリを使わず Web Audio API でその場で合成する。
// 設計方針:
//  - AudioContext はページロード時に作らない。最初の再生要求(=ユーザー操作起点)で lazy 初期化。
//  - 非対応ブラウザ・初期化失敗・再生失敗でも絶対に例外を外へ出さない(サイト機能はSEなしで100%動作)。
//  - ON/OFF は localStorage("furugacha:se-enabled", "1"/"0") に保存。既定はON。
//  - 音はすべて短く小さく。「カチッ(操作)」「カラカラ(抽選)」「コトン+キラ(決定)」の3系統のみ。

const KEY = "furugacha:se-enabled";

/** @type {boolean | null} */
let enabled = null;
/** @type {AudioContext | null} */
let ctx = null;

function store() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** SEが有効か(初回のみlocalStorageから復元。未設定はON) */
export function soundEnabled() {
  if (enabled === null) {
    let v = null;
    try { v = store()?.getItem(KEY) ?? null; } catch { v = null; }
    enabled = v == null ? true : v === "1";
  }
  return enabled;
}

/** @param {boolean} on */
export function setSoundEnabled(on) {
  enabled = !!on;
  try { store()?.setItem(KEY, on ? "1" : "0"); } catch { /* private mode等は無視 */ }
}

/** AudioContextをlazyに取得(OFF・非対応・失敗はnull) */
function ac() {
  if (!soundEnabled()) return null;
  try {
    const w = /** @type {any} */ (globalThis);
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 短い減衰音(オシレーター1本)
 * @param {number} freq @param {number} dur 秒 @param {number} vol 0-1 @param {OscillatorType} type
 */
function blip(freq, dur, vol, type) {
  const c = ac();
  if (!c) return;
  try {
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* noop */ }
}

/** 汎用クリック音(数十ms・ごく小さく) */
export function playClick() {
  blip(1450, 0.035, 0.035, "square");
}

/** ガチャ開始の「カチッ」 */
export function playGachaStart() {
  blip(1700, 0.03, 0.05, "square");
}

/** 抽選中の「カラッ/コロッ」1回分(ノイズ短音+低い転がり)。呼び出し側が回数を制御する */
export function playRattle() {
  const c = ac();
  if (!c) return;
  try {
    const t = c.currentTime;
    // カラッ: 帯域を毎回少し変えたノイズバースト
    const len = Math.max(1, Math.floor(c.sampleRate * 0.07));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900 + Math.random() * 900;
    bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp);
    bp.connect(g);
    g.connect(c.destination);
    src.start(t);
    // コロッ: 低音の短い転がり
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(240 + Math.random() * 80, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.05, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g2).connect(c.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch { /* noop */ }
}

/** 決定の「コトン」+ごく小さな「キラッ」(1セットのみ) */
export function playLand() {
  const c = ac();
  if (!c) return;
  try {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.11);
    const g = c.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.18);
    /** @type {[number, number][]} */
    const sparkle = [[1568, 0.06], [2093, 0.1]];
    for (const [f, dt] of sparkle) {
      const o2 = c.createOscillator();
      const g2 = c.createGain();
      o2.type = "sine";
      o2.frequency.value = f;
      g2.gain.setValueAtTime(0.0001, t + dt);
      g2.gain.exponentialRampToValueAtTime(0.03, t + dt + 0.015);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.1);
      o2.connect(g2).connect(c.destination);
      o2.start(t + dt);
      o2.stop(t + dt + 0.12);
    }
  } catch { /* noop */ }
}
