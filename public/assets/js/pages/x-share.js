// @ts-check
// 「Xで共有」ウィジェットの共通挙動(自治体ガチャ・予算ガチャで共用)。
//
// 方針:
//   ・投稿は【あらかじめURLを入れた通常のリンク】で開く。window.openを使わないので
//     ポップアップブロックにかからず、長押し・新しいタブで開くもできる。
//   ・押した時点では何も投稿されない。確定はXの画面でユーザー本人が行う。
//     そのため「投稿しました」の類は絶対に表示しない。
//   ・投稿文は折りたたみで確認でき、コピーもできる。コピーに失敗した環境では
//     テキストエリアを選択状態にして手動コピーへ誘導する。

/**
 * @typedef {Object} XShareUi
 * @property {(v:{text:string, intentUrl:string, shareUrl:string}) => void} show 投稿文と共有URLを反映して表示する
 * @property {() => void} hide 非表示にして中身を空にする(古い結果を残さない)
 * @property {(reason:string) => void} disable 共有できない理由を出してリンクを無効にする
 * @property {(on:boolean) => void} setBusy 抽選中は前回の共有リンクを押せなくする
 */

/**
 * @param {{root:HTMLElement, link:HTMLAnchorElement, textarea:HTMLTextAreaElement,
 *          copyBtn:HTMLButtonElement, copied:HTMLElement, note:HTMLElement,
 *          details?:HTMLDetailsElement}} els
 * @returns {XShareUi}
 */
export function bindXShare(els) {
  let copyTimer = 0;

  const lock = (/** @type {boolean} */ on) => {
    if (on) {
      els.link.removeAttribute("href"); // hrefを外すとクリックでも新規タブでも開けない
      els.link.setAttribute("aria-disabled", "true");
      els.link.classList.add("is-disabled");
    } else {
      els.link.setAttribute("aria-disabled", "false");
      els.link.classList.remove("is-disabled");
    }
  };

  const clearCopied = () => {
    clearTimeout(copyTimer);
    els.copied.textContent = "";
  };

  els.copyBtn.addEventListener("click", async () => {
    const text = els.textarea.value;
    if (!text) return;
    clearCopied();
    try {
      await navigator.clipboard.writeText(text);
      els.copied.textContent = "投稿文をコピーしました";
      copyTimer = setTimeout(clearCopied, 4000);
    } catch {
      // クリップボードが使えない環境(権限拒否・非対応)は手動コピーへ
      els.copied.textContent = "コピーできませんでした。下の文章を選択してコピーしてください。";
      try { els.textarea.focus(); els.textarea.select(); } catch { /* 選択不可でも表示は残す */ }
    }
  });

  return {
    show({ text, intentUrl }) {
      clearCopied();
      els.textarea.value = text;
      els.link.href = intentUrl;
      lock(false);
      els.note.textContent = "";
      els.root.hidden = false;
    },
    hide() {
      clearCopied();
      els.textarea.value = "";
      els.link.removeAttribute("href");
      els.note.textContent = "";
      if (els.details) els.details.open = false;
      els.root.hidden = true;
    },
    disable(reason) {
      clearCopied();
      els.textarea.value = "";
      lock(true);
      els.note.textContent = reason;
      if (els.details) els.details.open = false;
      els.root.hidden = false;
    },
    setBusy(on) {
      if (on) { lock(true); clearCopied(); }
    }
  };
}
