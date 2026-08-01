/**
 * Structured JSON logger with size-based log rotation.
 * Writes to stdout (for capture) plus a rotating file under logDir.
 * The file component is optional — pass `file: false` to log to stdout only.
 */
import fs from 'fs';
import path from 'path';

export function createLogger({ logDir, rotateBytes = 10 * 1024 * 1024, file = true } = {}) {
  let stream = null;
  let filePath = null;
  let size = 0;

  if (file && logDir) {
    fs.mkdirSync(logDir, { recursive: true });
    filePath = path.join(logDir, `server-${new Date().toISOString().slice(0, 10)}.log`);
    stream = fs.createWriteStream(filePath, { flags: 'a' });
    try { size = fs.statSync(filePath).size; } catch { size = 0; }
  }

  function rotate() {
    if (!stream || !filePath) return;
    stream.end();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = `${filePath}.${stamp}`;
    try { fs.renameSync(filePath, rotated); } catch { /* ignore */ }
    stream = fs.createWriteStream(filePath, { flags: 'a' });
    size = 0;
  }

  function write(level, type, data) {
    const entry = { level, ts: new Date().toISOString(), type, ...data };
    const line = JSON.stringify(entry);
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
    if (stream) {
      stream.write(line + '\n');
      size += Buffer.byteLength(line) + 1;
      if (size >= rotateBytes) rotate();
    }
    return entry;
  }

  return {
    info: (type, data = {}) => write('info', type, data),
    warn: (type, data = {}) => write('warn', type, data),
    error: (type, data = {}) => write('error', type, data),
    access: (req, res, meta = {}) => write('info', 'access', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      ip: meta.ip,
      ua: meta.ua,
      size: meta.size || 0,
      time: meta.time || 0,
      encoding: meta.encoding || '',
      reqId: meta.reqId,
    }),
    rotate,
    close: () => { if (stream) stream.end(); },
  };
}
