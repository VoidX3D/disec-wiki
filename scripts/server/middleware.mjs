/**
 * Middleware: request ID, access log, rate limiting, security headers, CORS.
 */
import crypto from 'crypto';

export function requestId(req, res, next) {
  req.id = crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
}

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

export function accessLog(logger) {
  return (req, res, next) => {
    req._start = Date.now();
    res.once('finish', () => {
      if (!logger || req.skipAccessLog) return;
      logger.access(req, res, {
        reqId: req.id,
        ip: req.ip,
        ua: req.headers['user-agent'] || '',
        size: res.getHeader('content-length') || 0,
        time: Date.now() - req._start,
        encoding: res.getHeader('content-encoding') || '',
      });
    });
    next();
  };
}

/**
 * Sliding-window per-IP rate limiter. Stores buckets in a Map; stale
 * buckets are pruned on an interval. Returns true when limited.
 */
export function rateLimiter({ max = 240, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  const key = (req) => req.ip || 'unknown';

  const limiter = (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let b = buckets.get(k);
    if (!b) { b = { count: 1, start: now }; buckets.set(k, b); }
    else {
      if (now - b.start > windowMs) { b.count = 1; b.start = now; }
      else b.count++;
    }
    if (b.count > max) {
      res.statusCode = 429;
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Too many requests', retryAfter: Math.ceil(windowMs / 1000) }));
      req.skipAccessLog = false;
      return;
    }
    next();
  };

  limiter.prune = () => {
    const now = Date.now();
    for (const [k, b] of buckets) if (now - b.start > windowMs * 2) buckets.delete(k);
  };
  return limiter;
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://www.google-analytics.com; frame-ancestors 'self'");
  next();
}

export function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, If-Modified-Since, Range');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  next();
}

/** Attach req.pathname (decoded) once, before routing. */
export function parsePath(req, res, next) {
  try {
    req.pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    req.pathname = req.url.split('?')[0];
  }
  req.query = new URL(req.url, 'http://localhost').searchParams;
  req.ip = clientIp(req);
  next();
}

export function json(req, res, status = 200, data) {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

export function text(req, res, status = 200, data, type = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', Buffer.byteLength(data));
  res.end(data);
}

export function notFound(req, res) {
  json(req, res, 404, { error: 'Not found', path: req.pathname });
}
