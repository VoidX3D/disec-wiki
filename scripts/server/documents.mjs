/**
 * Document handlers — PDF serving + DOCX serving & text extraction.
 *
 * PDF:  served with range support + inline disposition so the browser PDF
 *       viewer works; `?dl=` forces attachment download.
 * DOCX: served as attachment; `/api/docx/text?path=` extracts plain text
 *       from the OOXML zip (via `unzip -p ... word/document.xml`).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { execFile } from 'child_process';
import { mimeFor, isCompressible } from './mime.mjs';
import { json } from './middleware.mjs';

function etagFor(stat) {
  return `"${crypto.createHash('md5').update(`${stat.size}-${stat.mtimeMs}`).digest('hex')}"`;
}

/**
 * Safely resolve a URL pathname to a file under `root`.
 * Returns null when the result escapes root (path traversal).
 * `pathname` starts with `/`; we strip it and use `path.resolve` semantics
 * that normalize `..` segments against root.
 */
function resolve(root, pathname) {
  const rel = pathname.replace(/^\/+/, '');
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

/**
 * Generic range-capable, streaming file sender shared by PDF/DOCX routes.
 * Returns 206 for Range, 304 for conditional GET, streams with backpressure.
 */
export function createFileSender({ root, assetMaxAge = 31536000, compress = true }) {
  root = path.resolve(root);

  return function send(req, res, file, { disposition = 'inline' } = {}) {
    if (!file) { json(req, res, 403, { error: 'Forbidden' }); return; }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { json(req, res, 404, { error: 'Not found' }); return; }

      res.setHeader('Content-Type', mimeFor(file));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', `public, max-age=${assetMaxAge}`);
      res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(file)}"`);

      const etag = etagFor(stat);
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());

      const inm = req.headers['if-none-match'];
      if (inm && (inm === etag || inm.includes(etag))) { res.statusCode = 304; res.end(); return; }

      // Range
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (m) {
          let start = m[1] === '' ? undefined : parseInt(m[1], 10);
          let end = m[2] === '' ? undefined : parseInt(m[2], 10);
          if (start === undefined) { start = stat.size - (end || 1); end = stat.size - 1; }
          if (end === undefined) end = stat.size - 1;
          if (start >= 0 && start < stat.size && start <= end) {
            end = Math.min(end, stat.size - 1);
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', end - start + 1);
            const rs = fs.createReadStream(file, { start, end });
            rs.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
            rs.pipe(res);
            return;
          }
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          res.end();
          return;
        }
      }

      if (req.method === 'HEAD') { res.setHeader('Content-Length', stat.size); res.end(); return; }

      // Compression for text-ish documents is unnecessary (PDF/DOCX are binary).
      if (compress && isCompressible(file) && stat.size > 1024) {
        const accept = (req.headers['accept-encoding'] || '').toLowerCase();
        if (accept.includes('br') || accept.includes('gzip')) {
          const enc = accept.includes('br') ? 'br' : 'gzip';
          res.setHeader('Content-Encoding', enc);
          res.setHeader('Vary', 'Accept-Encoding');
          res.removeHeader('Content-Length');
          const comp = enc === 'br'
            ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
            : zlib.createGzip({ level: 6 });
          const s = fs.createReadStream(file);
          s.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
          s.pipe(comp).pipe(res);
          return;
        }
      }

      res.setHeader('Content-Length', stat.size);
      const stream = fs.createReadStream(file);
      stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
      stream.pipe(res);
    });
  };
}

/** PDF handler factory — serves /downloads/*.pdf (and other docs). */
export function createPdfHandler({ downloadsDir, assetMaxAge }) {
  const send = createFileSender({ root: downloadsDir, assetMaxAge });
  return (req, res) => {
    const q = req.query;
    const dl = q.get('dl') === '1' || q.get('download') === '1';
    // downloadsDir is the site root; PDFs live under site/downloads/.
    const file = resolve(downloadsDir, req.pathname);
    send(req, res, file, { disposition: dl ? 'attachment' : 'inline' });
  };
}

/**
 * DOCX text extraction — unzips `word/document.xml` and strips markup.
 * Returns plain text with paragraph breaks preserved.
 */
export function extractDocxText(file, cb) {
  execFile('unzip', ['-p', file, 'word/document.xml'], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
    if (err) { cb(err, null); return; }
    const text = stdout
      .replace(/<\/w:p>/g, '\n')      // paragraph end → newline
      .replace(/<w:tab\/>/g, '\t')    // tabs
      .replace(/<[^>]+>/g, '')        // strip remaining tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    cb(null, text);
  });
}

/** DOCX API handler — serves the file and exposes /api/docx/text. */
export function createDocxHandler({ docxDir }) {
  docxDir = path.resolve(docxDir);
  const send = createFileSender({ root: docxDir, assetMaxAge: 3600 });

  return (req, res) => {
    if (req.pathname.startsWith('/api/docx/text')) {
      const target = req.pathname.replace(/^\/api\/docx\/text\//, '');
      const abs = resolve(docxDir, target);
      if (!abs) { json(req, res, 403, { error: 'Forbidden' }); return; }
      extractDocxText(abs, (err, text) => {
        if (err || text == null) { json(req, res, 400, { error: 'Could not extract text (not a valid DOCX?)' }); return; }
        json(req, res, 200, { path: target, chars: text.length, text });
      });
      return;
    }

    const rel = req.pathname.replace(/^\/downloads\//, '');
    const file = resolve(docxDir, rel);
    if (!file) { json(req, res, 403, { error: 'Forbidden' }); return; }
    send(req, res, file, { disposition: 'attachment' });
  };
}
