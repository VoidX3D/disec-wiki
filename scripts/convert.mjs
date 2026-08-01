#!/usr/bin/env node
/**
 * Convert legacy DISEC data (JSON + extracted texts) into Markdown pages
 * for the MkDocs wiki. Idempotent — safe to re-run; only rewrites outputs.
 *
 * Sources (legacy project lives under ../old/):
 *   - ../old/server/data/*.json         (structured content)
 *   - ../old/client/DISEC/ ... .txt     (committee + study guide texts)
 *   - ../old/client/DISEC/iran/position-paper.md  (the position paper)
 *   - ../old/client/public/images/      (iran.png, coat_Of_ARMS.jpg)
 *
 * Run: npm run convert
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as term from './term.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const LEGACY = path.resolve(WIKI, '..', 'old');
const DOCS = path.join(WIKI, 'docs');
const DATA = path.join(LEGACY, 'server', 'data');
const DISEC = path.join(LEGACY, 'client', 'DISEC');
const IMAGES = path.join(LEGACY, 'client', 'public', 'images');

const PART_LINE_RE = /^(PART\s+[IVXLC]+(?:-[A-Z0-9]+)?|[Pp]art\s+\d+)(?:\s*[–—:]\s*|:)?(.*)$/i;

// ── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet') || args.includes('-q');
const FORCE = args.includes('--force') || args.includes('-f');
const HELP = args.includes('--help') || args.includes('-h');

if (HELP) {
  console.log(`DISEC legacy data → Markdown converter
Usage: node scripts/convert.mjs [options]

Options:
  --force, -f  overwrite existing docs/ pages (default: skip them)
  --quiet, -q  only print errors
  --help, -h   show this help`);
  process.exit(0);
}

const report = (fn, text) => { if (!QUIET) term.status.info(text); return fn(); };

// ── IO helpers ───────────────────────────────────────────────────
function mustExist(p) {
  if (!fs.existsSync(p)) {
    term.status.fail(`missing source: ${path.relative(WIKI, p)}`);
    process.exit(1);
  }
}

function readJson(name) {
  const p = path.join(DATA, `${name}.json`);
  mustExist(p);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function readText(rel) {
  const p = path.join(DISEC, rel);
  mustExist(p);
  return fs.readFileSync(p, 'utf-8');
}

function write(rel, content) {
  const full = path.join(DOCS, rel);
  if (fs.existsSync(full) && !FORCE) return false;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n');
  return true;
}

function notice(text, written) {
  if (QUIET) return;
  if (written) term.status.ok(text);
  else term.status.skip(text, 'exists — skipped (use --force to overwrite)');
}

function esc(text) {
  return String(text ?? '');
}

function isHeading(t) {
  if (t.length < 3 || t.length > 80) return false;
  if (/[…]/.test(t)) return false;
  if (/^[•\-*\d.·•\s]+$/.test(t)) return false;
  if (/^[A-Z]?\d+[.)]/.test(t)) return false;
  if (t.includes(':') && !/^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,5}$/.test(t)) return false;
  if (/[.,;?!]$/.test(t)) return false;
  const words = t.split(/\s+/).length;
  if (words > 8) return false;
  if (t === t.toUpperCase()) return true;
  return /^[A-Z]/.test(t) && t.toLowerCase() !== t;
}

/* ------------------------------------------------------------------ */
/* 1. Position paper (old/.../position-paper.md)                       */
/* ------------------------------------------------------------------ */
function buildPositionPaper() {
  const src = path.join(DISEC, 'iran', 'position-paper.md');
  mustExist(src);
  let md = fs.readFileSync(src, 'utf-8').trim();

  // Point embedded images at the wiki's copied images.
  md = md.replace(/\]\((iran\.png|coat_Of_ARMS\.jpg)\)/g, '](../images/$1)');

  notice('position/index.md', write('position/index.md', md));
}

/* ------------------------------------------------------------------ */
/* 2. Strategy + resolution strategies                                 */
/* ------------------------------------------------------------------ */
function buildStrategy() {
  const profile = readJson('iran-profile');
  const md = [];
  md.push('# Strategy & Resolution Approach');
  md.push('');
  md.push('Iran\'s negotiation strategy combines support for inclusive multilateral governance with defence of the sovereign right to develop defensive asymmetric capabilities.');
  md.push('');

  md.push('## Core Strategic Positions');
  md.push('');
  const positions = [
    { t: 'Position on LAWS', d: 'Iran supports international negotiations on LAWS but emphasizes the right of states to develop defensive capabilities. Advocates a balanced approach considering both humanitarian concerns and national security needs.' },
    { t: 'Key Talking Points', d: 'Emphasize sovereignty and the right to self-defence · highlight the dual-use nature of AI · stress inclusive negotiations · address technological hegemony · support confidence-building measures.' },
    { t: 'Proposed Solutions', d: 'Establish a multilateral LAWS governance framework · ensure technology-transfer provisions · create transparency mechanisms · develop verification measures · include developing nations in decision-making.' },
    { t: 'Negotiation Strategy', d: 'Build coalitions with like-minded states, emphasize common interests, propose constructive compromises, and maintain flexibility while protecting core national interests.' },
  ];
  for (const p of positions) {
    md.push(`### ${p.t}`);
    md.push('');
    md.push(p.d);
    md.push('');
  }

  md.push('## Resolution Strategies');
  md.push('');
  for (const s of profile.resolutionStrategies) {
    md.push(`### ${s.title}`);
    md.push('');
    md.push(s.description);
    md.push('');
    md.push('**Key clauses:**');
    md.push('');
    for (const c of s.clauses) md.push(`- ${c}`);
    md.push('');
  }

  notice('position/strategy.md', write('position/strategy.md', md.join('\n')));
}

/* ------------------------------------------------------------------ */
/* 3. Talking points                                                   */
/* ------------------------------------------------------------------ */
function buildTalkingPoints() {
  const tp = readJson('iran-profile').talkingPoints;
  const md = [];
  md.push('# Talking Points');
  md.push('');
  md.push('## Opening Statement');
  md.push('');
  for (const p of tp.openingStatement) { md.push(p); md.push(''); }
  md.push('## Debate Points');
  md.push('');
  for (const p of tp.debatePoints) { md.push(`- ${p}`); }
  md.push('');
  md.push('## Closing Statement');
  md.push('');
  for (const p of tp.closingStatement) { md.push(p); md.push(''); }

  notice('position/talking-points.md', write('position/talking-points.md', md.join('\n')));
}

/* ------------------------------------------------------------------ */
/* 4. Draft resolutions                                                */
/* ------------------------------------------------------------------ */
function buildResolutions() {
  const res = readJson('resolutions');
  const md = [];
  md.push('# Sample Draft Resolutions');
  md.push('');
  md.push(`The delegation maintains **${res.length}** draft resolutions for the committee.`);
  md.push('');
  res.forEach((r, i) => {
    md.push(`## ${i + 1}. ${r.title}`);
    md.push('');
    md.push(`**Committee:** ${r.committee}  `);
    md.push(`**Sponsors:** ${r.sponsors}`);
    md.push('');
    for (const c of r.clauses) {
      const isOp = /^OP\d/.test(c);
      md.push(`${isOp ? '> ' : ''}${c}`);
      md.push('');
    }
  });
  notice('position/resolutions.md', write('position/resolutions.md', md.join('\n')));
}

/* ------------------------------------------------------------------ */
/* 5. Iran pages                                                       */
/* ------------------------------------------------------------------ */
function buildIran() {
  const d = readJson('iran-profile');

  const infobox = [
    '<table class="infobox">',
    '<tr><td colspan="2" class="infobox-caption">Islamic Republic of Iran</td></tr>',
    `<tr><td colspan="2" style="text-align:center">![Iran Emblem](/images/iran.png)</td></tr>`,
    `<tr><th>Capital</th><td>${d.overview.capital}</td></tr>`,
    `<tr><th>Population</th><td>${d.overview.population}</td></tr>`,
    `<tr><th>UN Member</th><td>${d.overview.unMember}</td></tr>`,
    `<tr><th>Security Council</th><td>${d.overview.securityCouncil}</td></tr>`,
    `<tr><th>NPT Status</th><td>${d.overview.nptStatus}</td></tr>`,
    `<tr><th>Conference</th><td>${d.conference}</td></tr>`,
    `</table>`,
  ].join('\n');

  const index = [];
  index.push('# Islamic Republic of Iran');
  index.push('');
  index.push(infobox);
  index.push('');
  index.push('## Summary');
  index.push('');
  index.push(d.position.summary);
  index.push('');
  index.push('## Core Stance');
  index.push('');
  index.push(d.position.coreStance);
  index.push('');
  index.push('## Key Principles');
  index.push('');
  for (const p of d.position.keyPrinciples) index.push(`- ${p}`);
  index.push('');
  index.push('## Quick Access');
  index.push('');
  index.push('- [Country Profile](profile.md)');
  index.push('- [Military Capabilities](capabilities.md)');
  index.push('- [Alliances & Positions](alliances.md)');
  index.push('- [Counter-Arguments](counter-arguments.md)');
  index.push('- [Position Paper](../position/index.md)');
  index.push('');
  notice('iran/index.md', write('iran/index.md', index.join('\n')));

  const profile = [];
  profile.push('# Country Profile');
  profile.push('');
  profile.push('## Overview');
  profile.push('');
  const facts = Object.entries(d.overview).filter(([k]) => k !== 'relevantAlliances');
  profile.push('| Field | Value |');
  profile.push('| --- | --- |');
  for (const [k, v] of facts) profile.push(`| ${k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())} | ${v} |`);
  profile.push('');
  profile.push('## Alliances & Memberships');
  profile.push('');
  for (const a of d.overview.relevantAlliances.split(', ')) profile.push(`- ${a}`);
  profile.push('');
  profile.push('## Voting Pattern');
  profile.push('');
  profile.push(d.position.votingPattern);
  profile.push('');
  notice('iran/profile.md', write('iran/profile.md', profile.join('\n')));

  const caps = [];
  caps.push('# Military Capabilities');
  caps.push('');
  caps.push('> ' + d.militaryCapabilities.summary);
  caps.push('');
  caps.push('## Strengths');
  caps.push('');
  for (const s of d.militaryCapabilities.strengths) caps.push(`- ${s}`);
  caps.push('');
  caps.push('## Limitations');
  caps.push('');
  for (const l of d.militaryCapabilities.limitations) caps.push(`- ${l}`);
  caps.push('');
  caps.push('## Autonomous Drone Fleet');
  caps.push('');
  caps.push('| System | Type | Range | Notes |');
  caps.push('| --- | --- | --- | --- |');
  for (const dr of d.militaryCapabilities.autonomousSystems.drones) {
    caps.push(`| ${dr.name} | ${dr.type} | ${dr.range} | ${dr.desc} |`);
  }
  caps.push('');
  caps.push('## Autonomous Capabilities');
  caps.push('');
  for (const c of d.militaryCapabilities.autonomousSystems.capabilities) caps.push(`- ${c}`);
  caps.push('');
  notice('iran/capabilities.md', write('iran/capabilities.md', caps.join('\n')));

  const ali = [];
  ali.push('# Alliances & Alignments');
  ali.push('');
  const colors = { supportive: 'Supportive', neutral: 'Neutral', opposing: 'Opposing' };
  for (const [group, countries] of Object.entries(d.alliances)) {
    ali.push(`## ${colors[group] || group} States`);
    ali.push('');
    for (const c of countries) {
      ali.push(`### ${c.country}`);
      ali.push('');
      ali.push(c.alignment);
      ali.push('');
    }
  }
  notice('iran/alliances.md', write('iran/alliances.md', ali.join('\n')));

  const ca = [];
  ca.push('# Counter-Arguments & Responses');
  ca.push('');
  d.talkingPoints.counterArguments.forEach((c, i) => {
    ca.push(`## ${i + 1}. ${c.objection}`);
    ca.push('');
    ca.push(c.response);
    ca.push('');
  });
  notice('iran/counter-arguments.md', write('iran/counter-arguments.md', ca.join('\n')));
}

/* ------------------------------------------------------------------ */
/* 6. Committee docs                                                   */
/* ------------------------------------------------------------------ */
function buildCommittee() {
  const index = [];
  index.push('# Committee Documents');
  index.push('');
  index.push('**Committee:** Disarmament and International Security Committee (DISEC), First Committee of the UN General Assembly');
  index.push('');
  index.push('**Agenda:** Regulating Lethal Autonomous Weapons Systems (LAWS) & Military Artificial Intelligence');
  index.push('');
  index.push('## Documents');
  index.push('');
  index.push('- [Study Guide](study-guide/index.md) — full 95-page study material, split into parts');
  index.push('- [Rules of Procedure](rules-of-procedure.md)');
  index.push('- [Country Matrix](country-matrix.md)');
  index.push('- [Chair Notice](chair-notice.md)');
  index.push('- [Position Paper Guide](position-paper-guide.md)');
  index.push('- [Resolution Writing Guide](resolution-paper-guide.md)');
  index.push('- [Table of Contents](toc.md)');
  index.push('');
  notice('committee/index.md', write('committee/index.md', index.join('\n')));

  const simple = [
    ['rules-of-procedure.md', 'committee/rules-of-procedure.txt', 'Rules of Procedure'],
    ['country-matrix.md', 'committee/country-matrix.txt', 'Country Matrix'],
    ['chair-notice.md', 'committee/chair-notice.txt', 'Chair Notice'],
    ['position-paper-guide.md', 'guides/position-paper-guide.txt', 'Position Paper Guide'],
    ['resolution-paper-guide.md', 'guides/resolution-paper-guide.txt', 'Resolution Writing & Submission Guide'],
  ];
  for (const [out, src, title] of simple) {
    const text = readText(src);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const isHead = lines.map(l => isHeading(l));
    for (let i = 0; i < lines.length; i++) {
      if (isHead[i] && (lines[i - 1] && isHead[i - 1]) || (lines[i + 1] && isHead[i + 1])) {
        isHead[i] = !(isHead[i - 1] || isHead[i + 1]);
      }
    }
    const md = [];
    md.push(`# ${title}`);
    md.push('');
    lines.forEach((t, i) => {
      if (isHead[i]) {
        md.push(`## ${t.replace(/\s+/g, ' ')}`);
        md.push('');
      } else {
        md.push(t);
        md.push('');
      }
    });
    notice(`committee/${out}`, write(`committee/${out}`, md.join('\n')));
  }

  const tocText = readText('guides/toc.txt');
  const toc = [];
  toc.push('# Study Guide — Table of Contents');
  toc.push('');
  for (const line of tocText.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^PART/i.test(t)) { toc.push(`## ${t}`); toc.push(''); }
    else if (t === t.toUpperCase() && t.length > 5) { toc.push(`### ${t}`); toc.push(''); }
    else toc.push(t.replace(/^•\s*/, '- '));
  }
  notice('committee/toc.md', write('committee/toc.md', toc.join('\n')));
}

/* ------------------------------------------------------------------ */
/* 7. Study guide split into part pages                                */
/* ------------------------------------------------------------------ */
function buildStudyGuide() {
  const text = readText('guides/study-guide.txt');
  const lines = text.split('\n');

  const sections = [];
  let current = null;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (PART_LINE_RE.test(t)) {
      if (current) sections.push(current);
      current = { title: t, content: [] };
      continue;
    }
    if (current) current.content.push(t);
  }
  if (current) sections.push(current);

  const pages = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.content.length === 0) {
      if (pages.length) pages[pages.length - 1].banner.push(s.title);
      else pages.push({ title: s.title, banner: [], content: [] });
      continue;
    }
    const banner = i > 0 && pages.length && sections[i - 1].content.length === 0
      ? [sections[i - 1].title]
      : [];
    pages.push({ title: s.title, banner, content: s.content });
  }

  const index = [];
  index.push('# Study Guide');
  index.push('');
  index.push('**Agenda:** Regulating Lethal Autonomous Weapons Systems (LAWS) & Military AI  ');
  index.push('**Conference:** MOTHERLAND MUN 2026');
  index.push('');
  index.push(`The complete committee study guide, split into ${pages.length} parts for offline reading.`);
  index.push('');
  pages.forEach((p, i) => {
    const slug = `part-${String(i + 1).padStart(2, '0')}.md`;
    index.push(`- [${p.title}](${slug})`);
  });
  index.push('');
  const wroteIndex = write('committee/study-guide/index.md', index.join('\n'));

  let wroteParts = 0;
  pages.forEach((p, i) => {
    const md = [];
    md.push(`# ${p.title}`);
    md.push('');
    for (const b of p.banner) {
      md.push(`> *${b}*`);
      md.push('');
    }
    for (const c of p.content) {
      if (/^[A-Z][A-Za-z0-9'’\- ]+:$/.test(c) && c.length < 120) {
        md.push(`## ${c.replace(/:\s*$/, '')}`);
        md.push('');
      } else {
        md.push(c);
        md.push('');
      }
    }
    const slug = `part-${String(i + 1).padStart(2, '0')}.md`;
    if (write(`committee/study-guide/${slug}`, md.join('\n'))) wroteParts++;
  });
  notice(`committee/study-guide/ (${pages.length} parts)`, wroteIndex || wroteParts > 0);
}

/* ------------------------------------------------------------------ */
/* 8. Reference library                                                */
/* ------------------------------------------------------------------ */
function buildKeyTerms() {
  const terms = readJson('key-terms');
  const md = [];
  md.push('# Key Terms & Definitions');
  md.push('');
  md.push(`${terms.length} essential terms for DISEC — Part II-B of the Study Guide.`);
  md.push('');
  md.push('| Term | Category | Definition |');
  md.push('| --- | --- | --- |');
  for (const t of terms) {
    const def = esc(t.definition).replace(/\|/g, '\\|');
    md.push(`| **${t.term}** | ${t.category} | ${def} |`);
  }
  md.push('');
  md.push('## Context & Sources');
  md.push('');
  for (const t of terms) {
    md.push(`### ${t.term}`);
    md.push('');
    md.push(t.context);
    md.push('');
    if (t.source) md.push(`*Source: ${t.source}*`);
    md.push('');
  }
  notice('resources/key-terms.md', write('resources/key-terms.md', md.join('\n')));
}

function buildTreaties() {
  const treaties = readJson('treaties');
  const cats = {};
  for (const t of treaties) {
    const cat = t.category || 'treaty';
    (cats[cat] ||= []).push(t);
  }
  const md = [];
  md.push('# Treaties, Frameworks & Policies');
  md.push('');
  md.push('The legal architecture that frames LAWS discussions, from binding treaties to soft-law frameworks.');
  md.push('');
  const CAT_TITLES = { treaty: 'International Treaties', framework: 'Ethics & AI Frameworks', policy: 'National & UN Policy' };
  for (const [cat, items] of Object.entries(cats)) {
    md.push(`## ${CAT_TITLES[cat] || cat}`);
    md.push('');
    for (const t of items) {
      md.push(`### ${t.title} ${t.year ? `(${t.year})` : ''}`);
      md.push('');
      md.push(t.desc);
      md.push('');
      if (t.clauses && t.clauses.length) {
        md.push('**Key provisions:**');
        md.push('');
        for (const c of t.clauses) md.push(`- ${c}`);
        md.push('');
      }
      if (t.url) md.push(`[Official source](${t.url})`);
      md.push('');
    }
  }
  notice('resources/treaties.md', write('resources/treaties.md', md.join('\n')));
}

function buildReports() {
  const reports = readJson('reports');
  const md = [];
  md.push('# Reports & Analysis');
  md.push('');
  md.push('Key reports, yearbooks and think-tank analyses relevant to LAWS and military AI.');
  md.push('');
  for (const r of reports) {
    md.push(`## ${r.title} ${r.year ? `(${r.year})` : ''}`);
    md.push('');
    md.push(`**Organization:** ${r.org}  `);
    md.push(`**Category:** ${r.category}`);
    md.push('');
    md.push(r.desc);
    md.push('');
    if (r.keyFindings && r.keyFindings.length) {
      md.push('**Key findings:**');
      md.push('');
      for (const f of r.keyFindings) md.push(`- ${f}`);
      md.push('');
    }
    if (r.url) md.push(`[Official source](${r.url})`);
    md.push('');
  }
  notice('resources/reports.md', write('resources/reports.md', md.join('\n')));
}

function buildOrganizations() {
  const orgs = readJson('organizations');
  const md = [];
  md.push('# Organizations & Institutions');
  md.push('');
  md.push('International bodies, research institutes and civil-society coalitions shaping LAWS governance.');
  md.push('');
  md.push('| Organization | Description |');
  md.push('| --- | --- |');
  for (const o of orgs) {
    const desc = esc(o.desc).replace(/\|/g, '\\|');
    md.push(`| [${o.title}](${o.url}) | ${desc} |`);
  }
  notice('resources/organizations.md', write('resources/organizations.md', md.join('\n')));
}

/* ------------------------------------------------------------------ */
/* 9. Images                                                           */
/* ------------------------------------------------------------------ */
function copyImages() {
  for (const f of ['iran.png', 'coat_Of_ARMS.jpg']) {
    const src = path.join(IMAGES, f);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(DOCS, 'images', f);
    if (fs.existsSync(dst) && !FORCE) {
      notice(`images/${f}`, false);
      continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    notice(`images/${f}`, true);
  }
}

/* ------------------------------------------------------------------ */
const t0 = Date.now();
term.section('Converting legacy data');

mustExist(DATA);
mustExist(DISEC);

report(buildPositionPaper, 'position paper');
report(buildStrategy, 'strategy');
report(buildTalkingPoints, 'talking points');
report(buildResolutions, 'resolutions');
report(buildIran, 'iran pages');
report(buildCommittee, 'committee docs');
report(buildStudyGuide, 'study guide');
report(buildKeyTerms, 'key terms');
report(buildTreaties, 'treaties');
report(buildReports, 'reports');
report(buildOrganizations, 'organizations');
report(copyImages, 'images');

term.section('Summary');
term.status.ok(`Conversion complete`, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
