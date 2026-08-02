#!/usr/bin/env node
/**
 * normalize-images.mjs
 * Scans news-data/assets and static/img (if present) and renames images to a
 * predictable naming scheme: YYYY-MM-DD_slug.ext
 * Also emits a mapping file at news-data/assets/rename-map.json for reference.
 *
 * Usage: node scripts/normalize-images.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const ASSETS = path.join(WIKI, 'news-data', 'assets');
const MAP_FILE = path.join(ASSETS, 'rename-map.json');

if (!fs.existsSync(ASSETS)) {
  console.error('No assets dir found, nothing to do');
  process.exit(0);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0,70);
}

const files = fs.readdirSync(ASSETS).filter(f => !f.startsWith('.'));
const map = {};
for (const f of files) {
  const full = path.join(ASSETS, f);
  if (!fs.statSync(full).isFile()) continue;
  // try to extract date from filename
  const m = f.match(/(\d{4}-\d{2}-\d{2})[_-]+(.+)\.(\w{2,6})$/);
  let date = new Date().toISOString().slice(0,10);
  let base = f.replace(/\.[^.]+$/,'');
  let ext = f.split('.').pop();
  if (m) { date = m[1]; base = m[2]; ext = m[3]; }
  const name = `${date}_${slugify(base)}.${ext}`;
  if (name === f) continue;
  const target = path.join(ASSETS, name);
  if (fs.existsSync(target)) continue; // avoid overwriting
  fs.renameSync(full, target);
  map[f] = name;
  console.log(`renamed ${f} -> ${name}`);
}
fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
console.log('Wrote map to', MAP_FILE);
