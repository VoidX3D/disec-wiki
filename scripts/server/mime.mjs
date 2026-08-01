/**
 * MIME type registry + classification helpers.
 */
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

const COMPRESSIBLE = new Set([
  '.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg', '.txt',
  '.md', '.xml', '.rss', '.csv', '.webmanifest', '.map', '.wasm',
]);

const ASSET_EXT = new Set([
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
  '.ico', '.bmp', '.tiff', '.tif', '.heic', '.woff2', '.woff', '.ttf', '.otf',
  '.eot', '.map', '.wasm', '.mp3', '.mp4', '.webm', '.ogg',
]);

export function mimeFor(filePath) {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return MIME[ext] || 'application/octet-stream';
}

export function isCompressible(filePath) {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return COMPRESSIBLE.has(ext);
}

export function isImmutableAsset(filePath) {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return ASSET_EXT.has(ext);
}

export { MIME };
