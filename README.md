# DISEC Research Wiki

Offline research hub for the **Islamic Republic of Iran** delegation at DISEC
(First Committee, UNGA), Motherland MUN 2026 — agenda: **Regulating Lethal
Autonomous Weapons Systems (LAWS) & Military AI**.

Built with **Docusaurus** (React 19). Markdown for content, real React pages for
presentation (home + live news), fully self-contained static output.

## Quick start

```sh
npm install
npm run build    # download + news + docusaurus build
npm run serve    # static server + live-news RSS proxy on http://localhost:8000
```

## Commands

| Command              | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm run start`      | Docusaurus dev server (hot reload)                                           |
| `npm run build`      | `download` + `news`, then `docusaurus build` into `build/`                   |
| `npm run build:site` | `docusaurus build` only                                                      |
| `npm run download`   | Fetch/download primary-source documents into `docs/references/` + `static/downloads/` |
| `npm run news`       | Fetch RSS headlines into `news-data/`, then convert to `blog/` posts         |
| `npm run convert`    | Rebuild Markdown pages from source data (position paper, study guide, guides)|
| `npm run convert-news`| Convert `news-data/*.md` → `blog/*.md` Docusaurus posts                      |
| `npm run serve`      | Serve `build/` + provide `GET /api/rss` for the Live News page (port 8000)   |
| `npm run preview`    | `docusaurus serve` on 0.0.0.0:8000                                           |

## Structure

```
wiki/
  docs/            Markdown content (position, iran, committee, resources, data)
  blog/            News archive as Docusaurus blog posts (/news)
  src/pages/       React pages: index (home), live (live news)
  src/css/         Design system (custom.css)
  static/          Static assets: img/, downloads/ (PDFs), manifest
  news-data/       Raw offline article Markdown (source for blog/)
  downloads/       Cached runtime PDFs/DOCX served by the local server
  scripts/         Build, download, news, proxy + server modules
```

## Offline use

The built `build/` folder is fully self-contained — no CDN, no webfonts (system
fonts only), offline search via `@easyops-cn/docusaurus-search-local`, PWA
caching via `@docusaurus/plugin-pwa`. Copy it anywhere and open it.

The only network-dependent feature is the optional **Live News** page (`/live`),
which aggregates headlines via the local proxy's `/api/rss`. When offline, use
the News archive (`/news`) instead.

## Deploy (Vercel)

`vercel.json` builds with `npm ci && npm run build` and serves `build/`.

## Source documents

`npm run download` saves primary sources into `docs/references/` (PDFs cached
under `static/downloads/`):

- Treaties & conventions — CCW (all protocols), CWC, BWC, NPT, TPNW, ATT,
  Ottawa landmine convention, CCM cluster munitions, 1925 Geneva Protocol
- UN / agency reports — LAWS resolutions, SG reports, GGE reports, ICRC,
  NATO AI strategy, UNODA material
- AI policy frameworks — EU AI Act, US DoD directives, etc.
- Iran / Middle East — Wikipedia deep-dives, CSIS drone/EW analysis,
  ME Council briefs, IPHR drone-war report (PDF)

## New operational commands & infra

- `npm run news:enhanced` — Enhanced news-fetcher: downloads RSS items and attempts to fetch article images (media:content, media:thumbnail, OG image) and PDF enclosures; saves assets to `news-data/assets` and `news-data/pdfs`, writes logs to `logs/news-fetch.log`.
- `npm run normalize-images` — Normalizes filenames in `news-data/assets` to the convention `YYYY-MM-DD_slug.ext` and writes a mapping file at `news-data/assets/rename-map.json`.

CI: A scheduled GitHub Actions workflow (.github/workflows/scheduled-data-fetch.yml) has been added to run the news fetch + download periodically and upload artifacts. See that workflow for scheduling details.

Ops: See `docs/ops/fix-npm.md` for guidance on fixing a broken global npm prefix and the recommended developer setup.
