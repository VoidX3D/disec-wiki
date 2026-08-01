#!/usr/bin/env node
/**
 * Resolve every remote image embedded in the docs to a local file.
 *
 * Scraped reference pages (and a few hand-written pages) contain hundreds of
 * absolute https:// image URLs that would break the "100% offline" promise.
 * This script downloads each unique image into static/img/refs/<file> and
 * rewrites the markdown to reference it via /img/refs/<file>. Images that fail
 * to download (hotlink protection, 404, timeouts) are dropped from the doc.
 *
 * Run: npm run images
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const REFS_OUT = path.join(WIKI, 'static', 'img', 'refs');
const DOC_DIRS = ['docs'];

const TIMEOUT_MS = 20000;
const MAX_CONCURRENCY = 8;

function collectFiles() {
  const out = [];
  for (const dir of DOC_DIRS) {
    const base = path.join(WIKI, dir);
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        const fp = path.join(d, f);
        const st = fs.statSync(fp);
        if (st.isDirectory()) walk(fp);
        else if (f.endsWith('.md')) out.push(fp);
      }
    };
    walk(base);
  }
  return out;
}

function imagePatterns(md) {
  const urls = new Map(); // url -> count
  const re = /!\[([^\]]*)\]\((\s*(https?:\/\/[^)]+?)\s*)(\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(md))) {
    const url = m[2].trim().replace(/^["']|["']$/g, '');
    if (!/^https?:\/\//i.test(url)) continue;
    urls.set(url, (urls.get(url) || 0) + 1);
  }
  // Also catch raw <img src="http..."> tags from scraped HTML
  const reImg = /<img[^>]*src\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = reImg.exec(md))) {
    urls.set(m[1], (urls.get(m[1]) || 0) + 1);
  }
  return urls;
}

function extFor(url, contentType) {
  const clean = url.split('?')[0].toLowerCase();
  const guess = path.extname(clean);
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp'].includes(guess)) {
    return guess;
  }
  const fromType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/x-icon': '.ico',
  }[contentType];
  return fromType || '.img';
}

function hashUrl(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

async function fetchWithRetry(url, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
          referer: url,
        },
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      return { buf, type };
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

function rewriteMarkdown(md, mapping) {
  // Markdown images
  md = md.replace(/!\[([^\]]*)\]\((\s*(https?:\/\/[^)]+?)\s*)(\s+"[^"]*")?\)/g, (m, alt, _ws, url) => {
    const local = mapping.get(url);
    if (!local) return '';
    const altAttr = alt && alt !== '!' ? alt : '';
    return `![${altAttr}](${local})`;
  });
  // Raw <img src="http..."> tags
  md = md.replace(/<img[^>]*src\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi, (m, url) => {
    const local = mapping.get(url);
    if (!local) return '';
    const altMatch = /alt\s*=\s*["']([^"']*)["']/i.exec(m);
    const alt = altMatch ? altMatch[1] : '';
    return `![${alt}](${local})`;
  });
  return md;
}

fs.mkdirSync(REFS_OUT, { recursive: true });

const allUrls = new Map();
const owners = new Map(); // url -> [file...]
for (const fp of collectFiles()) {
  const md = fs.readFileSync(fp, 'utf-8');
  const urls = imagePatterns(md);
  for (const [url, count] of urls) {
    allUrls.set(url, (allUrls.get(url) || 0) + count);
    const list = owners.get(url) || [];
    if (!list.includes(fp)) list.push(fp);
    owners.set(url, list);
  }
}

console.log(`Found ${allUrls.size} unique remote images across ${owners.size} files.`);

const mapping = new Map(); // url -> /img/refs/file.ext
const failed = [];
let done = 0;

const queue = [...allUrls.keys()];
async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const relPath = hashUrl(url) + (() => {
      const clean = url.split('?')[0].toLowerCase();
      const guess = path.extname(clean);
      return ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp'].includes(guess) ? guess : '.img';
    })();
    const dest = path.join(REFS_OUT, relPath);
    let ok = false;
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      ok = true; // already cached
    } else {
      try {
        const { buf, type } = await fetchWithRetry(url);
        const finalRel = hashUrl(url) + extFor(url, type);
        const finalDest = path.join(REFS_OUT, finalRel);
        fs.writeFileSync(finalDest, buf);
        mapping.set(url, '/img/refs/' + finalRel);
        ok = true;
      } catch (e) {
        failed.push({ url, err: e.message });
      }
    }
    if (ok && !mapping.has(url)) {
      mapping.set(url, '/img/refs/' + relPath);
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${allUrls.size} images processed…`);
  }
}

await Promise.all(Array.from({ length: MAX_CONCURRENCY }, () => worker()));

// Rewrite each file that referenced images
let rewritten = 0;
for (const fp of collectFiles()) {
  let md = fs.readFileSync(fp, 'utf-8');
  const before = md;
  md = rewriteMarkdown(md, mapping);
  if (md !== before) {
    fs.writeFileSync(fp, md);
    rewritten++;
    console.log(`+ rewrote  ${path.relative(WIKI, fp)}`);
  }
}

console.log(`\nDownloaded/reused ${mapping.size} images, rewrote ${rewritten} files.`);
if (failed.length) {
  console.log(`\nDropped ${failed.length} images (couldn't fetch):`);
  for (const f of failed.slice(0, 15)) console.log(`  - ${f.url} (${f.err})`);
  if (failed.length > 15) console.log(`  … and ${failed.length - 15} more`);
}
