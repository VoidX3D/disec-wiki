/**
 * Static file handler — the core of the asset pipeline.
 *
 * Capabilities:
 *   - Range requests (Accept-Ranges, 206 partial content) for large files
 *   - Conditional GET (ETag, If-None-Match, If-Modified-Since → 304)
 *   - HEAD requests (headers only, no body)
 *   - On-the-fly gzip/brotli compression for compressible types
 *   - Streaming with backpressure (never buffers whole files in memory)
 *   - Immutable long-cache for versioned assets, no-cache for HTML
 *   - Directory index resolution + trailing-slash redirects
 *   - Path traversal protection
 *   - PDFs get `Content-Disposition: inline` (browser viewer)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { mimeFor, isCompressible, isImmutableAsset } from './mime.mjs';

const DOWNLOAD_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.epub', '.zip']);

export function createStaticHandler({ root, assetMaxAge = 31536000, htmlMaxAge = 0, compress = true, gzipLevel = 6, brotliQuality = 5, minCompressBytes = 1024 }) {
  root = path.resolve(root);

  function resolvePath(pathname) {
    if (pathname.endsWith('.md')) return { redirect: pathname.slice(0, -3) + '.html' };

    let rel = pathname === '/' ? '/index.html' : pathname;
    if (rel.includes('..')) {
      const normalized = path.normalize(rel);
      if (normalized.startsWith('..')) return null;
    }
    let file = path.join(root, rel);

    // Traversal guard
    if (!file.startsWith(root)) return null;

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith('/')) return { redirect: pathname + '/' };
      file = path.join(file, 'index.html');
    }
    return { file };
  }

  function sendFile(req, res, file, { stat, headers = {} }) {
    const ext = path.extname(file).toLowerCase();
    const type = mimeFor(file);
    const isAsset = isImmutableAsset(file);

    const cacheControl = isAsset
      ? `public, max-age=${assetMaxAge}, immutable`
      : (ext === '.html' || ext === '.htm' ? `public, max-age=${htmlMaxAge}` : 'public, max-age=3600');

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Accept-Ranges', 'bytes');

    // Content-Disposition — inline for documents so PDF viewer works in-tab.
    if (DOWNLOAD_EXT.has(ext)) {
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(file)}"`);
    }

    // ETag for conditional requests
    const etag = `"${crypto.createHash('md5').update(`${stat.size}-${stat.mtimeMs}`).digest('hex')}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    // Conditional GET — 304
    const inm = req.headers['if-none-match'];
    const ims = req.headers['if-modified-since'];
    if (inm === etag || (inm?.startsWith('W/') && inm === `W/${etag}`) || (inm && inm.includes(etag))) {
      res.statusCode = 304;
      res.end();
      return;
    }
    if (!inm && ims) {
      const since = Date.parse(ims);
      if (Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(since / 1000)) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }

    // Range support — single range for now (sufficient for PDF/video).
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] === '' ? undefined : parseInt(m[1], 10);
        let end = m[2] === '' ? undefined : parseInt(m[2], 10);
        if (start === undefined) { start = stat.size - (end || 1); end = stat.size - 1; }
        if (end === undefined) end = stat.size - 1;
        if (start < stat.size && start <= end && start >= 0) {
          end = Math.min(end, stat.size - 1);
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', end - start + 1);
          res.setHeader('Content-Encoding', 'identity');
          const rangeStream = fs.createReadStream(file, { start, end });
          rangeStream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
          rangeStream.pipe(res);
          return;
        }
        // Unsatisfiable range
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        res.end();
        return;
      }
    }

    // HEAD — headers only
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', stat.size);
      res.end();
      return;
    }

    // Compression — only for compressible, sufficiently-large files.
    let encoding = 'identity';
    if (compress && isCompressible(file) && stat.size >= minCompressBytes) {
      const accept = (req.headers['accept-encoding'] || '').toLowerCase();
      if (accept.includes('br')) encoding = 'br';
      else if (accept.includes('gzip') || accept.includes('x-gzip')) encoding = 'gzip';
    }
    if (encoding !== 'identity') {
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.removeHeader('Content-Length'); // streamed — length unknown pre-compression
      const stream = fs.createReadStream(file);
      stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
      const comp = encoding === 'br'
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality } })
        : zlib.createGzip({ level: gzipLevel });
      stream.pipe(comp).pipe(res);
      return;
    }

    // Plain streaming with known length.
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
    stream.pipe(res);
  }

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const resolved = resolvePath(req.pathname);
    if (!resolved) return next();

    if (resolved.redirect) {
      res.statusCode = 301;
      res.setHeader('Location', resolved.redirect);
      res.setHeader('Cache-Control', 'no-cache');
      res.end();
      return;
    }

    const { file } = resolved;
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) return next();
      sendFile(req, res, file, { stat });
    });
  };
}
