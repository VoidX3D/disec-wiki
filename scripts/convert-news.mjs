#!/usr/bin/env node
/**
 * Convert news-data/*.md (raw offline articles) into Docusaurus blog posts
 * under blog/. Each post gets frontmatter (title, date, source, tags) parsed
 * from the legacy Markdown header format.
 *
 * Run: node scripts/convert-news.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const NEWS_DATA = path.join(WIKI, 'news-data');
const BLOG = path.join(WIKI, 'blog');

fs.mkdirSync(BLOG, { recursive: true });

const files = fs.readdirSync(NEWS_DATA)
  .filter((f) => f.endsWith('.md'))
  .sort();

let converted = 0;
let skipped = 0;

for (const f of files) {
  const raw = fs.readFileSync(path.join(NEWS_DATA, f), 'utf-8');
  const lines = raw.split('\n');

  // Parse legacy header: "# Title", "- **Source:** X", "- **Published:** ...", "- **Original:** <url>"
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const sourceMatch = raw.match(/^\*\*Source:\*\*\s+(.+)$/m) || raw.match(/^-\s+\*\*Source:\*\*\s+(.+)$/m);
  const publishedMatch = raw.match(/^\*\*Published:\*\*\s+(.+)$/m) || raw.match(/^-\s+\*\*Published:\*\*\s+(.+)$/m);
  const originalMatch = raw.match(/^\*\*Original:\*\*\s*<(.+)>$/m) || raw.match(/^-\s+\*\*Original:\*\*\s*<(.+)>$/m);

  const title = titleMatch ? titleMatch[1].trim() : f.replace(/\.md$/, '');
  const dateStr = publishedMatch ? publishedMatch[1].trim() : 'Unknown date';
  const source = sourceMatch ? sourceMatch[1].trim() : 'News';
  const original = originalMatch ? originalMatch[1].trim() : '';

  // Docusaurus frontmatter
  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
  ];

  // Convert date to ISO if parseable
  const parsedDate = Date.parse(dateStr);
  if (Number.isFinite(parsedDate)) {
    fm.push(`date: ${new Date(parsedDate).toISOString()}`);
  }

  fm.push(`source: ${JSON.stringify(source)}`);
  fm.push(`tags: [news]`);
  if (original) fm.push(`original: ${JSON.stringify(original)}`);
  fm.push('---');
  fm.push('');

  // Body: skip the header block (title + bullet lines), keep the content after
  const bodyLines = [];
  let inHeader = true;
  for (const line of lines) {
    if (inHeader) {
      if (line.startsWith('# ') || line.startsWith('- **') || line.startsWith('**')) continue;
      if (line.trim() === '') continue;
      inHeader = false;
      bodyLines.push(line);
      continue;
    }
    bodyLines.push(line);
  }

  const body = bodyLines.join('\n').trim();
  const out = `${fm.join('\n')}\n${body}\n`;

  const slug = f.replace(/\.md$/, '');
  fs.writeFileSync(path.join(BLOG, `${slug}.md`), out);
  converted++;
}

console.log(`Converted ${converted} articles into blog/ (${skipped} skipped).`);
