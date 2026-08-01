# DISEC Research Wiki

Offline research hub for the **Islamic Republic of Iran** delegation at DISEC
(First Committee, UNGA), Motherland MUN 2026 — agenda: **Regulating Lethal
Autonomous Weapons Systems (LAWS) & Military AI**.

## Quick start

```sh
npm install
npm run build    # convert + download + news + mkdocs build
npm run serve    # static server + live-news RSS proxy on http://localhost:8000
```

## Commands

| Command              | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm run convert`    | Rebuild Markdown pages from source data (position paper, study guide, guides) |
| `npm run download`   | Fetch/download primary-source documents into `docs/references/` + `downloads/`|
| `npm run news`       | Save latest agenda-relevant news articles offline into `docs/news/`          |
| `npm run build`      | All of the above, then `mkdocs build` into `site/`                           |
| `npm run serve`      | Serve `site/` + provide `GET /api/rss` for the Live News page (port 8000)    |

## Offline use

The built `site/` folder is **fully self-contained** — no internet, no CDN, no
webfonts (system fonts only), no server required. Copy it to a USB drive or
open `site/index.html` directly and everything works.

The only thing that needs a network is the optional **Live News** page
(`news/live.html`), which aggregates headlines via the local proxy's
`/api/rss`. When offline, use the saved **News Archive** (`news/index.html`)
instead — every headline there is a full local Markdown copy.

## Source documents

`npm run download` saves 43+ primary sources into `docs/references/index.md`:

- **Treaties & conventions** — CCW (all protocols), CWC, BWC, NPT, TPNW, ATT,
  Ottawa landmine convention, CCM cluster munitions, 1925 Geneva Protocol
- **UN / agency reports** — LAWS resolution A/RES/78/241, SG report A/78/273,
  GGE 2023 report, ICRC, NATO AI strategy, UNODA material
- **AI policy frameworks** — EU AI Act, US DoD directives, etc.
- **Iran / Middle East** — Wikipedia deep-dives, CSIS drone/EW analysis, ME
  Council briefs, IPHR drone-war report (PDF)

PDFs are cached under `wiki/downloads/` and converted to text with `pdftotext`.
Scanned/image PDFs fall back to a stub page linking the local PDF.

## Project layout

```
wiki/
  docs/            Markdown source for the site (mkdocs)
  scripts/         build + download + news + proxy scripts
  downloads/       cached PDFs
  news-data/       raw offline article Markdown
  site/            built static site (self-contained)
```
