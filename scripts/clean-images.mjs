#!/usr/bin/env node
/**
 * Find image files in static/img/refs that are not actually images
 * (downloaded a 404 HTML page, or HEIC/HEIF disguised as .jpg, etc.)
 * and remove them. Then strip dangling references from docs.
 *
 * Run: npm run clean-images
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const REFS = path.join(WIKI, 'static', 'img', 'refs');

function magic(file) {
  const buf = Buffer.alloc(16);
  let fd;
  try { fd = fs.openSync(file, 'r'); fs.readSync(fd, buf, 0, 16, 0); fs.closeSync(fd); }
  catch { return 'BAD'; }
  const h = buf.subarray(0, 4).toString('hex');
  // JPEG: ff d8 ff
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4e 47
  if (h === '89504e47') return 'png';
  // GIF: 47 49 46 38
  if (h === '47494638') return 'gif';
  // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
  if (h === '52494646' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // BMP: 42 4d
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  // SVG: starts with '<' (3c) followed by 'svg' or '?'/'xml'
  if (buf[0] === 0x3c && (buf[1] === 0x73 || buf[1] === 0x3f)) {
    const head = fs.readFileSync(file, 'utf-8', { flag: 'r' }).slice(0, 200).toLowerCase();
    if (head.includes('<svg') || head.includes('<?xml')) return 'svg';
    return 'BAD';
  }
  // HEIC/HEIF/AVIF: ISO BMFF (ftyp at offset 4)
  if (h === '0000001c' || h === '00000018' || h === '00000020' || h === '00000024') {
    if (buf.toString('ascii', 4, 8) === 'ftyp') return 'BAD-FTYP';
  }
  return 'BAD';
}

const removed = [];
for (const f of fs.readdirSync(REFS)) {
  const fp = path.join(REFS, f);
  const m = magic(fp);
  if (m === 'BAD' || m === 'BAD-FTYP') {
    fs.unlinkSync(fp);
    removed.push('/img/refs/' + f);
  }
}
console.log(`Removed ${removed.length} invalid image files.`);

const refs = removed;
if (refs.length === 0) process.exit(0);

// Strip dangling references from docs
const DOC_DIRS = ['docs'];
const collect = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (f.endsWith('.md')) out.push(fp);
    }
  };
  walk(dir);
  return out;
};
let rewritten = 0;
for (const dir of DOC_DIRS) {
  for (const fp of collect(path.join(WIKI, dir))) {
    let md = fs.readFileSync(fp, 'utf-8');
    const before = md;
    for (const r of refs) {
      const esc = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // ![alt](/img/refs/file.ext) or ![alt](/img/refs/file.ext "title")
      md = md.replace(new RegExp(`!\\[[^\\]]*\\]\\(${esc}(?:\\s+"[^"]*")?\\)`, 'g'), '');
      // <img src="/img/refs/file.ext" ...>
      md = md.replace(new RegExp(`<img[^>]*src=["']${esc}["'][^>]*>`, 'gi'), '');
    }
    md = md.replace(/\n{3,}/g, '\n\n');
    if (md !== before) {
      fs.writeFileSync(fp, md);
      rewritten++;
      console.log(`+ cleaned  ${path.relative(WIKI, fp)}`);
    }
  }
}
console.log(`Stripped dangling refs from ${rewritten} files.`);