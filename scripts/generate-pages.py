#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ふるガチャ ミニSSG(標準ライブラリのみ・ビルド不要方針の要)
scripts/content/*.html の本文断片を共通レイアウトに流し込み、public/ 配下へ静的HTMLを生成する。
併せて sitemap.xml / robots.txt も生成。

使い方: python3 scripts/generate-pages.py
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "scripts" / "content"
PUBLIC = ROOT / "public"

# ====== サイト定数(公開前に要確認: docs/LAUNCH_CHECKLIST.md) ======
SITE_ORIGIN = "https://furugacha.jp"  # 本番ドメイン取得後に変更
SITE_NAME = "ふるガチャ"
TAGLINE = "知らない地域に、うれしい出会いを。"
TAGLINE_HTML = '<span class="nobr">知らない地域に、</span><span class="nobr">うれしい出会いを。</span>'
OPERATOR_NAME = "ふるガチャ運営事務局"
CONTACT_EMAIL = "contact@furugacha.jp"
LASTMOD = "2026-08-18"

DEFAULT_DESC = (
    "ふるさと納税の寄附先が決められないなら、ガチャで運命の自治体に出会おう。"
    "範囲(全国・地方・都道府県)を選んで回すだけ。控除上限シミュレーターや予算おまかせガチャも無料・ログイン不要。"
)

# ====== ページ定義 ======
# (path, fragment, title, description, page_scripts, page_type)
# path: ""=トップ, "gacha" → /gacha/index.html
PAGES: list[dict] = [
    dict(path="", frag="home.html", title=f"{SITE_NAME}|ふるさと納税する自治体を、ガチャで決める",
         desc=DEFAULT_DESC, scripts=["/assets/js/pages/gacha-app.js"], ptype="home"),
    dict(path="gacha", frag="gacha.html", title="自治体ガチャ",
         desc="全国・地方・都道府県から範囲を選んでガチャを回すと、今年の寄附先候補の自治体が1つ決まります。結果から返礼品もチェック。",
         scripts=["/assets/js/pages/gacha-app.js"], ptype="page"),
    dict(path="budget-gacha", frag="budget-gacha.html", title="予算おまかせガチャ",
         desc="予算を入れてカテゴリを選ぶだけ。予算を超えない返礼品の組み合わせをガチャが提案します。控除上限シミュレーターからの金額引き継ぎにも対応。",
         scripts=["/assets/js/pages/budget.js"], ptype="page"),
    dict(path="calculator", frag="calculator.html", title="控除上限額シミュレーター",
         desc="年収と家族構成を入れるだけで、ふるさと納税の控除上限額の目安を無料で試算。結果はそのまま予算おまかせガチャへ引き継げます。",
         scripts=["/assets/js/pages/calculator.js"], ptype="page"),
    dict(path="favorites", frag="favorites.html", title="お気に入り",
         desc="ガチャで出会った自治体と返礼品のお気に入り一覧。データはこの端末の中だけに保存され、ログインは不要です。",
         scripts=["/assets/js/pages/favorites.js"], ptype="page", noindex=True),
    dict(path="history", frag="history.html", title="ガチャ履歴",
         desc="自治体ガチャ・予算おまかせガチャの履歴。データはこの端末の中だけに保存されます。",
         scripts=["/assets/js/pages/history.js"], ptype="page", noindex=True),
    dict(path="municipalities", frag="municipalities.html", title="掲載自治体一覧",
         desc="ふるガチャに掲載中の自治体一覧。地方や名前で絞り込んで、各自治体の返礼品ピックアップを見られます。",
         scripts=["/assets/js/pages/municipalities.js"], ptype="page"),
    dict(path="about", frag="about.html", title="ふるガチャとは",
         desc="ふるガチャは「寄附先が決められない」を楽しく解決する、ふるさと納税の自治体ガチャサービスです。運営方針・できることを紹介します。",
         scripts=[], ptype="page"),
    dict(path="how-to", frag="how-to.html", title="使い方ガイド",
         desc="ふるガチャの使い方をやさしく解説。自治体ガチャの回し方、予算おまかせガチャ、控除上限シミュレーター、お気に入り機能まで。",
         scripts=[], ptype="page"),
    dict(path="faq", frag="faq.html", title="よくある質問",
         desc="ふるガチャに関するよくある質問。料金、ログインの要否、寄附のしかた、控除上限、広告表記などについて回答します。",
         scripts=[], ptype="faq"),
    dict(path="contact", frag="contact.html", title="お問い合わせ",
         desc="ふるガチャへのお問い合わせ方法のご案内。", scripts=[], ptype="page"),
    dict(path="operator", frag="operator.html", title="運営者情報",
         desc="ふるガチャの運営者情報。", scripts=[], ptype="page"),
    dict(path="privacy", frag="privacy.html", title="プライバシーポリシー",
         desc="ふるガチャのプライバシーポリシー。取得する情報、localStorageの利用、外部サービスについて説明します。", scripts=[], ptype="page"),
    dict(path="terms", frag="terms.html", title="利用規約",
         desc="ふるガチャの利用規約。", scripts=[], ptype="page"),
    dict(path="disclaimer", frag="disclaimer.html", title="免責事項",
         desc="ふるガチャの免責事項。控除額の試算は目安であり、掲載情報の正確性・リンク先での取引について保証しません。", scripts=[], ptype="page"),
    dict(path="ad-policy", frag="ad-policy.html", title="広告掲載方針",
         desc="ふるガチャの広告掲載方針。楽天アフィリエイトの利用とPR表記の考え方について説明します。", scripts=[], ptype="page"),
    dict(path="cookie-policy", frag="cookie-policy.html", title="Cookie・ローカルストレージについて",
         desc="ふるガチャにおけるCookieおよびlocalStorageの利用について説明します。", scripts=[], ptype="page"),
    # ガイド
    dict(path="guide", frag="guide-index.html", title="ふるさと納税ガイド",
         desc="ふるさと納税の仕組み、控除上限額、ワンストップ特例、確定申告、よくある失敗まで。初めてでも迷わないガイド記事集。",
         scripts=[], ptype="page"),
]

ARTICLES = [
    ("what-is-furusato", "ふるさと納税とは?仕組みを3分でやさしく解説",
     "寄附・控除・返礼品の関係と自己負担2,000円の意味、2025年10月のポイント付与禁止まで。初めての人向けに仕組みだけを最短で解説します。"),
    ("deduction-limit", "控除上限額とは?自分の上限を知らずに始めてはいけない理由",
     "ふるさと納税の「上限」の正体と決まり方をやさしく解説。上限を超えるとどうなるか、目安の調べ方も。"),
    ("one-stop", "ワンストップ特例制度とは?条件・期限・やり方",
     "確定申告なしで控除を受けられるワンストップ特例。使える条件、翌年1月10日の期限、申請の流れと注意点をまとめました。"),
    ("kakutei-shinkoku", "ふるさと納税の確定申告ガイド|必要な人・やり方・期限",
     "6自治体以上に寄附した人や医療費控除を受ける人は確定申告が必要。証明書の集め方からe-Taxまでの流れを解説。"),
    ("common-mistakes", "ふるさと納税でよくある失敗7選と防ぎ方",
     "上限超過、名義ミス、ワンストップの出し忘れ…。ありがちな失敗を先に知って、損しないふるさと納税を。"),
    ("choose-by-municipality", "「返礼品から選ぶ」をやめて「自治体から選ぶ」という考え方",
     "比較疲れしていませんか。自治体を起点に選ぶと、ふるさと納税はもっと楽しく、意味のあるものになります。"),
    ("cant-decide", "寄附先が決められない人へ|選べないときの3つの決め方",
     "選択肢が多すぎて動けない…はふるさと納税あるある。範囲だけ決めてガチャに任せるなど、今日決めるための方法を紹介。"),
    ("budget-first", "予算から考えるふるさと納税|上限を余らせないコツ",
     "先に予算(=上限の目安)を決めてから返礼品を組む逆転の発想。12月に慌てないための計画の立て方。"),
]
for slug, t, d in ARTICLES:
    PAGES.append(dict(path=f"guide/{slug}", frag=f"guide-{slug}.html", title=t, desc=d, scripts=[], ptype="article"))

PAGES.append(dict(path="404.html", frag="404.html", title="ページが見つかりません",
                  desc="お探しのページは見つかりませんでした。", scripts=[], ptype="404", noindex=True))

NAV = [
    ("/about/", "ふるガチャとは"),
    ("/gacha/", "自治体ガチャ"),
    ("/budget-gacha/", "予算ガチャ"),
    ("/calculator/", "シミュレーター"),
    ("/municipalities/", "自治体一覧"),
    ("/guide/", "ガイド"),
    ("/faq/", "FAQ"),
]

LOGO_SVG = """<svg class="brand__logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="24" r="19" fill="#EAF6FF" stroke="#BFDCE8" stroke-width="2"/><circle cx="25" cy="20" r="5.5" fill="#EF6351"/><circle cx="37" cy="17" r="5" fill="#FFC93C"/><circle cx="40" cy="27" r="5.5" fill="#7EC8E3"/><circle cx="28" cy="30" r="5" fill="#FFFFFF" stroke="#E3D9C2"/><rect x="12" y="36" width="40" height="22" rx="8" fill="#2E7D46"/><rect x="20" y="41" width="24" height="9" rx="4.5" fill="#FBF4E4"/><circle cx="32" cy="45.5" r="3" fill="#B9C3CC"/><rect x="24" y="53" width="16" height="4" rx="2" fill="#1E4027"/></svg>"""

def header_html(active_path: str) -> str:
    items = []
    for href, label in NAV:
        cur = ' aria-current="page"' if (
            active_path == href.strip("/") or
            (href == "/guide/" and active_path.startswith("guide"))
        ) else ""
        cls = ' class="nav-cta"' if href == "/gacha/" else ""
        items.append(f'<li{cls}><a href="{href}"{cur}>{label}</a></li>')
    return f"""<header class="site-header">
  <div class="site-header__inner">
    <a class="brand" href="/">{LOGO_SVG}<span><span class="brand__name">{SITE_NAME}</span><span class="brand__tag">{TAGLINE_HTML}</span></span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="メニューを開く">☰ メニュー</button>
    <nav id="site-nav" class="site-nav" aria-label="サイト内メニュー"><ul>{''.join(items)}</ul></nav>
  </div>
</header>"""

FOOTER = f"""<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <p class="footer-brand">🎰 {SITE_NAME}</p>
        <p class="footer-note">{TAGLINE_HTML}<br>ふるさと納税する自治体を、ガチャで決めるサービスです。当サイトは特定の自治体・事業者の公式サイトではありません。</p>
        <p class="footer-note">当サイトのリンクには広告(楽天アフィリエイト)を含みます。<br><a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a></p>
      </div>
      <div>
        <h3>あそぶ</h3>
        <ul>
          <li><a href="/gacha/">自治体ガチャ</a></li>
          <li><a href="/budget-gacha/">予算おまかせガチャ</a></li>
          <li><a href="/calculator/">控除上限シミュレーター</a></li>
          <li><a href="/favorites/">お気に入り</a></li>
          <li><a href="/history/">ガチャ履歴</a></li>
          <li><a href="/municipalities/">掲載自治体一覧</a></li>
        </ul>
      </div>
      <div>
        <h3>まなぶ</h3>
        <ul>
          <li><a href="/about/">ふるガチャとは</a></li>
          <li><a href="/how-to/">使い方ガイド</a></li>
          <li><a href="/guide/">ふるさと納税ガイド</a></li>
          <li><a href="/faq/">よくある質問</a></li>
        </ul>
      </div>
      <div>
        <h3>サイト情報</h3>
        <ul>
          <li><a href="/operator/">運営者情報</a></li>
          <li><a href="/contact/">お問い合わせ</a></li>
          <li><a href="/privacy/">プライバシーポリシー</a></li>
          <li><a href="/terms/">利用規約</a></li>
          <li><a href="/disclaimer/">免責事項</a></li>
          <li><a href="/ad-policy/">広告掲載方針</a></li>
          <li><a href="/cookie-policy/">Cookieについて</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>控除上限額の試算はあくまで目安です。正確な金額は税理士等の専門家または国税庁・お住まいの自治体にご確認ください。</p>
      <p>© <span data-year>2026</span> {SITE_NAME}</p>
    </div>
  </div>
</footer>"""


def canonical(path: str) -> str:
    if path == "404.html":
        return f"{SITE_ORIGIN}/404.html"
    return f"{SITE_ORIGIN}/" + (f"{path}/" if path else "")


def breadcrumb(page) -> tuple[str, str]:
    """(html, jsonld) — トップ以外に表示"""
    if page["path"] in ("", "404.html"):
        return "", ""
    crumbs = [("ホーム", "/")]
    if page["path"].startswith("guide/"):
        crumbs.append(("ふるさと納税ガイド", "/guide/"))
    crumbs.append((page["title"], None))
    lis = []
    ld_items = []
    for i, (label, href) in enumerate(crumbs, 1):
        short = label if len(label) <= 22 else label[:21] + "…"
        lis.append(f'<li><a href="{href}">{short}</a></li>' if href else f"<li>{short}</li>")
        item = {"@type": "ListItem", "position": i, "name": label}
        if href:
            item["item"] = SITE_ORIGIN + href
        ld_items.append(item)
    html = f'<nav class="breadcrumb container" aria-label="現在地"><ol>{"".join(lis)}</ol></nav>'
    ld = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": ld_items},
                    ensure_ascii=False)
    return html, f'<script type="application/ld+json">{ld}</script>'


def jsonld_for(page) -> str:
    blocks = []
    if page["ptype"] == "home":
        blocks.append({
            "@context": "https://schema.org", "@type": "WebSite",
            "name": SITE_NAME, "url": SITE_ORIGIN + "/",
            "description": DEFAULT_DESC, "inLanguage": "ja",
        })
        blocks.append({
            "@context": "https://schema.org", "@type": "Organization",
            "name": SITE_NAME, "url": SITE_ORIGIN + "/",
            "logo": SITE_ORIGIN + "/assets/img/og.png",
        })
    if page["ptype"] == "article":
        blocks.append({
            "@context": "https://schema.org", "@type": "Article",
            "headline": page["title"],
            "description": page["desc"],
            "datePublished": LASTMOD, "dateModified": LASTMOD,
            "inLanguage": "ja",
            "mainEntityOfPage": canonical(page["path"]),
            "author": {"@type": "Organization", "name": f"{SITE_NAME}編集部"},
            "publisher": {"@type": "Organization", "name": SITE_NAME,
                          "logo": {"@type": "ImageObject", "url": SITE_ORIGIN + "/assets/img/og.png"}},
        })
    return "".join(f'<script type="application/ld+json">{json.dumps(b, ensure_ascii=False)}</script>' for b in blocks)


INCLUDE_RE = re.compile(r"\{\{include:([\w.\-]+)\}\}")

def load_fragment(name: str, depth=0) -> str:
    if depth > 4:
        raise RuntimeError("include too deep")
    text = (CONTENT / name).read_text(encoding="utf-8")
    text = INCLUDE_RE.sub(lambda m: load_fragment(m.group(1), depth + 1), text)
    return text


def render(page) -> str:
    body = load_fragment(page["frag"])
    body = (body
            .replace("{{OPERATOR_NAME}}", OPERATOR_NAME)
            .replace("{{CONTACT_EMAIL}}", CONTACT_EMAIL)
            .replace("{{SITE_ORIGIN}}", SITE_ORIGIN))
    crumb_html, crumb_ld = breadcrumb(page)
    robots = '<meta name="robots" content="noindex">' if page.get("noindex") else ""
    scripts = "".join(f'<script type="module" src="{s}"></script>' for s in ["/assets/js/main.js", *page["scripts"]])
    og_type = "article" if page["ptype"] == "article" else "website"
    title = page["title"] if page["ptype"] == "home" else f'{page["title"]}|{SITE_NAME}'
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{page['desc']}">
{robots}<link rel="canonical" href="{canonical(page['path'])}">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{page['desc']}">
<meta property="og:url" content="{canonical(page['path'])}">
<meta property="og:image" content="{SITE_ORIGIN}/assets/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2E7D46">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/style.css">
{jsonld_for(page)}{crumb_ld}
</head>
<body>
<a class="skip-link" href="#main">本文へスキップ</a>
{header_html(page['path'])}
{crumb_html}
<main id="main">
{body}
</main>
{FOOTER}
{scripts}
</body>
</html>
"""


def main() -> None:
    written = []
    for page in PAGES:
        html = render(page)
        if page["path"] == "404.html":
            out = PUBLIC / "404.html"
        else:
            out = PUBLIC / page["path"] / "index.html" if page["path"] else PUBLIC / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        written.append(str(out.relative_to(PUBLIC)))

    # sitemap.xml
    urls = []
    for page in PAGES:
        if page.get("noindex") or page["path"] == "404.html":
            continue
        pr = "1.0" if page["path"] == "" else ("0.8" if page["ptype"] in ("page", "faq") else "0.6")
        urls.append(f"  <url><loc>{canonical(page['path'])}</loc><lastmod>{LASTMOD}</lastmod><priority>{pr}</priority></url>")
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "\n".join(urls) + "\n</urlset>\n")
    (PUBLIC / "sitemap.xml").write_text(sitemap, encoding="utf-8")

    (PUBLIC / "robots.txt").write_text(
        # noindexページはmetaで制御する(Disallowと併用するとクローラがnoindexを読めないため両立させない)
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE_ORIGIN}/sitemap.xml\n",
        encoding="utf-8")

    print(f"generated {len(written)} pages + sitemap.xml + robots.txt")
    for w in written:
        print("  -", w)


if __name__ == "__main__":
    main()
