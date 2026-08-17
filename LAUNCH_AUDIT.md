# 🔍 ふるガチャ ローンチ前総合監査レポート(LAUNCH_AUDIT)

監査日: 2026-08-18 / 対象: 公開直前版一式(27ページ・JS/Functions/SSG/テスト)
方針: 「公開後にユーザーから指摘されそうな箇所」を分類し、**明確なバグ(1)と高確率問題(2)のみ修正**。好み(4)は提案として残す。

> 前提メモ: 依頼文の `furugacha_1.zip` は添付されていなかったため、直前納品zip(furugacha.zip)と同一内容の作業ツリーを正本として監査した。差分はゼロであることを確認済み。

---

## 1. 発見した問題(分類つき全リスト)

| # | 重要度 | 分類 | 内容 | 対応 |
|---|---|---|---|---|
| B1 | **High** | 1 バグ | 演出中(約3.3秒)に範囲タブ/チップ/セレクトを操作できるため、結果ラベル・履歴・共有URL(`?scope`)が**実際の抽選範囲と食い違う**可能性 | ✅ 修正 |
| B2 | **High** | 1 バグ | `/gacha/` に `<h1>` が無い(SEO・アクセシビリティ・見出し階層) | ✅ 修正 |
| B3 | Medium | 1 バグ | シミュレーターのCTAクリックリスナーが**再計算のたびに追加登録**される(once指定でも計算N回で最大N個蓄積) | ✅ 修正 |
| B4 | Medium | 1 バグ | 連続ガチャ時、**前回の返礼品API応答が後から届いて新しい結果を上書き**し得るrace(特にreduced-motionの高速連打) | ✅ 修正 |
| B5 | Low | 1 バグ | 結果Reveal/紙吹雪/共有トーストの `setTimeout` がラン間で干渉(直後の再ガチャでアニメが途中消灯) | ✅ 修正 |
| P1 | Medium | 2 高確率 | robots.txt の `Disallow: /favorites/ /history/` と `noindex` の併用 — Disallowするとクローラが**noindexを読めず**URLだけ索引される既知パターン | ✅ 修正(Disallow撤去・noindex維持) |
| P2 | Medium | 2 高確率 | 楽天APIが `itemUrl` 欠落/不正値を返した場合、CTAの `href` が空や `javascript:` になり得る(現mapperは弾くが多層防御なし) | ✅ 修正(最終フォールバック+スキーム検証) |
| P3 | Low-Med | 2 高確率 | 予算ガチャ `run()` の再入ガードがボタンdisabledのみ(Enter連打等のすり抜け余地) | ✅ 修正(busyフラグ) |
| P4 | Low | 3 改善 | 全角数字(コピペ「５００００」等)が入力エラーになる | ✅ 修正(正規化。範囲・仕様は不変) |
| P5 | Low | 3 改善 | 予算ガチャの結果サマリーがスクリーンリーダーに通知されない | ✅ 修正(`aria-live="polite"`) |
| P6 | Low | 2 高確率 | `docs/LAUNCH_CHECKLIST.md` §1 が旧プレースホルダ(example@…)前提の記述のままで、公開作業時に混乱を招く | ✅ 修正(設定済みを反映) |
| P7 | Low | 3 改善 | フッター楽天リンクの `rel` が `noopener` のみ | ✅ 修正(`noreferrer` 追加) |
| K1 | Low | 4 好み | PRバッジの配色 #9A8FB8×白 は小サイズ文字でWCAG AA境界付近 | ⏸ 提案のみ |
| K2 | Low | 4 好み | ボタン内の🎰絵文字がSRで「スロットマシン」と読まれる(aria-hidden化する案) | ⏸ 提案のみ |
| K3 | Low | 4 好み | `providers` の `console.warn`(楽天→mockフォールバック時) | ⏸ 維持推奨(本番診断に有用・秘密情報を含まない) |
| K4 | Low | 4 好み | ガイド記事へのFAQPage/HowTo schema追加拡充 | ⏸ 提案のみ |
| K5 | Info | — | README/チェックリスト内の `pages.dev` 言及は手順説明であり残置が正 | 対応不要 |

**問題なしを確認した項目(抜粋)**: 内部リンク28種すべて実在 / canonical・og:url 全27ページ `https://furugacha.jp` 統一 / title・description 重複なし / `example@example.com`・`localhost`・TODO・FIXME・`console.log`・デバッグ表示の残留なし / localStorage層は破損JSON・quota超過・利用不可環境すべて防御済み / Functionsは秘密情報をレスポンスに含めず、accessKeyはURLでなくヘッダー送信 / CSPのimg-srcは楽天画像ドメインのみ許可 / JSON-LDはjson.dumps経由でエスケープ安全 / 法務ページと実装の矛盾なし(解析未導入⇔コードに解析なし、Cookie不発行⇔document.cookie不使用、sessionStorage明記済み) / 税関連の断定表現なし(「絶対に超えない」は予算ガチャのソフトウェア挙動保証で税額とは無関係)。

## 2. 修正内容の詳細(B1〜P7)

- **B1 範囲凍結**: `runGacha()` 開始時に `resultScopeState` へ範囲をスナップショットし、結果カードのラベル・`pushGachaHistory`・`history.replaceState` の `?scope` はすべてこれを参照。演出中は範囲UI(ラジオ・セレクト・チップ)を `disabled`(終了時に必ず復帰)。「同じ範囲でもう一回」は**結果を生んだ範囲**へUIごと同期してから再抽選し、ボタン文言との一致を保証。抽選関数・確率は無変更。
- **B2**: `/gacha/` 冒頭に `h1「自治体ガチャ」`+リードを追加(共通コアのh2はその配下に収まる)。
- **B3**: リスナーを初期化時に1回だけ登録し、金額は `handoffLimit` 変数で更新。
- **B4**: `loadProducts` に世代トークン(`loadSeq`)を導入し、古い応答はグリッド・PRバッジ・注記・ジャンルチップを一切更新せず破棄。
- **B5**: reveal/confetti/shareの各タイマーIDを保持し、再実行時に `clearTimeout`。
- **P2**: `getProductDestinationUrl` を「affiliate(https必須)→productUrl(http(s)必須)→楽天ふるさと納税トップ」の3段防御に。疑似アフィリエイトパラメータ不付加の方針は不変。
- **P4**: `validate.js` に全角→半角数字の正規化を追加(受理範囲・上限下限は不変)。

## 3. 修正しなかった問題と理由

K1〜K4(§1参照)。いずれも「既存挙動を壊すリスク > 明確なメリット」または純粋なデザイン/方針判断のため、指示どおり提案に留めた。K3は本番切替後の障害切り分けに有用なため**残すことを推奨**。

## 4. 要・外部確認(コード側は準備済み・記憶での書き換えは実施していない)

**要・楽天公式仕様確認**(本番キー投入前に https://webservice.rakuten.co.jp/ の最新ドキュメントと突合):
1. エンドポイント/バージョン `IchibaItem/Search/20260701` の有効性
2. `accessKey` の**ヘッダー名・送信方式**(現実装: リクエストヘッダー `accessKey`)
3. `formatVersion=2` のレスポンス形(items/Items、itemName/itemPrice/itemUrl/mediumImageUrls/shopCode)— mapperはv1/v2両対応の防御実装
4. ふるさと納税ショップの `shopCode = f+自治体コード6桁` 規則(公式ショップ優先フィルタの前提)
5. `availability` / `imageFlag` / `minPrice` / `maxPrice` パラメータの現行仕様
6. レート制限値と、エッジキャッシュ600秒・「Supported by Rakuten Developers」表記がデータ取扱条件を満たすか

**要・税制確認**: `lib/calculator.js` の前提(給与所得控除の下限65万円、基礎控除の段階、住民税所得割×20%特例、復興税1.021)を国税庁・総務省の最新資料と突合(今回ロジック変更なし)。

**要・外部確認(法務)**: PR表示の位置・文言(返礼品見出し横バッジ+注記)がステマ規制ガイドラインの最新運用で十分か。

## 5. スマホで確認してほしい項目(実機)

320/375/390pxで: ①トップ〜結果カードまで横スクロールが出ない ②ガチャ演出中に範囲タブが薄くなり操作不可→終了で復帰 ③「同じ範囲でもう一回」を10連打しても表示崩れ・二重実行なし ④長い自治体名(いちき串木野市 等が出るまで回す)でスロット枠が崩れない ⑤予算ガチャに全角「５００００」を貼り付けても通る ⑥結果カードの「楽天ふるさと納税で/この自治体を見る」が語の途中で折れない ⑦iOSの「視差効果を減らす」ONで即時結果表示。

## 6. PC復帰後に実施する項目

1. `git add -A && git commit -m "audit: ローンチ前総合監査の修正(範囲凍結/H1/robots/race対策/回帰テスト8件)" && git push origin main`
2. 反映後: `https://furugacha.jp/robots.txt`(Disallowが消えている)、`/gacha/`(h1表示)、`/api/status`
3. Search Console登録(監査対象外だが次工程)→ sitemap送信

## 7. 楽天本番化直前チェック(短縮版)

環境変数3種設定 → `MOCK_MODE`削除 → 再デプロイ → `/api/status`が`rakuten`/`hasAffiliate:true` → 実データで「サンプル」消灯・「PR」点灯 → 商品リンクが `hb.afl.rakuten.co.jp`(https)経由 → §4の仕様突合完了に✔ → 万一の障害時はmockへ自動フォールバックすることをNW切断で一度確認。

## 8. テスト・検証結果

`generate-pages.py` 27ページ+sitemap+robots生成OK / **node:test 45/45 PASS**(既存37+今回8) / **tsc(strict, checkJs)エラー0**(この環境はネット遮断のため`npx -p typescript`不可・グローバルtsc 6.0.3で実施。お手元のPowerShellコマンドはそのまま有効) / 自治体データ 184件・47都道府県・全コード検査OK / 全JS `node --check` OK。

**追加した回帰テスト(tests/regression.test.mjs・8件)の意図**: ルーレット候補の件数・出自・**末尾=当選**の三点固定(演出と結果の分離を将来の改修から守る) / productUrl欠落・`javascript:`注入時のフォールバック / 全角数字の受理 / 予算境界値(1999/2000/2000000/2000001) / escapeHtml / localStorage欠如環境と**破損JSONからの回復**。

## 9. 変更ファイル一覧

`public/assets/js/pages/gacha-app.js`(B1/B4/B5) / `pages/calculator.js`(B3) / `pages/budget.js`(P3) / `lib/product-link.js`(P2) / `lib/validate.js`(P4) / `scripts/content/gacha.html`(B2)・`budget-gacha.html`(P5) / `scripts/generate-pages.py`(P1/P7) / `docs/LAUNCH_CHECKLIST.md`(P6) / `tests/regression.test.mjs`(新規) / 生成物: `public/**/index.html`・`robots.txt` 再生成。※抽選・予算・税計算・Provider・Functionsのコアロジックはdiffゼロ。

## 10. リスク評価(残存)

| リスク | 重要度 | 状態 |
|---|---|---|
| 楽天API実仕様との差異(§4-1〜6) | **High** | 本番キー投入時に要確認。差異はfunctions/api/_lib のみ修正で吸収できる設計 |
| 税制改正・計算前提の陳腐化 | **High**(YMYL) | 「目安」表記+専門家案内で緩和済み。年1回の突合を運用ルール化推奨 |
| 掲載184自治体(スターター)の期待ギャップ | Medium | 一覧ページに先行掲載注記済み。全自治体化スクリプト準備済み |
| PRバッジのコントラスト(K1) | Low | AA境界。文言でも広告明記済みのため許容 |
| 旧ブラウザでの `auto-phrase` 非対応 | Low | 段階的強化設計(非対応でも従来表示に劣化するだけ) |
| CSPが将来のAdSense/解析導入をブロック | Low(意図) | 導入時に `_headers` へドメイン追記が必要(チェックリスト記載済み) |

**総評**: Critical該当なし。High 2件(B1/B2)は修正済み。正式公開に耐える状態と判断する。
