#!/usr/bin/env node
/**
 * Build a lightweight search index from the built site HTML.
 *
 * Extracts titles, text content, and headings from every .html file.
 * Generates two files:
 *   - flexsearch-index.json  (for client-side search)
 *   - search-index.json      (for server-side search API)
 *
 * Run: node scripts/build-search-index.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const OUT_DIR = path.join(SITE, 'search');

if (!fs.existsSync(SITE)) {
  console.error('site/ not found — run mkdocs build first');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Text extraction from HTML ────────────────────────────────────
function stripTags(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) return stripTags(m[1]).trim();
  const m2 = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m2) return stripTags(m2[1]).trim();
  return '';
}

function extractHeadings(html) {
  const headings = [];
  const re = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    headings.push(stripTags(m[2]).trim());
  }
  return headings;
}

function extractText(html) {
  // Remove nav, header, footer, sidebar
  let clean = html
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<div class="md-sidebar[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  return stripTags(clean).slice(0, 500);
}

// ── Scan site for HTML files ─────────────────────────────────────
function findHtmlFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const htmlFiles = findHtmlFiles(SITE);
console.log(`Scanning ${htmlFiles.length} HTML files...`);

const docs = [];
for (const file of htmlFiles) {
  const rel = path.relative(SITE, file).replace(/\\/g, '/');
  if (rel === '404.html') continue;

  const html = fs.readFileSync(file, 'utf8');
  const title = extractTitle(html);
  const headings = extractHeadings(html);
  const text = extractText(html);

  if (!title && !text) continue;

  docs.push({
    id: rel,
    location: '/' + rel,
    title,
    headings,
    text,
    // Pre-tokenized for fast search
    tokens: (title + ' ' + headings.join(' ') + ' ' + text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 1),
  });
}

console.log(`Indexed ${docs.length} pages`);

// ── Build inverted index for fast keyword search ─────────────────
const invertedIndex = {};
for (const doc of docs) {
  const termFreq = {};
  for (const token of doc.tokens) {
    termFreq[token] = (termFreq[token] || 0) + 1;
  }
  for (const [term, freq] of Object.entries(termFreq)) {
    if (!invertedIndex[term]) invertedIndex[term] = [];
    invertedIndex[term].push({ id: doc.id, freq });
  }
}

// ── Write outputs ────────────────────────────────────────────────
// Client-side index (lightweight)
const clientIndex = docs.map(d => ({
  location: d.location,
  title: d.title,
  text: d.text.slice(0, 250),
}));
fs.writeFileSync(
  path.join(OUT_DIR, 'flexsearch-index.json'),
  JSON.stringify({ docs: clientIndex, generated: new Date().toISOString() })
);

// Server-side index (with inverted index for fast search)
const serverIndex = {
  docs: docs.map(d => ({
    id: d.id,
    location: d.location,
    title: d.title,
    headings: d.headings,
    text: d.text,
  })),
  invertedIndex,
  generated: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(OUT_DIR, 'search-index.json'),
  JSON.stringify(serverIndex)
);

const clientSize = fs.statSync(path.join(OUT_DIR, 'flexsearch-index.json')).size;
const serverSize = fs.statSync(path.join(OUT_DIR, 'search-index.json')).size;
console.log(`Client index: ${(clientSize / 1024).toFixed(0)}KB`);
console.log(`Server index: ${(serverSize / 1024).toFixed(0)}KB`);
console.log(`Inverted index: ${Object.keys(invertedIndex).length} unique terms`);
