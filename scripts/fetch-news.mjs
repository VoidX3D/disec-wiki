#!/usr/bin/env node
/**
 * Fetch news from RSS feeds, filter for agenda relevance, and save every
 * article as an offline Markdown file under news-data/.
 * Regenerates docs/news/index.md — the offline news archive.
 *
 * Run: npm run news
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const NEWS_DATA = path.join(WIKI, 'news-data');
const DOCS_NEWS = path.join(WIKI, 'docs', 'news');

fs.mkdirSync(NEWS_DATA, { recursive: true });
fs.mkdirSync(DOCS_NEWS, { recursive: true });

const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' },
  customFields: { item: ['media:content', 'media:thumbnail', 'enclosure', 'image'] },
});

const FEEDS = [
  { id: 'un', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', source: 'UN News', label: 'UN' },
  { id: 'bbc', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech', label: 'BBC' },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', label: 'Al Jazeera' },
  { id: 'reuters', url: 'https://www.reutersagency.com/feed/', source: 'Reuters', label: 'Reuters' },
  { id: 'defense-news', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', source: 'Defense News', label: 'Defense' },
  { id: 'iiss', url: 'https://www.iiss.org/feed/', source: 'IISS', label: 'Think Tank' },
  { id: 'hrw', url: 'https://www.hrw.org/rss.xml', source: 'Human Rights Watch', label: 'NGO' },
  { id: 'sipri', url: 'https://www.sipri.org/rss.xml', source: 'SIPRI', label: 'Think Tank' },
  { id: 'icrc', url: 'https://www.icrc.org/en/rss/feature', source: 'ICRC', label: 'NGO' },
  { id: 'bbc-world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', label: 'BBC' },
];

const KEYWORDS = [
  'lethal autonomous weapons', 'autonomous weapons', 'killer robots',
  'military ai', 'artificial intelligence', 'meaningful human control',
  'arms control', 'disarmament', 'weapons', 'drone', 'uav',
  'unmanned', 'missile', 'defense', 'defence', 'military',
  'security', 'nato', 'iran', 'tehran', 'sanctions',
  'cyber', 'ai', 'robot', 'weapon', 'treaty',
  'proliferation', 'conflict', 'warfare', 'attack',
  'nuclear', 'missile', 'hypersonic', 'surveillance',
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

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function writeArticle(article, feed) {
  const date = article.pubDate ? new Date(article.pubDate) : new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const fname = `${dateStr}_${slugify(article.title)}.md`;
  const target = path.join(NEWS_DATA, fname);
  if (fs.existsSync(target)) return fname;

  const content = stripHtml(article.contentSnippet || article.content || '').slice(0, 4000);
  const md = [
    `# ${article.title}`,
    '',
    `- **Source:** ${feed.source}`,
    `- **Published:** ${date.toDateString()}`,
    `- **Original:** <${article.link}>`,
    '',
    content,
    '',
    `---`,
    `*Saved offline by the DISEC Research Wiki.*`,
    '',
  ].join('\n');
  fs.writeFileSync(target, md);
  return fname;
}

const saved = [];
for (const feed of FEEDS) {
  try {
    process.stdout.write(`  • ${feed.source} ... `);
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Status code ${res.status}`);
    const xml = await res.text();
    const result = await parser.parseString(xml);
    const items = (result.items || []).slice(0, 30);
    let count = 0;
    for (const item of items) {
      const hay = `${item.title} ${item.contentSnippet || ''}`;
      if (!relevant(hay)) continue;
      const fname = writeArticle(item, feed);
      if (fname) {
        count++;
        saved.push({ date: (item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : ''), file: fname, title: item.title, source: feed.source });
      }
    }
    console.log(`${count} saved`);
  } catch (e) {
    console.log(`FAILED — ${e.message.slice(0, 80)}`);
  }
}

// Regenerate the news index
const allFiles = fs.readdirSync(NEWS_DATA)
  .filter(f => f.endsWith('.md'))
  .sort()
  .reverse();

const md = [];
md.push('# News Archive');
md.push('');
md.push('Offline archive of agenda-relevant articles. Updated with `npm run news`.');
md.push('');
md.push(`**${allFiles.length} articles saved locally.**`);
md.push('');
if (saved.length) {
  md.push('## Newly saved this run');
  md.push('');
  for (const s of saved) md.push(`- [${s.title}](archive/${s.file}) — ${s.source}`);
  md.push('');
}
if (allFiles.length) {
  md.push('## Archive');
  md.push('');
  for (const f of allFiles) {
    const title = fs.readFileSync(path.join(NEWS_DATA, f), 'utf-8').split('\n').find(l => l.startsWith('# ')) || f;
    md.push(`- [${(title.replace(/^#\s*/, ''))}](archive/${f})`);
  }
}
md.push('');
md.push('> For live browsing, run `npm run serve` and open the **Live news** page.');
md.push('');
fs.writeFileSync(path.join(DOCS_NEWS, 'index.md'), md.join('\n'));

// copy archive into docs/news/archive for building
const archiveDest = path.join(DOCS_NEWS, 'archive');
fs.mkdirSync(archiveDest, { recursive: true });
for (const f of allFiles) {
  fs.copyFileSync(path.join(NEWS_DATA, f), path.join(archiveDest, f));
}

console.log(`\nDone. ${allFiles.length} archived articles, ${saved.length} new this run.`);
