/**
 * DISEC Research Wiki — scalable static server + RSS proxy + search API.
 *
 *   npm run serve
 *
 * Framework layout:
 *   config.mjs      — all runtime settings (env-overridable)
 *   logger.mjs      — structured JSON logging with rotation
 *   router.mjs      — middleware pipeline + route matching
 *   middleware.mjs  — request id, access log, rate limit, security, CORS
 *   mime.mjs        — MIME registry
 *   static.mjs      — static assets (range, ETag, HEAD, compression)
 *   documents.mjs   — PDF + DOCX handlers (range, text extraction)
 *   api.mjs         — /api/rss, /api/health, /api/search
 *   errors.mjs      — HTML error pages
 *   cluster.mjs     — multi-process scaling + graceful shutdown
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import cluster from 'cluster';
import { config, WIKI, summarize } from './config.mjs';
import { createLogger } from './logger.mjs';
import { createRouter } from './router.mjs';
import { requestId, accessLog, rateLimiter, securityHeaders, cors, parsePath, notFound } from './middleware.mjs';
import { createStaticHandler } from './static.mjs';
import { createPdfHandler, createDocxHandler } from './documents.mjs';
import { createApiHandlers } from './api.mjs';
import { errorPage } from './errors.mjs';
import { shouldRunPrimary, startCluster, workerCount, handleWorkerShutdown } from './cluster.mjs';

// ── Logging ──────────────────────────────────────────────────────
const logger = createLogger({ logDir: config.logDir, rotateBytes: config.logRotateBytes });

// ── App assembly ─────────────────────────────────────────────────
function buildApp() {
  const app = createRouter();

  // Middleware pipeline
  app.use(parsePath);
  app.use(requestId);
  app.use(securityHeaders);
  if (config.rateMax > 0) {
    const limiter = rateLimiter({ max: config.rateMax, windowMs: config.rateWindowMs });
    setInterval(() => limiter.prune(), config.rateWindowMs).unref();
    app.use(limiter);
  }
  app.use(cors);
  if (config.logAccess) app.use(accessLog(logger));

  // Handlers
  const api = createApiHandlers({ siteDir: config.siteDir, rssTimeoutMs: config.rssTimeoutMs, rssDefaultLimit: config.rssDefaultLimit, rssMaxLimit: config.rssMaxLimit, logger });
  const pdf = createPdfHandler({ downloadsDir: config.siteDir, assetMaxAge: config.assetMaxAge });
  const docx = createDocxHandler({ docxDir: config.docxDir });
  const staticHandler = createStaticHandler({
    root: config.siteDir,
    assetMaxAge: config.assetMaxAge,
    htmlMaxAge: config.htmlMaxAge,
    compress: config.compress,
    gzipLevel: config.gzipLevel,
    brotliQuality: config.brotliQuality,
  });

  // API routes
  app.get('/api/rss', api.rss);
  app.get('/api/health', api.health);
  app.get('/api/search', api.search);
  app.get(/^\/api\/docx\/text\/.+\.docx$/, docx);

  // Robots.txt
  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n');
  });

  // Document routes — PDFs inside site/downloads; docx from docxDir.
  app.get(/^\/downloads\/.+\.(pdf|doc|docx|xlsx?|pptx?)$/, (req, res, next) => {
    if (req.pathname.endsWith('.pdf')) return pdf(req, res);
    if (req.pathname.endsWith('.docx')) return docx(req, res);
    return next();
  });

  // Terminal handler: static, then 404
  app.handle404 = (req, res) => {
    if (config.siteDir && fs.existsSync(path.join(config.siteDir, 'index.html'))) {
      staticHandler(req, res, () => {
        errorPage(req, res, 404, 'Page Not Found', `The page <code>${req.pathname}</code> does not exist.`);
      });
    } else {
      errorPage(req, res, 503, 'Site Not Built', 'Run <code>npm run build</code> first.');
    }
  };

  app.onError = (err, req, res) => {
    logger?.error('handler-error', { message: err.message, stack: err.stack, url: req.url, ip: req.ip });
    if (!res.headersSent) errorPage(req, res, 500, 'Internal Server Error', 'Something went wrong.');
    else res.end();
  };

  // Dispatch through middleware, with static serving as the terminal handler.
  app.handle = (req, res) => {
    app.dispatch(req, res, app.handle404);
  };

  return app;
}

// ── Server creation ──────────────────────────────────────────────
function createServer(app) {
  const server = http.createServer((req, res) => {
    app.handle(req, res);
  });

  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.requestTimeout = config.requestTimeoutMs;
  server.maxRequestsPerSocket = config.maxRequestsPerSocket;
  return server;
}

// ── Graceful shutdown ────────────────────────────────────────────
let shuttingDown = false;
function shutdown(server, signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger?.info('shutdown', { signal, pid: process.pid });
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    logger.close();
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 6000).unref();
}

// ── Entry ────────────────────────────────────────────────────────
const count = workerCount(config.workers, config.maxWorkers);

if (shouldRunPrimary(config.workers)) {
  // Primary process — manage workers.
  const stop = startCluster({ count, logger, onWorkerExit: () => shuttingDown });
  const onSig = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('cluster-shutdown', { signal: sig });
    stop();
  };
  process.on('SIGINT', () => onSig('SIGINT'));
  process.on('SIGTERM', () => onSig('SIGTERM'));
} else {
  handleWorkerShutdown();
  const app = buildApp();
  const server = createServer(app);

  server.on('error', (err) => {
    logger?.error('server-error', { message: err.message, code: err.code });
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Kill the other process or set PORT env.`);
    }
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    const info = summarize();
    logger?.info('start', { pid: process.pid, ...info, workers: cluster.isWorker ? count : 1 });
    console.log(`DISEC Research Wiki running at http://localhost:${config.port}`);
    console.log(`PID: ${process.pid}`);
    console.log(`Logs: ${path.join(config.logDir, `server-${new Date().toISOString().slice(0, 10)}.log`)}`);
    console.log(`APIs: /api/rss · /api/health · /api/search`);
    console.log(`Docs: PDF range + viewer · DOCX serve/extract · static range+ETag`);
    console.log('Press Ctrl+C to stop.');
  });

  process.on('SIGINT', () => shutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));
}
