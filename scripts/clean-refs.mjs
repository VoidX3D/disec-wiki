#!/usr/bin/env node
/**
 * Clean scraped reference files (docs/references/*.md):
 *   - Resolve root-relative site links to their original absolute URLs
 *     (e.g. ICRC's `/en/...` -> https://www.icrc.org/en/...)
 *   - Strip known navigation boilerplate ("Skip to content", "Main menu", etc.)
 *   - Drop empty/whitespace links
 *   - Fix source-relative downloads links (../downloads -> /downloads)
 *
 * Run: npm run clean
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const REFS = path.join(WIKI, 'docs', 'references');

// domain -> list of root-relative prefixes that belong to that domain
const SITE_ROOTS = [
  { domain: 'https://www.icrc.org', prefixes: ['/en', '/zh', '/fr', '/es', '/ar', '/ru', '/pt'] },
  { domain: 'https://www.unoda.org', prefixes: ['/en'] },
  { domain: 'https://www.un.org', prefixes: ['/en', '/ru', '/fr', '/zh', '/ar', '/es'] },
  { domain: 'https://www.unodc.org', prefixes: ['/en'] },
  { domain: 'https://www.sipri.org', prefixes: ['/'] },
  { domain: 'https://carnegieendowment.org', prefixes: ['/'] },
  { domain: 'https://www.rand.org', prefixes: ['/'] },
  { domain: 'https://www.hrw.org', prefixes: ['/'] },
  { domain: 'https://www.stopkillerrobots.org', prefixes: ['/'] },
  { domain: 'https://article36.org', prefixes: ['/'] },
  { domain: 'https://www.smallarmssurvey.org', prefixes: ['/'] },
  { domain: 'https://www.nato.int', prefixes: ['/'] },
  { domain: 'https://unidir.org', prefixes: ['/'] },
  { domain: 'https://www.state.gov', prefixes: ['/'] },
  { domain: 'https://en.wikipedia.org', prefixes: ['/'] },
  { domain: 'https://www.icrc.org', prefixes: ['/'] },
];

function rootForHref(href) {
  for (const site of SITE_ROOTS) {
    if (site.prefixes.some((p) => href.startsWith(p))) return site.domain;
  }
  return null;
}

function resolveLinks(md) {
  return md.replace(/\]\(([^)]+?)\)/g, (m, href) => {
    href = href.trim();
    if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto') || href.startsWith('javascript')) return m;
    if (href.startsWith('../downloads/')) return `](/downloads/${href.slice('../downloads/'.length)}`;
    if (href.startsWith('./downloads/')) return `](/downloads/${href.slice('./downloads/'.length)}`;
    const root = rootForHref(href);
    if (root && href.startsWith('/')) return `](${root}${href})`;
    return m;
  });
}

const NOISE = [
  /^\[ ?Skip to main content\]\([^)]*\)\s*$/gim,
  /^\[Skip to content\]\([^)]*\)\s*$/gim,
  /^\[Skip to main content\]\([^)]*\)\s*$/gim,
  /^Main menu\s*$/gim,
  /^Sidebar\s*$/gim,
  /^Toggle sidebar\s*$/gim,
  /^Close\s*$/gim,
  /^MENU\s*$/gim,
  /^Home\s*$/gim,
];

// Anchor-only links that point to JS shell elements not present in the
// static render (skip links, search toggles, cookie/newsletter hooks...).
const JUNK_ANCHORS = /^\[[^\]]*\]\(#(main-content|main|content|page|collapseSearch|search|newsletter|footer|top|skip)[^)]*\)\s*$/gim;

function stripNoise(md) {
  for (const re of NOISE) md = md.replace(re, '');
  md = md.replace(JUNK_ANCHORS, '');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md;
}

let changed = 0;
let files = fs.readdirSync(REFS).filter((f) => f.endsWith('.md') && f !== 'index.md');
for (const f of files) {
  const fp = path.join(REFS, f);
  let src = fs.readFileSync(fp, 'utf-8');
  let body = src;
  let fm = '';
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 4);
    if (end !== -1) {
      fm = body.slice(0, end + 4);
      body = body.slice(end + 4);
    }
  }
  let out = resolveLinks(body);
  out = stripNoise(out);
  if (out !== body) {
    fs.writeFileSync(fp, fm + out);
    changed++;
    console.log(`+ cleaned  ${f}`);
  }
}
console.log(`Cleaned ${changed} files.`);
