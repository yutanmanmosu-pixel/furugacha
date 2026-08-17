# 🎰 ふるガチャ

**ふるさと納税する自治体を、ガチャで決める。**
「返礼品を比較して選ぶ」のではなく「範囲(全国・地方・都道府県)だけ決めて、寄附先の自治体はガチャに任せる」——選択肢過多で決められない人のためのWebサービスです。

- メイン機能: **自治体ガチャ**(範囲選択 → ルーレット演出 → 運命の自治体 → 返礼品ピックアップ → 楽天ふるさと納税へ)
- サブ機能: **予算おまかせガチャ**(予算内に収まる返礼品の組み合わせを提案・予算超過ゼロ保証)
- 導線機能: **控除上限額シミュレーター**(結果金額をそのまま予算ガチャへ引き継ぎ)
- ログイン不要・決済なし・localStorageのみ / 収益化は**楽天アフィリエイトのみ**(Mock Modeで完成済み、環境変数の設定だけで本番化)

---

## 1. 技術スタックと選定理由

| 項目 | 採用 | 理由 |
|---|---|---|
| ホスティング | **Cloudflare Pages** | 無料枠が広く、静的配信+サーバレス関数(Pages Functions)を1リポジトリで運用できる |
| フロントエンド | **素のHTML/CSS + ES Modules(Vanilla JS)** | ビルド工程ゼロ。`public/` をそのまま配信でき、依存パッケージの脆弱性・保守コストが発生しない。個人運営の長期保守に最適 |
| 型安全 | **TypeScript(checkJs + JSDoc)** | `.js` のまま `tsc --noEmit` で厳格チェック(strict / noUncheckedIndexedAccess)。ビルド不要と型安全を両立 |
| ページ生成 | **自作ミニSSG(Python標準ライブラリのみ)** | 27ページの共通レイアウト/SEOタグ/JSON-LD/サイトマップを1コマンドで生成。フレームワーク不要 |
| API中継 | **Cloudflare Pages Functions** (`functions/api/*`) | 楽天APIの**秘密情報をブラウザに一切出さない**ための唯一のサーバ側コード。エッジキャッシュ(600s)でAPI呼び出しを節約 |
| テスト | **node:test**(Node標準) | 依存ゼロで抽選・予算・税計算などの純ロジック37テストを実行 |

React等を採用しなかったのは、本サービスの画面数・状態量に対して過剰で、ビルドチェーンの保守コストが便益を上回るためです。

## 2. ディレクトリ構成

```
furugacha/
├─ public/                     # そのまま配信される成果物(= Pagesの出力ディレクトリ)
│  ├─ index.html, gacha/ …     # SSGが生成した27ページ(直接編集しない)
│  ├─ 404.html, sitemap.xml, robots.txt, _headers(CSP等)
│  └─ assets/
│     ├─ css/style.css         # デザインシステム(参考画像A準拠: クリーム×緑×柿色)
│     ├─ js/
│     │  ├─ main.js            # 全ページ共通(ナビ等)
│     │  ├─ lib/               # 純ロジック: gacha / budget / calculator / storage / regions ほか
│     │  ├─ providers/         # 返礼品データ供給の抽象化(mock / rakuten / 自動フォールバック)
│     │  └─ pages/             # ページごとの画面制御(gacha-app / budget / calculator ほか)
│     ├─ img/                  # favicon / og.png / mock返礼品SVG(18種)
│     └─ data/municipalities.json  # 自治体マスタ(184自治体・47都道府県、スターター版)
├─ functions/api/              # Pages Functions(秘密情報はここだけ): status.js / products.js / _lib/
├─ scripts/
│  ├─ generate-pages.py        # ミニSSG(サイト定数はこのファイル冒頭)
│  ├─ content/*.html           # 各ページの本文断片(編集はこちら→SSG再実行)
│  ├─ make-assets.py / make-og.py   # 画像アセット生成
│  ├─ update-municipalities.mjs     # 総務省CSV→自治体JSON変換(全自治体化に使用)
│  └─ validate-municipalities.mjs   # データ検査(チェックディジット等)
├─ tests/                      # node:test 37件
├─ docs/LAUNCH_CHECKLIST.md    # 公開前チェックリスト
├─ package.json / tsconfig.json / wrangler.toml
└─ .env.example / .dev.vars.example
```

## 3. 開発・検証コマンド

```bash
# ローカル表示(静的のみ・APIなし→自動的にMock動作)
python3 -m http.server 8000 --directory public

# ローカル表示(Pages Functions込み。要Node/npx)
cp .dev.vars.example .dev.vars   # 値は空のままでもMockで動く
npm run dev                      # = npx wrangler pages dev public

npm test              # ロジックテスト(node:test / 37件)
npm run typecheck     # tsc(checkJs, strict)
npm run build:pages   # scripts/content/*.html からHTML/sitemap/robotsを再生成
npm run validate:data # 自治体データの整合性チェック
npm run og            # OGP画像の再生成(要Python + Pillow + Noto CJK)
```

**ページ本文を編集するとき**は `scripts/content/*.html` を直し、`npm run build:pages` を実行してください(`public/**/index.html` は生成物です)。

## 4. デプロイ手順(Cloudflare Pages)

1. このリポジトリをGitHubへpush。
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** でリポジトリを選択。
3. ビルド設定:
   - Framework preset: **None**
   - Build command: **(空欄)** ※生成済みHTMLをコミットしている前提。CIで生成したい場合は `python3 scripts/generate-pages.py`
   - Build output directory: **`public`**
4. デプロイ完了後、`https://<project>.pages.dev` で公開されます。`functions/` は自動でPages Functionsとして配備され、`/api/status` `/api/products` が有効になります。
5. 環境変数(下表)を **Settings → Environment variables** に設定(未設定でもMockで全機能が動きます)。

### カスタムドメイン接続
1. Cloudflareでドメインを取得(Registrar)または既存ドメインのDNSをCloudflareへ移管。
2. Pagesプロジェクト → **Custom domains → Set up a custom domain** でドメインを入力(CNAMEは自動設定、SSLも自動)。
3. `scripts/generate-pages.py` の `SITE_ORIGIN` を本番URLに変更 → `npm run build:pages` → 再デプロイ(canonical / OGP / sitemap / robots が新ドメインになります)。

## 5. 環境変数(楽天API・本番切替)

| 変数 | 必須 | 内容 |
|---|---|---|
| `RAKUTEN_APPLICATION_ID` | 本番時 | 楽天ウェブサービスの **applicationId** |
| `RAKUTEN_ACCESS_KEY` | 本番時 | 楽天ウェブサービスの **accessKey**(Ichiba Item Search API **v2026-07-01以降で必須**。公式Test Formと同じクエリパラメータ方式で送信。組み立てURLはログ等へ一切出力しない) |
| `RAKUTEN_AFFILIATE_ID` | 任意 | 楽天**アフィリエイトID**。設定すると返礼品リンクがアフィリエイトリンクになり「PR」表示が点灯 |
| `MOCK_MODE` | 任意 | `true` でキー設定済みでもサンプルデータ動作(検証用)。本番では削除または `false` |

### Mock → 本番の切替手順(コード変更ゼロ)
1. [楽天ウェブサービス](https://webservice.rakuten.co.jp/)でアプリ登録 → `applicationId` と `accessKey` を控える。
2. [楽天アフィリエイト](https://affiliate.rakuten.co.jp/)で `affiliateId` を確認。
3. 上記3つをCloudflare Pagesの環境変数に設定し、`MOCK_MODE` を削除。
4. 再デプロイ → `/api/status` が `{"mode":"rakuten","hasAffiliate":true}` を返せば本番化完了。サンプル表示・「サンプル」バッジは自動で消えます。

### 動作モードの設計(Provider抽象化)
- フロントは `providers/index.js` の `getProvider()` 経由でのみ返礼品を取得。`/api/status` の応答で **mock / rakuten** を自動判定します。
- 楽天API障害・レート超過・0件時は**自動でMockにフォールバック**し、UIには必ず「サンプル」表記が付きます。
- アフィリエイトURLの組み立てはサーバ側(楽天APIの `affiliateUrl` をそのまま使用)。**疑似的なアフィリエイトパラメータの捏造は行いません**。リンク先URLの決定はフロントでは `lib/product-link.js` の `getProductDestinationUrl()` に集約しています(`affiliateUrl(https)` → `productUrl` の順)。
- 楽天ウェブサービス利用のクレジット「**Supported by Rakuten Developers**」を全ページフッターと広告掲載方針ページに表示済み。利用規約・レート制限(キャッシュ600秒で対応)を遵守してください。

## 6. データ更新

- 自治体マスタ: `public/assets/data/municipalities.json`(現在は47都道府県×主要自治体184件のスターター版。`meta.isStarterSubset: true`)。
- 全自治体(約1,700)へ拡張するには、総務省の「都道府県コード及び市区町村コード」CSVをダウンロードし:
  ```bash
  node scripts/update-municipalities.mjs path/to/soumu.csv   # Shift_JIS対応
  npm run validate:data
  ```
- 税制(控除上限計算)は `public/assets/js/lib/calculator.js` に定数として集約。税制改正時はここを更新し `npm test`。

## 7. 法務・広告ポリシー(実装済み)

- 返礼品リンクへの **「PR」表示**、モック時の **「サンプル」表示**(景表法・ステマ規制対応)
- **No.1・最安・絶対**等の表現不使用 / 抽選は等確率で紹介料に影響しない旨を明記(/ad-policy/)
- 控除試算は常に**「目安」+税理士等への相談**を併記(/disclaimer/ ほか各所)
- プライバシーポリシー / 利用規約 / 免責 / 運営者情報 / Cookie説明の各ページを生成済み
- Google AdSenseは**未導入**。導入時は /privacy/ と /ad-policy/ の更新が必要(ページ内に追記方針を記載済み)

## 8. 公開前にやること

**`docs/LAUNCH_CHECKLIST.md`** に、運営者名・連絡先・ドメインの差し替えから楽天登録、本番切替、検索エンジン登録までの手順をまとめています。公開前に必ず確認してください。
