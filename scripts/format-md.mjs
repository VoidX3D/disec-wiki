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

const targets = [
  'docs/iran/index.md',
  'docs/data/index.md',
  'docs/references/wikipedia-lethal-autonomous-weapons.md',
];

// Files that already start with `---` YAML frontmatter + contain raw HTML
const frontmatterFiles = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) {
      const src = fs.readFileSync(p, 'utf-8');
      if (src.startsWith('---') && /<[a-z][\s>]/.test(src)) frontmatterFiles.push(p);
    }
  }
};
walk(path.join(WIKI, 'docs'));

let count = 0;
for (const file of new Set([...targets, ...frontmatterFiles])) {
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
