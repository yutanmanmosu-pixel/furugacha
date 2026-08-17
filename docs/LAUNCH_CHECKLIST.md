# 🚀 ふるガチャ 公開前チェックリスト

上から順に進めれば公開できます。**[必須]** はローンチ前に必ず実施してください。

## 1. サイト情報の差し替え [設定済み・2026-08-18確認]
`scripts/generate-pages.py` の冒頭定数は公開用に設定済み。変更時はここを編集 → `npm run build:pages`。
- [x] `OPERATOR_NAME` = ふるガチャ運営事務局
- [x] `CONTACT_EMAIL` = contact@furugacha.jp(Cloudflare Email Routingで受信)
- [x] `SITE_ORIGIN` = https://furugacha.jp(canonical / OGP / sitemap / robots に反映済み)
- [ ] 内容変更時は /operator/ /contact/ /privacy/ の表示を再確認

## 2. Cloudflare Pages デプロイ [必須]
- [ ] GitHubへpush → PagesでConnect to Git(output: `public`、build command空欄)
- [ ] `https://<project>.pages.dev` で全ページ・ガチャ動作(Mock)を確認
- [ ] `/api/status` が `{"mode":"mock"}` を返すことを確認
- [ ] 独自ドメインを接続(README §4)→ `SITE_ORIGIN` 更新 → 再ビルド・再デプロイ

## 3. 楽天への登録(外部登録・審査あり)
- [ ] [楽天会員ID](https://www.rakuten.co.jp/)を用意
- [ ] [楽天ウェブサービス](https://webservice.rakuten.co.jp/)でアプリ登録 → **applicationId / accessKey** を取得(公開URLの入力が必要になる場合があるためデプロイ後推奨)
- [ ] [楽天アフィリエイト](https://affiliate.rakuten.co.jp/)で **affiliateId** を確認(サイト登録・審査。成果報酬の受取設定も)
- [ ] 楽天ウェブサービス/アフィリエイトの**最新の利用規約・表示ルール・レート制限**を確認(本実装はクレジット表示・エッジキャッシュ600s・PR表示に対応済み)

## 4. 本番モード切替 [必須(収益化する場合)]
- [ ] Cloudflare Pages → Settings → Environment variables に `RAKUTEN_APPLICATION_ID` / `RAKUTEN_ACCESS_KEY` / `RAKUTEN_AFFILIATE_ID` を設定
- [ ] `MOCK_MODE` を削除(または `false`)→ 再デプロイ
- [ ] `/api/status` が `{"mode":"rakuten","hasAffiliate":true}` になることを確認
- [ ] ガチャ結果の返礼品が実データになり、「サンプル」表示が消え「PR」表示が出ることを確認
- [ ] 返礼品リンクを実際に踏み、楽天側で正しく遷移することを確認

## 5. コンテンツ・法務の最終確認 [必須]
- [ ] 控除上限シミュレーターの税制前提が最新か確認(`lib/calculator.js`)。税制改正があれば更新 → `npm test`
- [ ] ガイド記事の制度記述(ワンストップ期限・ポイント付与禁止 等)を最新情報と突き合わせ
- [ ] /privacy/ /terms/ /disclaimer/ /ad-policy/ を運営実態に合わせて微修正(制定日など)
- [ ] 誇大表現(No.1・最安 等)が混入していないか全文検索

## 6. データ拡充(任意・推奨)
- [ ] 総務省CSVで全自治体化: `node scripts/update-municipalities.mjs <csv>` → `npm run validate:data` → 再デプロイ
- [ ] `municipalities.json` の `meta.isStarterSubset` が `false` になると一覧ページの「一部掲載」注記が自動で消えます

## 7. SEO・計測(公開後)
- [ ] Google Search Console にサイト登録 → `sitemap.xml` を送信
- [ ] Bing Webmaster Tools 登録(任意)
- [ ] OGP確認(X/LINEのカードプレビュー)。画像は `/assets/img/og.png`
- [ ] アクセス解析を入れる場合は /privacy/ と /cookie-policy/ に追記(現状「未導入」と明記済みのため必須)

## 8. AdSense(任意・将来)
- [ ] 申請前に /ad-policy/ /privacy/ を更新(現状「未導入」と明記)
- [ ] コンテンツポリシー(YMYLのため誇大表現・断定表現に注意)を再確認
- [ ] 広告枠を入れる場合は `_headers` のCSP(script-src等)にAdSenseドメイン追加が必要

## 9. 運用
- [ ] お問い合わせメールの受信確認(テスト送信)
- [ ] 年1回: 税制・制度記述・自治体データの棚卸し
- [ ] 楽天API仕様変更の告知ウォッチ(現行: Ichiba Item Search v2026-07-01 / accessKeyヘッダー方式)
