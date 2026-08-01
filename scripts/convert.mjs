#!/usr/bin/env node
/**
 * Convert all existing DISEC data (JSON + text + main.txt) into Markdown pages
 * for the MkDocs wiki. Idempotent — safe to re-run.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const PROJECT = path.resolve(WIKI, '..');
const DOCS = path.join(WIKI, 'docs');
const DISEC = path.join(PROJECT, 'DISEC');
const DATA = path.join(PROJECT, 'server', 'data');

const PART_LINE_RE = /^(PART\s+[IVXLC]+(?:-[A-Z0-9]+)?|[Pp]art\s+\d+)(?:\s*[–—:]\s*|:)?(.*)$/i;

function read(rel) {
  return fs.readFileSync(path.join(PROJECT, rel), 'utf-8');
}

function readData(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf-8'));
}

function readDisec(rel) {
  return fs.readFileSync(path.join(DISEC, rel), 'utf-8');
}

function write(rel, content) {
  const full = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n');
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
  // ALL-CAPS headings (e.g. "SUB-HEADING"), or title-case short lines
  if (t === t.toUpperCase()) return true;
  return /^[A-Z]/.test(t) && t.toLowerCase() !== t;
}

function linesToParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0);
}

/* ------------------------------------------------------------------ */
/* 1. Position paper (main.txt)                                        */
/* ------------------------------------------------------------------ */
function buildPositionPaper() {
  const raw = read('main.txt');
  const paras = linesToParagraphs(raw);

  const header = {};
  for (const p of paras) {
    const m = p.match(/^(Committee|Country|Agenda):\s*(.+)/);
    if (m) header[m[1].toLowerCase()] = m[2];
  }

  const BULLET_STARTS = /^(Ensuring|Preventing|Guaranteeing|Promoting|Establish|Strengthen|Create|Ensure|Promote)/;

  const body = [];
  const refs = [];
  let inRefs = false;
  for (const p of paras) {
    if (/^References\s*$/i.test(p)) { inRefs = true; continue; }
    if (p.startsWith('http')) { refs.push(p); continue; }
    if (inRefs) { if (p.startsWith('http')) refs.push(p); continue; }
    if (p.match(/^(Committee|Country|Agenda):/)) continue;
    body.push(p);
  }

  const md = [];
  md.push('# Position Paper');
  md.push('');
  md.push('> **Delegation:** Islamic Republic of Iran  \n> **Committee:** ' + (header.committee || 'DISEC') + '  \n> **Agenda:** ' + (header.agenda || 'Regulating LAWS & Military AI'));
  md.push('');
  md.push('## Summary');
  md.push('');
  for (const p of body) {
    if (BULLET_STARTS.test(p)) {
      md.push('- ' + p);
      md.push('');
    } else {
      md.push(p);
      md.push('');
    }
  }
  md.push('## References');
  md.push('');
  for (const r of refs) {
    md.push(`- <${r}>`);
  }

  write('position/index.md', md.join('\n'));
  console.log('wrote position/index.md');
}

/* ------------------------------------------------------------------ */
/* 2. Strategy + resolution strategies                                 */
/* ------------------------------------------------------------------ */
function buildStrategy() {
  const profile = readData('iran-profile');

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

  write('position/strategy.md', md.join('\n'));
  console.log('wrote position/strategy.md');
}

/* ------------------------------------------------------------------ */
/* 3. Talking points                                                   */
/* ------------------------------------------------------------------ */
function buildTalkingPoints() {
  const profile = readData('iran-profile');
  const tp = profile.talkingPoints;

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

  write('position/talking-points.md', md.join('\n'));
  console.log('wrote position/talking-points.md');
}

/* ------------------------------------------------------------------ */
/* 4. Draft resolutions                                                */
/* ------------------------------------------------------------------ */
function buildResolutions() {
  const res = readData('resolutions');
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
      const isPp = /^PP\d/.test(c);
      md.push(`${isOp ? '> ' : ''}${c}`);
      md.push('');
    }
  });
  write('position/resolutions.md', md.join('\n'));
  console.log('wrote position/resolutions.md');
}

/* ------------------------------------------------------------------ */
/* 5. Iran pages                                                       */
/* ------------------------------------------------------------------ */
function buildIran() {
  const d = readData('iran-profile');

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
  write('iran/index.md', index.join('\n'));
  console.log('wrote iran/index.md');

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
  write('iran/profile.md', profile.join('\n'));
  console.log('wrote iran/profile.md');

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
  write('iran/capabilities.md', caps.join('\n'));
  console.log('wrote iran/capabilities.md');

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
  write('iran/alliances.md', ali.join('\n'));
  console.log('wrote iran/alliances.md');

  const ca = [];
  ca.push('# Counter-Arguments & Responses');
  ca.push('');
  d.talkingPoints.counterArguments.forEach((c, i) => {
    ca.push(`## ${i + 1}. ${c.objection}`);
    ca.push('');
    ca.push(c.response);
    ca.push('');
  });
  write('iran/counter-arguments.md', ca.join('\n'));
  console.log('wrote iran/counter-arguments.md');
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
  write('committee/index.md', index.join('\n'));
  console.log('wrote committee/index.md');

  const simple = [
    ['rules-of-procedure.md', 'rules-of-procedure.txt', 'Rules of Procedure', 'committee'],
    ['country-matrix.md', 'country-matrix.txt', 'Country Matrix', 'committee'],
    ['chair-notice.md', 'chair-notice.txt', 'Chair Notice', 'committee'],
    ['position-paper-guide.md', 'position-paper-guide.txt', 'Position Paper Guide', 'guides'],
    ['resolution-paper-guide.md', 'resolution-paper-guide.txt', 'Resolution Writing & Submission Guide', 'guides'],
  ];
  for (const [out, src, title, dir] of simple) {
    const text = readDisec(path.join(dir, src));
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // Mark heading candidates; a run of consecutive candidates is a list,
    // not headings — downgrade them to body text.
    const isHead = lines.map(l => isHeading(l));
    for (let i = 0; i < lines.length; i++) {
      if (isHead[i] && (lines[i - 1] && isHead[i - 1]) || (lines[i + 1] && isHead[i + 1])) {
        // only keep isolated single-line headings
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
    write(`committee/${out}`, md.join('\n'));
    console.log(`wrote committee/${out}`);
  }

  const tocText = readDisec('guides/toc.txt');
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
  write('committee/toc.md', toc.join('\n'));
  console.log('wrote committee/toc.md');
}

/* ------------------------------------------------------------------ */
/* 7. Study guide split into part pages                                */
/* ------------------------------------------------------------------ */
function buildStudyGuide() {
  const text = readDisec('guides/study-guide.txt');
  const lines = text.split('\n');

  // Parse into flat sections at every "Part" marker.
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

  // A section is a pure container when the next section starts within 2 lines.
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
  write('committee/study-guide/index.md', index.join('\n'));

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
    write(`committee/study-guide/${slug}`, md.join('\n'));
    console.log(`wrote committee/study-guide/${slug} (${p.content.length} lines)`);
  });
  console.log('wrote committee/study-guide/index.md');
}

/* ------------------------------------------------------------------ */
/* 8. Reference library                                                */
/* ------------------------------------------------------------------ */
function buildKeyTerms() {
  const terms = readData('key-terms');
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
  write('resources/key-terms.md', md.join('\n'));
  console.log('wrote resources/key-terms.md');
}

function buildTreaties() {
  const treaties = readData('treaties');
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
  write('resources/treaties.md', md.join('\n'));
  console.log('wrote resources/treaties.md');
}

function buildReports() {
  const reports = readData('reports');
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
  write('resources/reports.md', md.join('\n'));
  console.log('wrote resources/reports.md');
}

function buildOrganizations() {
  const orgs = readData('organizations');
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
  write('resources/organizations.md', md.join('\n'));
  console.log('wrote resources/organizations.md');
}

/* ------------------------------------------------------------------ */
/* 9. Images                                                           */
/* ------------------------------------------------------------------ */
function copyImages() {
  for (const f of ['iran.png', 'coat_Of_ARMS.jpg']) {
    const src = path.join(PROJECT, 'client', 'public', 'images', f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(DOCS, 'images'), { recursive: true });
      fs.copyFileSync(src, path.join(DOCS, 'images', f));
      console.log('copied images/' + f);
    }
  }
}

/* ------------------------------------------------------------------ */
fs.mkdirSync(DOCS, { recursive: true });
buildPositionPaper();
buildStrategy();
buildTalkingPoints();
buildResolutions();
buildIran();
buildCommittee();
buildStudyGuide();
buildKeyTerms();
buildTreaties();
buildReports();
buildOrganizations();
copyImages();
console.log('conversion complete');
