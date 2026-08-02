#!/usr/bin/env node
/**
 * Enhanced DISEC news fetcher
 * - Fetches RSS items
 * - Filters by keywords
 * - Downloads article assets (images, enclosures like PDFs)
 * - Attempts to fetch OG image from article page when missing
 * - Writes articles as Markdown into news-data/, assets into news-data/assets and news-data/pdfs
 * - Writes logs to logs/news-fetch.log
 *
 * Usage: npm run news:enhanced -- [--limit=N] [--quiet]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';
import * as term from './term.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const NEWS_DATA = path.join(WIKI, 'news-data');
const ASSETS = path.join(NEWS_DATA, 'assets');
const PDF_DIR = path.join(NEWS_DATA, 'pdfs');
const LOG_DIR = path.join(WIKI, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'news-fetch.log');

fs.mkdirSync(NEWS_DATA, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

function appendLog(line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `${ts} ${line}\n`);
}

// CLI
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet') || args.includes('-q');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 40;
const HELP = args.includes('--help') || args.includes('-h');
if (HELP) {
  console.log('Enhanced DISEC news fetcher\nUsage: node scripts/fetch-news-enhanced.mjs [options]');
  process.exit(0);
}

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/3.0)' },
  customFields: { item: ['media:content', 'media:thumbnail', 'enclosure', 'image'] },
});

// Add more UN and country sources here; start with UN, UNHCR, OHCHR and country wire feeds
const FEEDS = [
  { id: 'un', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', source: 'UN News', label: 'UN' },
  { id: 'ohchr', url: 'https://www.ohchr.org/en/rss.xml', source: 'OHCHR', label: 'UN' },
  { id: 'unhcr', url: 'https://www.unhcr.org/rss.xml', source: 'UNHCR', label: 'UN' },
  { id: 'reliefweb', url: 'https://reliefweb.int/updates/rss', source: 'ReliefWeb', label: 'UN/NGO' },
  // Existing feeds from older fetcher for continuity
  { id: 'bbc-world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', label: 'BBC' },
  { id: 'reuters-world', url: 'https://feeds.reuters.com/reuters/worldNews', source: 'Reuters', label: 'Reuters' },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', label: 'Al Jazeera' },
  { id: 'guardian', url: 'https://www.theguardian.com/world/rss', source: 'The Guardian', label: 'International' },
];

const KEYWORDS = [
  'lethal autonomous weapons','autonomous weapons','killer robots','military ai','arms control','disarmament',
  'drone','uav','missile','defense','defence','military','security','sanctions','cyber','ai','weapon','treaty','proliferation',
  'conflict','warfare','nuclear','hypersonic','surveillance','human rights','refugee','humanitarian', 'UN', 'United Nations'
];

function relevant(text) {
  const t = (text || '').toLowerCase();
  return KEYWORDS.some(k => t.includes(k));
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 70);
}

function extFromUrl(u) {
  const m = u && u.split('?')[0].match(/\.([a-z0-9]{2,6})$/i);
  return (m && m[1]) || 'bin';
}

async function downloadTo(url, targetPath) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/3.0)' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(targetPath, buf);
    return true;
  } catch (e) {
    appendLog(`download-fail ${url} -> ${e.message}`);
    return false;
  }
}

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/3.0)' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=(?:"|')og:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i)
      || html.match(/<meta[^>]+name=(?:"|')twitter:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function writeArticle(article, feed, assets) {
  const date = article.pubDate ? new Date(article.pubDate) : new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const fname = `${dateStr}_${slugify(article.title)}.md`;
  const target = path.join(NEWS_DATA, fname);
  if (fs.existsSync(target)) return null;

  const content = stripHtml(article.contentSnippet || article.content || '').slice(0, 4000);
  const md = [
    `# ${article.title}`,
    '',
    `- **Source:** ${feed.source}`,
    `- **Published:** ${date.toDateString()}`,
    `- **Original:** <${article.link}>`,
    '',
    ...(assets && assets.length ? ['## Assets', ...assets.map(a => `- ${a}`), ''] : []),
    content,
    '',
    `---`,
    `*Saved offline by the DISEC Research Wiki.*`,
    '',
  ].join('\n');
  fs.writeFileSync(target, md);
  appendLog(`saved ${fname}`);
  return fname;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/3.0)' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Status code ${res.status}`);
    const xml = await res.text();
    const result = await parser.parseString(xml);
    const items = (result.items || []).slice(0, LIMIT);
    let saved = 0;
    for (const item of items) {
      const hay = `${item.title} ${item.contentSnippet || ''} ${item.content || ''}`;
      if (!relevant(hay)) continue;

      const assets = [];

      // enclosures (PDFs etc.)
      if (item.enclosure && item.enclosure.url) {
        const url = item.enclosure.url;
        const ext = extFromUrl(url);
        const filename = `${slugify(item.title)}.${ext}`;
        const target = path.join(PDF_DIR, filename);
        if (!fs.existsSync(target)) {
          const ok = await downloadTo(url, target);
          if (ok) { assets.push(`PDF: ${path.relative(WIKI, target)}`); appendLog(`pdf-saved ${url} -> ${target}`); }
        }
      }

      // media:content or image fields
      const medias = [];
      if (item['media:content'] && item['media:content'].url) medias.push(item['media:content'].url);
      if (item['media:thumbnail'] && item['media:thumbnail'].url) medias.push(item['media:thumbnail'].url);
      if (item.image && item.image.url) medias.push(item.image.url);
      if (item.enclosure && item.enclosure.url && /\.(jpe?g|png|gif|webp)$/i.test(item.enclosure.url)) medias.push(item.enclosure.url);

      // try to find OG image if no media
      if (medias.length === 0 && item.link) {
        const og = await fetchOgImage(item.link);
        if (og) medias.push(og);
      }

      for (const m of medias) {
        try {
          const ext = extFromUrl(m).replace(/[^a-z0-9]/g, '') || 'jpg';
          const filename = `${slugify(item.title)}.${ext}`;
          const target = path.join(ASSETS, filename);
          if (!fs.existsSync(target)) {
            const ok = await downloadTo(m, target);
            if (ok) { assets.push(`Image: ${path.relative(WIKI, target)}`); appendLog(`img-saved ${m} -> ${target}`); }
          }
        } catch (e) { appendLog(`img-error ${m} ${e.message}`); }
      }

      const fname = writeArticle(item, feed, assets);
      if (fname) saved++;
    }
    term.status.skip(feed.source, `${saved} new of ${items.length} scanned`);
    return { feed: feed.id, ok: true, saved };
  } catch (e) {
    term.status.fail(feed.source, e.message.slice(0, 120));
    appendLog(`feed-fail ${feed.id} ${e.message}`);
    return { feed: feed.id, ok: false, saved: 0 };
  }
}

(async () => {
  term.section('Fetching news (enhanced)');
  const results = [];
  for (const feed of FEEDS) {
    results.push(await fetchFeed(feed));
  }

  // summary
  const allFiles = fs.readdirSync(NEWS_DATA).filter(f => f.endsWith('.md')).sort().reverse();
  const savedThisRun = results.reduce((n, r) => n + (r.saved || 0), 0);
  term.section('Summary');
  term.status.info('Archived', `${allFiles.length} articles`);
  term.status.info('Saved this run', `${savedThisRun} new`);
  term.status.info('Feeds', `${results.filter(r => r.ok).length}/${results.length} ok`);
  term.status.info('Log', LOG_FILE);
  appendLog(`run-complete saved=${savedThisRun} archived=${allFiles.length}`);
})();
