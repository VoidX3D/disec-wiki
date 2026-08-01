#!/usr/bin/env node
/**
 * DISEC Research Wiki — static server + RSS proxy + search API
 *
 * Features:
 *   - Static file serving with gzip/brotli compression
 *   - Structured JSON logging (access + error)
 *   - Client data capture (IP, user-agent, referrer)
 *   - Request timing + response size
 *   - Rate limiting (per-IP)
 *   - Security headers (CSP, HSTS, X-Frame-Options)
 *   - Graceful shutdown
 *   - /api/rss — RSS aggregation
 *   - /api/health — health check
 *   - /api/search — FlexSearch index endpoint
 *   - Structured error pages (403, 404, 429, 500)
 *
 * Run: npm run serve
 * Open: http://localhost:8000
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const SITE = path.join(WIKI, 'site');
const PORT = parseInt(process.env.PORT) || 8000;
const LOG_DIR = path.join(WIKI, 'logs');
const SEARCH_INDEX = path.join(SITE, 'search', 'flexsearch-index.json');

fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Structured logger ────────────────────────────────────────────
const logFile = path.join(LOG_DIR, `server-${new Date().toISOString().slice(0, 10)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(entry) {
  const line = JSON.stringify(entry);
  console.log(line);
  logStream.write(line + '\n');
}

function logAccess(req, res, meta = {}) {
  log({
    level: 'info',
    ts: new Date().toISOString(),
    type: 'access',
    method: req.method,
    url: req.url,
    status: res.statusCode,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    ua: req.headers['user-agent'] || '',
    ref: req.headers['referer'] || '',
    size: meta.size || 0,
    time: meta.time || 0,
    encoding: meta.encoding || '',
    ...meta,
  });
}

function logError(err, req, extra = {}) {
  log({
    level: 'error',
    ts: new Date().toISOString(),
    type: 'error',
    message: err.message,
    stack: err.stack,
    url: req ? req.url : '',
    ip: req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '',
    ua: req ? (req.headers['user-agent'] || '') : '',
    ...extra,
  });
}

function logEvent(type, data = {}) {
  log({ level: 'info', ts: new Date().toISOString(), type, ...data });
}

// ── Rate limiter (sliding window, per-IP) ────────────────────────
const rateBuckets = new Map();
const RATE_WINDOW = 60_000; // 1 minute
const RATE_MAX = 120; // requests per window

function isRateLimited(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket) {
    bucket = { count: 1, windowStart: now };
    rateBuckets.set(ip, bucket);
    return false;
  }
  if (now - bucket.windowStart > RATE_WINDOW) {
    bucket.count = 1;
    bucket.windowStart = now;
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_MAX;
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.windowStart > RATE_WINDOW * 2) rateBuckets.delete(ip);
  }
}, 300_000).unref();

// ── RSS feeds ────────────────────────────────────────────────────
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' },
});

const FEEDS = [
  { id: 'un', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', source: 'UN News' },
  { id: 'bbc', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  { id: 'defense-news', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', source: 'Defense News' },
  { id: 'hrw', url: 'https://www.hrw.org/rss.xml', source: 'Human Rights Watch' },
  { id: 'bbc-world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
];

// ── MIME types ───────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.rss': 'application/rss+xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.ics': 'text/calendar',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.epub': 'application/epub+zip',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.br': 'application/octet-stream',
  '.tar': 'application/x-tar',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
};

const COMPRESSIBLE = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md', '.xml', '.rss', '.csv', '.webmanifest', '.map']);

// ── Security headers ─────────────────────────────────────────────
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ── Helpers ──────────────────────────────────────────────────────
function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

function errorPage(res, status, title, message) {
  const themes = {
    '404': { bg: '#f0f4f8', accent: '#4051b5', icon: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>', hint: 'The page was moved, renamed or never existed.' },
    '503': { bg: '#fef3c7', accent: '#a16207', icon: '<path d="M14.7 6.3a5 5 0 0 0-6.8 6L2 18.2V21a1 1 0 0 0 1 1h2.8l5.9-5.9a5 5 0 0 0 6-6.8l-2.7 2.7-3.2-.5-.5-3.2z"/>', hint: 'The static build output is missing or incomplete.' },
    '429': { bg: '#fef3c7', accent: '#a16207', icon: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', hint: 'Too many requests — please slow down and try again.' },
    '403': { bg: '#fef3c7', accent: '#a16207', icon: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', hint: 'You do not have permission to access this resource.' },
  };
  const t = themes[String(status)] || { bg: '#fee2e2', accent: '#b91c1c', icon: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', hint: 'Something went wrong on our side.' };
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>`;
  const home = `<a class="btn" href="/"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg><span>Home</span></a>`;
  const back = `<a class="btn" href="javascript:history.back()"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg><span>Go back</span></a>`;
  const check = `<a class="btn btn--accent" href="/api/health"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span>Check status</span></a>`;
  const actions = status === 503 ? `${home}\n  ${check}` : `${home}\n  ${back}`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    ...SECURITY_HEADERS,
  });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${status} ${title} — DISEC Research Wiki</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{min-height:100%}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:${t.bg};display:flex;align-items:center;justify-content:center;padding:2rem;color:#1b1f27}
  .card{background:#fff;border-radius:16px;padding:2.75rem 3rem;max-width:520px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.10);border:1px solid rgba(0,0,0,.06)}
  .badge{display:inline-flex;align-items:center;gap:.5rem;width:3.25rem;height:3.25rem;border-radius:12px;background:color-mix(in srgb, ${t.accent} 12%, #fff);color:${t.accent};justify-content:center;margin-bottom:1.25rem}
  h1{font-size:4rem;font-weight:800;letter-spacing:-.04em;line-height:1;color:#1b1f27}
  h2{font-size:1.15rem;font-weight:700;color:#2a303a;margin-top:.6rem}
  p{color:#5a6472;margin-top:.75rem;line-height:1.6;font-size:.95rem}
  .hint{color:#8a94a3;font-size:.8rem}
  .actions{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;margin-top:1.75rem}
  a.btn{display:inline-flex;align-items:center;gap:.45rem;padding:.6rem 1.1rem;border-radius:10px;background:#f2f4f8;color:#333a45;text-decoration:none;font-weight:600;font-size:.86rem;border:1px solid #e3e6ea;transition:transform .12s, box-shadow .12s, border-color .12s}
  a.btn:hover{transform:translateY(-1px);border-color:#c7cdd8;box-shadow:0 3px 10px rgba(0,0,0,.08)}
  a.btn--accent{background:${t.accent};border-color:${t.accent};color:#fff}
  a.btn--accent:hover{filter:brightness(1.05)}
  code{background:#eef0f4;padding:.15em .4em;border-radius:4px;font-size:.85em}
  .meta{margin-top:1.75rem;padding-top:1rem;border-top:1px solid #e9ecf1;font-size:.72rem;color:#9aa2b0;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  @media (max-width:480px){.card{padding:2rem 1.5rem}}
</style></head><body><div class="card">
  <div class="badge">${icon}</div>
  <h1>${status}</h1>
  <h2>${title}</h2>
  <p>${message}</p>
  <p class="hint">${t.hint}</p>
  <div class="actions">
  ${actions}
  </div>
  <div class="meta"><span>DISEC Research Wiki · Iran Delegation</span><span>${new Date().toUTCString()}</span></div>
</div></body></html>`);
}

// ── RSS feed fetcher ─────────────────────────────────────────────
async function fetchFeed(feed, limit) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      logError(new Error(`Feed ${feed.id} returned ${res.status}`), null, { feed: feed.id, status: res.status });
      return [];
    }
    const r = await parser.parseString(await res.text());
    return (r.items || []).slice(0, limit).map(it => ({
      title: it.title || 'Untitled',
      link: it.link || '',
      content: stripHtml(it.contentSnippet || it.content || '').slice(0, 300),
      pubDate: it.pubDate || it.isoDate || '',
      source: feed.source,
      sourceId: feed.id,
    }));
  } catch (e) {
    logError(e, null, { feed: feed.id, phase: 'rss-fetch' });
    return [];
  }
}

// ── Search index loader ──────────────────────────────────────────
let searchIndex = null;
let searchIndexMtime = 0;

function loadSearchIndex() {
  try {
    if (!fs.existsSync(SEARCH_INDEX)) return null;
    const stat = fs.statSync(SEARCH_INDEX);
    if (searchIndex && stat.mtimeMs === searchIndexMtime) return searchIndex;
    const raw = fs.readFileSync(SEARCH_INDEX, 'utf8');
    searchIndex = JSON.parse(raw);
    searchIndexMtime = stat.mtimeMs;
    logEvent('search-index-loaded', { docs: searchIndex.docs?.length || 0, size: stat.size });
    return searchIndex;
  } catch (e) {
    logError(e, null, { phase: 'load-search-index' });
    return null;
  }
}

// ── HTTP server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const reqId = crypto.randomUUID().slice(0, 8);
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const ref = req.headers['referer'] || '';

  // Attach request ID
  res.setHeader('X-Request-Id', reqId);

  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch (e) {
    logError(e, req, { reqId, phase: 'url-parse' });
    errorPage(res, 400, 'Bad Request', 'Invalid URL.');
    logAccess(req, res, { reqId, status: 400, time: Date.now() - startTime, ip, ua });
    return;
  }

  const pathname = decodeURIComponent(url.pathname);

  // Rate limit
  if (isRateLimited(ip)) {
    logAccess(req, res, { reqId, status: 429, time: Date.now() - startTime, ip, ua, rateLimited: true });
    errorPage(res, 429, 'Too Many Requests', `Rate limit exceeded. Try again in a minute.`);
    return;
  }

  try {
    // ── /api/rss ──────────────────────────────────────────────
    if (pathname === '/api/rss') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Allow': 'GET', ...SECURITY_HEADERS });
        res.end('Method Not Allowed');
        logAccess(req, res, { reqId, status: 405, time: Date.now() - startTime, ip, ua });
        return;
      }
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 12, 50);
      const sources = (url.searchParams.get('sources') || '').split(',').filter(Boolean);
      const active = FEEDS.filter(f => sources.length === 0 || sources.includes(f.id));
      const results = await Promise.all(active.map(f => fetchFeed(f, limit)));
      const articles = results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      const body = JSON.stringify({ total: articles.length, articles, ts: new Date().toISOString() });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
      res.end(body);
      logAccess(req, res, { reqId, status: 200, time: Date.now() - startTime, ip, ua, articles: articles.length, feeds: active.length });
      return;
    }

    // ── /api/health ──────────────────────────────────────────
    if (pathname === '/api/health') {
      const uptime = process.uptime();
      const mem = process.memoryUsage();
      const body = JSON.stringify({
        status: 'ok',
        uptime: Math.round(uptime),
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
        site: { exists: fs.existsSync(SITE), pages: fs.existsSync(path.join(SITE, 'index.html')) },
        search: { indexLoaded: !!searchIndex, docs: searchIndex?.docs?.length || 0 },
        timestamp: new Date().toISOString(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(body);
      logAccess(req, res, { reqId, status: 200, time: Date.now() - startTime, ip, ua, phase: 'health' });
      return;
    }

    // ── /api/search ──────────────────────────────────────────
    if (pathname === '/api/search') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Allow': 'GET', ...SECURITY_HEADERS });
        res.end('Method Not Allowed');
        logAccess(req, res, { reqId, status: 405, time: Date.now() - startTime, ip, ua });
        return;
      }
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) {
        res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({ query: '', results: [], total: 0 }));
        logAccess(req, res, { reqId, status: 200, time: Date.now() - startTime, ip, ua, query: '' });
        return;
      }

      const idx = loadSearchIndex();
      if (!idx || !idx.docs) {
        res.writeHead(503, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({ error: 'Search index not available' }));
        logAccess(req, res, { reqId, status: 503, time: Date.now() - startTime, ip, ua, query: q });
        return;
      }

      // Simple TF-IDF-like search: match query terms against doc titles + text
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = idx.docs.map(doc => {
        const titleLower = (doc.title || '').toLowerCase();
        const textLower = (doc.text || '').toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (titleLower.includes(t)) score += 10;
          if (textLower.includes(t)) score += 1;
        }
        return { ...doc, score };
      }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);

      const body = JSON.stringify({ query: q, results: scored, total: scored.length });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS });
      res.end(body);
      logAccess(req, res, { reqId, status: 200, time: Date.now() - startTime, ip, ua, query: q, hits: scored.length });
      return;
    }

    // ── Static file serving ──────────────────────────────────
    // .md → .html redirect
    let pathnameClean = pathname;
    if (pathnameClean.endsWith('.md')) {
      pathnameClean = pathnameClean.slice(0, -3) + '.html';
      res.writeHead(301, { Location: pathnameClean, ...SECURITY_HEADERS });
      res.end();
      logAccess(req, res, { reqId, status: 301, time: Date.now() - startTime, ip, ua, redirect: pathnameClean });
      return;
    }

    let rel = pathnameClean === '/' ? '/index.html' : pathnameClean;
    let file = path.join(SITE, rel);

    // Path traversal guard
    if (!file.startsWith(SITE)) {
      errorPage(res, 403, 'Forbidden', 'Path traversal not allowed.');
      logAccess(req, res, { reqId, status: 403, time: Date.now() - startTime, ip, ua, blocked: 'traversal' });
      return;
    }

    // Directory → trailing slash + index.html
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathnameClean.endsWith('/')) {
        res.writeHead(301, { Location: pathnameClean + '/', ...SECURITY_HEADERS });
        res.end();
        logAccess(req, res, { reqId, status: 301, time: Date.now() - startTime, ip, ua, redirect: pathnameClean + '/' });
        return;
      }
      file = path.join(file, 'index.html');
    }

    // 404
    if (!fs.existsSync(file)) {
      errorPage(res, 404, 'Page Not Found', `The page <code>${pathname}</code> does not exist.`);
      logAccess(req, res, { reqId, status: 404, time: Date.now() - startTime, ip, ua, ref });
      return;
    }

    const stat = fs.statSync(file);
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isCompressibleType = COMPRESSIBLE.has(ext);
    const isAsset = /\.(js|css|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|ico|map)(\.map)?$/.test(pathname);

    const cache = isAsset
      ? 'public, max-age=31536000, immutable'
      : (pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');

    const headers = {
      'Content-Type': type,
      'Cache-Control': cache,
      'Content-Length': stat.size,
      ...SECURITY_HEADERS,
    };

    // ETag for conditional requests
    const hash = crypto.createHash('md5').update(`${stat.size}-${stat.mtimeMs}`).digest('hex');
    headers['ETag'] = `"${hash}"`;
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === `"${hash}"`) {
      res.writeHead(304, headers);
      res.end();
      logAccess(req, res, { reqId, status: 304, time: Date.now() - startTime, ip, ua });
      return;
    }

    // Compression
    const accept = (req.headers['accept-encoding'] || '').toLowerCase();
    if (isCompressibleType) {
      if (accept.includes('br')) headers['Content-Encoding'] = 'br';
      else if (accept.includes('gzip') || accept.includes('x-gzip')) headers['Content-Encoding'] = 'gzip';
    }

    res.writeHead(200, headers);

    const stream = fs.createReadStream(file);
    if (headers['Content-Encoding'] === 'br') {
      stream.pipe(zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })).pipe(res);
    } else if (headers['Content-Encoding'] === 'gzip') {
      stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else {
      stream.pipe(res);
    }

    stream.on('error', (err) => {
      logError(err, req, { reqId, phase: 'stream', file });
      if (!res.headersSent) {
        errorPage(res, 500, 'Internal Server Error', 'Failed to serve file.');
      }
    });

    logAccess(req, res, {
      reqId, status: 200, time: Date.now() - startTime, ip, ua, ref,
      file: path.relative(SITE, file), size: stat.size,
      encoding: headers['Content-Encoding'] || 'identity',
    });
  } catch (err) {
    logError(err, req, { reqId, phase: 'handler' });
    if (!res.headersSent) {
      errorPage(res, 500, 'Internal Server Error', 'Something went wrong.');
    }
    logAccess(req, res, { reqId, status: 500, time: Date.now() - startTime, ip, ua });
  }
});

// ── Graceful shutdown ────────────────────────────────────────────
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logEvent('shutdown', { signal, pid: process.pid });
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    logStream.end(() => {
      console.log('Server closed. Logs saved.');
      process.exit(0);
    });
  });
  // Force kill after 5s
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Start ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  logEvent('start', { port: PORT, pid: process.pid, site: SITE });
  console.log(`DISEC Research Wiki running at http://localhost:${PORT}`);
  console.log(`PID: ${process.pid}`);
  console.log(`Logs: ${logFile}`);
  console.log(`APIs: /api/rss · /api/health · /api/search`);
  console.log('Press Ctrl+C to stop.');
});

server.on('error', (err) => {
  logError(err, null, { phase: 'server-startup' });
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the other process or set PORT env.`);
  }
  process.exit(1);
});
