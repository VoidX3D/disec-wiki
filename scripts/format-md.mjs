#!/usr/bin/env node
/**
 * Add `format: md` frontmatter to docs files that contain raw HTML/JSX
 * incompatible with MDX, so Docusaurus renders them as plain Markdown.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');

// Any docs .md file containing raw HTML/JSX or MDX-hostile autolinks
// (scraped content) gets format: md so Docusaurus renders it as plain Markdown.
const targets = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) {
      const src = fs.readFileSync(p, 'utf-8');
      if (/<\s*[a-zA-Z][\s>]/.test(src) || /<https?:\/\/[^>]+>/.test(src)) targets.push(p);
    }
  }
};
walk(path.join(WIKI, 'docs'));

let count = 0;
for (const file of targets) {
  let src = fs.readFileSync(file, 'utf-8');
  if (src.startsWith('---')) {
    // Insert format: md inside existing frontmatter
    if (!/^format:\s*md$/m.test(src)) {
      src = src.replace(/^---\n/, '---\nformat: md\n');
      fs.writeFileSync(file, src);
      console.log(`+ format:md  ${file}`);
      count++;
    }
  } else {
    // Prepend frontmatter
    src = `---\nformat: md\n---\n\n${src}`;
    fs.writeFileSync(file, src);
    console.log(`+ frontmatter  ${file}`);
    count++;
  }
}
console.log(`Updated ${count} files.`);
