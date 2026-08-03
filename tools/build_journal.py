# -*- coding: utf-8 -*-
"""
Genere les pages du journal a partir de journal_content.py.

Le chrome (head, nav, menu, pied de page) est repris tel quel depuis
pages/legal.html : une seule source de verite, donc les articles heritent
automatiquement du menu, du curseur, de l'i18n et des correctifs deja en place.
Seuls le <head> et le corps de l'article sont reecrits.
"""
import os
import re
import html
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://nadhemhsini.online"
TEMPLATE = os.path.join(ROOT, "pages", "legal.html")


def load_chrome():
    s = open(TEMPLATE, encoding="utf-8").read()
    i_main = s.find('<main class="page-main">')
    i_footer = s.find("<footer")
    if i_main == -1 or i_footer == -1:
        raise SystemExit("gabarit : reperes introuvables")
    return s[:i_main], s[i_footer:]


def to_root_relative(s):
    """Le gabarit vit dans pages/ et s'adresse aux assets en `../`.

    Les articles sont un cran plus bas (pages/journal/), ou `../` designe
    pages/ et non la racine : sans reecriture, la feuille de style et les
    polices tombent a cote et la page s'affiche sans aucun style. On passe
    donc tout en chemins absolus, insensibles a la profondeur.
    """
    s = re.sub(r'(href|src)="\.\./(?!\.)', r'\1="/', s)
    s = re.sub(r'url\((["\']?)\.\./(?!\.)', r'url(\1/', s)
    # liens internes du gabarit qui pointaient vers des pages soeurs
    for page in ("index.html", "works.html", "shop.html", "approach.html",
                 "legal.html", "journal.html"):
        s = s.replace(f'href="{page}"', f'href="/pages/{page}"')
    s = s.replace('href="/pages/index.html"', 'href="/index.html"')
    return s


HEAD_RE = re.compile(r"<head>.*?</head>", re.S)


def build_head(a):
    """<head> complet et propre a l'article, sans rien emprunter au gabarit."""
    url = f"{SITE}/journal/{a['slug']}"
    title = html.escape(a["title"])
    desc = html.escape(a["description"])
    kw = html.escape(", ".join(a["keywords"]))
    published = a.get("date", date.today().isoformat())

    schema = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": a["title"],
        "description": a["description"],
        "url": url,
        "datePublished": published,
        "dateModified": published,
        "inLanguage": "fr-CA",
        "author": {
            "@type": "Person",
            "name": "Nadhem Hsini",
            "url": SITE + "/",
            "jobTitle": "Designer graphique",
        },
        "publisher": {
            "@type": "Organization",
            "name": "Aetherstone",
            "url": SITE + "/",
            "logo": {"@type": "ImageObject", "url": f"{SITE}/wf/og-aetherstone.jpg"},
        },
        "image": f"{SITE}/wf/og-aetherstone.jpg",
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
    }
    import json

    ld = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))

    return f"""<head><meta charset="utf-8"/><title>{title}</title>\
<meta content="width=device-width, initial-scale=1" name="viewport"/>\
<link rel="preload" href="../wf/68396a14a9b4604f87fdbba4_MixtapeExtraCondensed-ExtraBold.woff2" as="font" type="font/woff2" crossorigin/>\
<link rel="preload" href="../wf/GTPressuraMonoLight-exact.woff2" as="font" type="font/woff2" crossorigin/>\
<link href="../css/main.css" rel="stylesheet" type="text/css"/>\
<meta name="description" content="{desc}"/>\
<meta name="keywords" content="{kw}"/>\
<meta name="author" content="Nadhem Hsini"/>\
<link rel="canonical" href="{url}"/>\
<meta property="og:type" content="article"/>\
<meta property="og:site_name" content="Aetherstone"/>\
<meta property="og:locale" content="fr_CA"/>\
<meta property="og:title" content="{title}"/>\
<meta property="og:description" content="{desc}"/>\
<meta property="og:url" content="{url}"/>\
<meta property="og:image" content="{SITE}/wf/og-aetherstone.jpg"/>\
<meta property="og:image:width" content="1200"/>\
<meta property="og:image:height" content="630"/>\
<meta property="article:published_time" content="{published}"/>\
<meta property="article:author" content="Nadhem Hsini"/>\
<meta name="twitter:card" content="summary_large_image"/>\
<meta name="twitter:title" content="{title}"/>\
<meta name="twitter:description" content="{desc}"/>\
<meta name="twitter:image" content="{SITE}/wf/og-aetherstone.jpg"/>\
<script type="application/ld+json">{ld}</script>\
<link rel="icon" href="/favicon.ico" sizes="any"/>\
<link rel="manifest" href="/manifest.webmanifest"/>\
<meta name="theme-color" content="#111111"/>\
<link rel="icon" type="image/png" href="/wf/favicon-light-32.png" media="(prefers-color-scheme: light)"/>\
<link rel="icon" type="image/png" href="/wf/favicon-dark-32.png" media="(prefers-color-scheme: dark)"/>\
<link rel="apple-touch-icon" href="/wf/webclip-180.png"/></head>"""


ARTICLE_CSS = """
<style>
.jr_wrap{max-width:44rem;margin:0 auto;padding:9.5rem 1.25rem 6rem;}
@media (max-width:767px){.jr_wrap{padding-top:7.5rem;}}
.jr_meta{font-family:"Gt Pressura Mono",monospace;text-transform:uppercase;letter-spacing:.1rem;font-size:.7rem;opacity:.55;margin-bottom:1.2rem;}
.jr_wrap h1{font-family:"Mixtape Extra Condensed",Verdana,sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(2.6rem,7vw,4.6rem);line-height:.92;letter-spacing:-.045em;margin:0 0 1.4rem;}
.jr_lede{font-family:Mixtape,Verdana,sans-serif;font-size:1.15rem;line-height:1.5;opacity:.8;margin:0 0 2.6rem;}
.jr_wrap h2{font-family:"Mixtape Extra Condensed",Verdana,sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(1.7rem,4vw,2.4rem);line-height:1;letter-spacing:-.03em;margin:2.8rem 0 .9rem;}
.jr_wrap h3{font-family:"Gt Pressura Mono",monospace;text-transform:uppercase;letter-spacing:.09rem;font-size:.82rem;opacity:.6;margin:1.9rem 0 .5rem;}
.jr_wrap p{font-family:Mixtape,Verdana,sans-serif;font-size:1.02rem;line-height:1.62;margin:0 0 1.1rem;}
.jr_wrap ul,.jr_wrap ol{font-family:Mixtape,Verdana,sans-serif;font-size:1.02rem;line-height:1.62;margin:0 0 1.1rem;padding-left:1.2rem;}
.jr_wrap li{margin-bottom:.45rem;}
.jr_wrap a{color:inherit;text-decoration:underline;text-underline-offset:3px;}
.jr_wrap strong{font-weight:600;}
.jr_cta{border-top:1px solid rgba(128,128,128,.3);margin-top:3.4rem;padding-top:1.6rem;}
.jr_cta a{font-family:"Gt Pressura Mono",monospace;text-transform:uppercase;letter-spacing:.09rem;font-size:.82rem;}
.jr_related{border-top:1px solid rgba(128,128,128,.3);margin-top:2.4rem;padding-top:1.4rem;}
.jr_related h3{margin-top:0;}
.jr_related li{font-family:"Gt Pressura Mono",monospace;font-size:.8rem;letter-spacing:.04rem;}
.jr_index_item{border-top:1px solid rgba(128,128,128,.3);padding:1.5rem 0;}
.jr_index_item:last-child{border-bottom:1px solid rgba(128,128,128,.3);}
.jr_index_item h2{font-size:clamp(1.5rem,3.4vw,2.1rem);margin:0 0 .45rem;}
.jr_index_item a{text-decoration:none;}
.jr_index_item a:hover h2{opacity:.6;}
.jr_index_item p{opacity:.72;margin:0;}
</style>
"""


def render_article(a, chrome, all_articles):
    head, footer = chrome
    head_new = build_head(a).replace('../wf/', '/wf/').replace('../css/', '/css/')
    page = HEAD_RE.sub(lambda m: head_new, to_root_relative(head), count=1)
    footer = to_root_relative(footer)

    related = [x for x in all_articles if x["slug"] != a["slug"]][:3]
    rel_html = "".join(
        f'<li><a href="/journal/{r["slug"]}">{html.escape(r["title"])}</a></li>' for r in related
    )

    body = f"""<main class="page-main">
<article class="jr_wrap">
  <div class="jr_meta">Journal &middot; {a['category']} &middot; {a.get('date', '')}</div>
  <h1>{html.escape(a['title'])}</h1>
  <p class="jr_lede">{a['lede']}</p>
  {a['body']}
  <div class="jr_cta">
    <p>Un projet en tete&nbsp;? <a href="/index.html#contact">Parlons-en</a> &mdash;
    ou voyez d'abord <a href="/pages/works.html">les projets</a>.</p>
  </div>
  <div class="jr_related">
    <h3>A lire aussi</h3>
    <ul>{rel_html}</ul>
  </div>
</article>
</main>
"""
    return page + ARTICLE_CSS + body + footer


def render_index(articles, chrome):
    head, footer = chrome
    url = f"{SITE}/journal"
    import json

    ld = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": "Journal — Aetherstone",
            "url": url,
            "inLanguage": "fr-CA",
            "author": {"@type": "Person", "name": "Nadhem Hsini", "url": SITE + "/"},
            "blogPost": [
                {
                    "@type": "BlogPosting",
                    "headline": a["title"],
                    "url": f"{SITE}/journal/{a['slug']}",
                    "datePublished": a.get("date", ""),
                }
                for a in articles
            ],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )

    desc = ("Notes de terrain sur l'identite de marque, le packaging et la direction "
            "artistique, par Nadhem Hsini, designer graphique a Montreal.")
    head_new = f"""<head><meta charset="utf-8"/><title>Journal : notes de design | Nadhem Hsini</title>\
<meta content="width=device-width, initial-scale=1" name="viewport"/>\
<link rel="preload" href="../wf/68396a14a9b4604f87fdbba4_MixtapeExtraCondensed-ExtraBold.woff2" as="font" type="font/woff2" crossorigin/>\
<link rel="preload" href="../wf/GTPressuraMonoLight-exact.woff2" as="font" type="font/woff2" crossorigin/>\
<link href="/css/main.css" rel="stylesheet" type="text/css"/>\
<meta name="description" content="{desc}"/>\
<meta name="author" content="Nadhem Hsini"/>\
<link rel="canonical" href="{url}"/>\
<meta property="og:type" content="website"/><meta property="og:site_name" content="Aetherstone"/>\
<meta property="og:locale" content="fr_CA"/><meta property="og:title" content="Journal : notes de design | Nadhem Hsini"/>\
<meta property="og:description" content="{desc}"/><meta property="og:url" content="{url}"/>\
<meta property="og:image" content="{SITE}/wf/og-aetherstone.jpg"/>\
<meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/>\
<meta name="twitter:card" content="summary_large_image"/>\
<meta name="twitter:title" content="Journal : notes de design | Nadhem Hsini"/>\
<meta name="twitter:description" content="{desc}"/>\
<meta name="twitter:image" content="{SITE}/wf/og-aetherstone.jpg"/>\
<script type="application/ld+json">{ld}</script>\
<link rel="icon" href="/favicon.ico" sizes="any"/><link rel="manifest" href="/manifest.webmanifest"/>\
<meta name="theme-color" content="#111111"/>\
<link rel="icon" type="image/png" href="/wf/favicon-light-32.png" media="(prefers-color-scheme: light)"/>\
<link rel="icon" type="image/png" href="/wf/favicon-dark-32.png" media="(prefers-color-scheme: dark)"/>\
<link rel="apple-touch-icon" href="/wf/webclip-180.png"/></head>"""

    page = HEAD_RE.sub(lambda m: head_new, head, count=1)

    items = ""
    for a in articles:
        items += f"""<div class="jr_index_item">
  <a href="journal/{a['slug']}.html">
    <div class="jr_meta">{a['category']} &middot; {a.get('date','')}</div>
    <h2>{html.escape(a['title'])}</h2>
    <p>{html.escape(a['description'])}</p>
  </a>
</div>"""

    body = f"""<main class="page-main">
<div class="jr_wrap">
  <h1>Journal</h1>
  <p class="jr_lede">Notes de terrain sur l'identite de marque, le packaging et la
  direction artistique. Ce que j'apprends en faisant, ecrit pour les gens qui
  commandent du design autant que pour ceux qui en font.</p>
  {items}
</div>
</main>
"""
    return page + ARTICLE_CSS + body + footer


def main():
    from journal_content import ARTICLES

    chrome = load_chrome()
    outdir = os.path.join(ROOT, "pages", "journal")
    os.makedirs(outdir, exist_ok=True)

    for a in ARTICLES:
        p = os.path.join(outdir, a["slug"] + ".html")
        open(p, "w", encoding="utf-8").write(render_article(a, chrome, ARTICLES))

    open(os.path.join(ROOT, "pages", "journal.html"), "w", encoding="utf-8").write(
        render_index(ARTICLES, chrome)
    )
    print(f"{len(ARTICLES)} articles + index generes")


if __name__ == "__main__":
    main()
