/**
 * Server configuration — single source of truth for all runtime settings.
 * Every value can be overridden via environment variables, so the same code
 * runs locally, in Docker, or in a multi-process (cluster) deployment.
 */
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WIKI = path.resolve(__dirname, '..', '..');

function num(env, def) {
  const n = parseInt(env, 10);
  return Number.isFinite(n) ? n : def;
}

function str(env, def) {
  return env !== undefined && env !== '' ? env : def;
}

function bool(env, def) {
  if (env === undefined || env === '') return def;
  return env === '1' || env === 'true' || env === 'yes' || env === 'on';
}

function resolve(env, fallback) {
  return path.resolve(env && env !== '' ? env : fallback);
}

export const config = {
  // Core
  host: str(process.env.HOST, '0.0.0.0'),
  port: num(process.env.PORT, 8000),
  siteDir: resolve(process.env.SITE_DIR, path.join(WIKI, 'site')),
  logDir: resolve(process.env.LOG_DIR, path.join(WIKI, 'logs')),
  docxDir: resolve(process.env.DOCX_DIR, path.join(WIKI, 'downloads')),

  // Scaling — 1 process by default, N workers for multi-core.
  workers: num(process.env.WORKERS, 1),
  maxWorkers: num(process.env.MAX_WORKERS, Math.max(1, os.cpus().length)),

  // Compression
  compress: bool(process.env.COMPRESS, true),
  gzipLevel: num(process.env.GZIP_LEVEL, 6),
  brotliQuality: num(process.env.BROTLI_QUALITY, 5),
  minCompressBytes: num(process.env.MIN_COMPRESS_BYTES, 1024),

  // Static asset caching
  assetMaxAge: num(process.env.ASSET_MAX_AGE, 31536000), // 1 year
  htmlMaxAge: num(process.env.HTML_MAX_AGE, 0),

  // Rate limiting (per IP, sliding window)
  rateMax: num(process.env.RATE_MAX, 240),
  rateWindowMs: num(process.env.RATE_WINDOW_MS, 60_000),

  // Timeouts (ms)
  headersTimeoutMs: num(process.env.HEADERS_TIMEOUT_MS, 30_000),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 60_000),
  keepAliveTimeoutMs: num(process.env.KEEPALIVE_TIMEOUT_MS, 5_000),
  maxRequestsPerSocket: num(process.env.MAX_REQS_PER_SOCKET, 1000),

  // RSS proxy
  rssTimeoutMs: num(process.env.RSS_TIMEOUT_MS, 12_000),
  rssDefaultLimit: num(process.env.RSS_DEFAULT_LIMIT, 12),
  rssMaxLimit: num(process.env.RSS_MAX_LIMIT, 50),

  // Logging
  logAccess: bool(process.env.LOG_ACCESS, true),
  logRotateBytes: num(process.env.LOG_ROTATE_BYTES, 10 * 1024 * 1024),

  // Diagnostics
  healthIncludeMemory: bool(process.env.HEALTH_MEMORY, true),
};

export function summarize() {
  return {
    host: config.host,
    port: config.port,
    workers: config.workers,
    site: config.siteDir,
    logDir: config.logDir,
    compress: config.compress,
    rate: `${config.rateMax}/min`,
  };
}
