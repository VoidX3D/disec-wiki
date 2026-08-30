#!/usr/bin/env node
/**
 * Download primary source documents about LAWS / military AI, weapon-related
 * UN conventions, reports and Iran-related material. Save them as offline
 * Markdown pages under docs/references/.
 *
 * HTML pages are converted with node-html-markdown; PDFs are converted to
 * text with `pdftotext` (poppler) when available, otherwise saved as a stub
 * pointing at the local file in downloads/.
 *
 * Run: npm run download
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import * as term from './term.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(__dirname, '..');
const DOCS = path.join(WIKI, 'docs');
const DOWNLOADS = path.join(WIKI, 'static', 'downloads');
const REFS_DIR = path.join(DOCS, 'references');
const CACHE_DIR = path.join(WIKI, '.cache', 'blobs');
const STATE_FILE = path.join(WIKI, '.cache', 'download-state.json');

fs.mkdirSync(DOWNLOADS, { recursive: true });
fs.mkdirSync(REFS_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const nhm = new NodeHtmlMarkdown({
  useLinkReferenceDefinitions: false,
  keepDataImages: false,
  ignore: ['script', 'style', 'noscript', 'nav', 'footer', 'header'],
  blockElements: ['div', 'p', 'article', 'section', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'tr', 'figure'],
});

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// ── CLI options ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAGS = {
  force: argv.includes('--force') || argv.includes('-f'),     // ignore blob cache
  refresh: argv.includes('--refresh') || argv.includes('-r'), // re-validate via conditional GET
  quiet: argv.includes('--quiet') || argv.includes('-q'),
  only: null,
};
for (const a of argv) {
  if (a.startsWith('--only=')) FLAGS.only = a.slice('--only='.length);
  else if (a.startsWith('--only')) FLAGS.only = argv[argv.indexOf(a) + 1];
}

// ── Blob cache (temp files under .cache/blobs/) ─────────────────────
function cacheMetaPath(slug) {
  return path.join(CACHE_DIR, `${slug}.json`);
}
function cacheBodyPath(slug) {
  return path.join(CACHE_DIR, `${slug}.bin`);
}

function cacheRead(slug) {
  try {
    const meta = JSON.parse(fs.readFileSync(cacheMetaPath(slug), 'utf8'));
    const body = fs.readFileSync(cacheBodyPath(slug));
    return { meta, body };
  } catch {
    return null;
  }
}

function cacheWrite(slug, body, meta) {
  const tmpMeta = cacheMetaPath(slug) + '.tmp';
  const tmpBody = cacheBodyPath(slug) + '.tmp';
  fs.writeFileSync(tmpBody, body);
  fs.writeFileSync(tmpMeta, JSON.stringify(meta, null, 2));
  fs.renameSync(tmpBody, cacheBodyPath(slug));
  fs.renameSync(tmpMeta, cacheMetaPath(slug));
}

function hashedId(src) {
  // Stable cache key per URL so renames don't collide with stale blobs.
  return `${src.file}_${crypto.createHash('sha1').update(src.url).digest('hex').slice(0, 8)}`;
}

// ── Per-source state cache ────────────────────────────────────────────
// Records which sources have been fully processed (blob downloaded + .md
// written). On the next run these are skipped entirely — no HTTP, no
// conversion — unless --force/--refresh is given.
function stateLoad() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function stateSave(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function isSourceDone(state, src) {
  const key = hashedId(src);
  const entry = state[src.file];
  if (!entry || !entry.done) return false;
  // Blob must still be present, otherwise a partial wipe needs a re-fetch.
  if (!fs.existsSync(cacheBodyPath(key))) return false;
  // Output must exist too.
  if (!fs.existsSync(path.join(REFS_DIR, `${src.file}.md`))) return false;
  return entry.url === src.url;
}

function markDone(state, src) {
  state[src.file] = { done: true, url: src.url, at: Date.now(), key: hashedId(src) };
}

async function fetchBytes(src, opts = {}) {
  const headers = { 'User-Agent': USER_AGENT };
  // digitallibrary.un.org serves an HTML interstitial if `application/pdf`
  // appears in Accept for direct file links; omit it for known PDFs.
  if (!opts.pdf) headers['Accept'] = 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8';

  const key = hashedId(src);
  const cached = cacheRead(key);

  // Serve from cache unless forced.
  if (cached && !FLAGS.force) {
    return { contentType: opts.pdf ? 'application/pdf' : cached.meta.contentType, buf: cached.body, fromCache: true, meta: cached.meta };
  }

  // Conditional GET: only re-download when the server says it changed.
  if (cached && FLAGS.refresh) {
    if (cached.meta.etag) headers['If-None-Match'] = cached.meta.etag;
    if (cached.meta.lastModified) headers['If-Modified-Since'] = cached.meta.lastModified;
  }

  const res = await fetch(src.url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  });
  if (res.status === 304 && cached) {
    return { contentType: cached.meta.contentType, buf: cached.body, fromCache: true, meta: cached.meta };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.url}`);
  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = {
    contentType,
    etag: res.headers.get('etag') || undefined,
    lastModified: res.headers.get('last-modified') || undefined,
    url: src.url,
    fetchedAt: Date.now(),
    bytes: buf.length,
  };
  cacheWrite(key, buf, meta);
  return { contentType, buf, fromCache: false, meta };
}

function hasPdfText() {
  try {
    execFileSync('which', ['pdftotext'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
const PDFTEXT_AVAILABLE = hasPdfText();

function pdfToMarkdown(buf, title) {
  // Guard against non-PDF payloads being passed to pdftotext.
  const isPdf = buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!isPdf) {
    console.error('    not a real PDF (missing %PDF magic) — refusing pdftotext');
    return null;
  }
  const tmp = path.join(DOWNLOADS, `${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  try {
    let text = execFileSync('pdftotext', ['-layout', tmp, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf-8');
    // clean up common PDF text artifacts
    text = text.replace(/\f/g, '\n\n').replace(/\r/g, '');
    text = text.replace(/[ \t]+\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 200) throw new Error('pdftotext returned near-empty text');
    return `# ${title}\n\n> Offline copy converted from the official PDF by the DISEC Research Wiki downloader.\n\n${text}\n`;
  } catch (e) {
    console.error(`    pdftotext failed: ${e.message}; falling back to stub page`);
    return null;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function toMarkdown(html, title, baseUrl) {
  let md = nhm.translate(html);
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  // Resolve relative links/images against the source URL so scraped pages
  // don't end up with dead root-relative (/en/...) or local (images/...) refs.
  md = md.replace(/(\]\()([^)]+?)(\))/g, (m, pre, href, post) => {
    if (href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('javascript') || href.startsWith('tel') || href.startsWith('data:')) return m;
    try {
      return `${pre}${new URL(href, baseUrl).href}${post}`;
    } catch {
      return m;
    }
  });
  return `# ${title}\n\n> Offline copy saved by the DISEC Research Wiki downloader. Source may have been edited for length.\n\n${md}\n`;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Each source: { file, title, url, category, pdf (force pdf path) }
const CAT = {
  convention: 'Treaties & Conventions',
  unresolution: 'UN Resolutions & Official Documents',
  unagency: 'UN Agencies & Bodies',
  government: 'Government & National Policy',
  thinktank: 'Think Tanks & Research Institutes',
  regional: 'Regional & International Organizations',
  academic: 'Academic & Journals',
  iran: 'Iran / Middle East',
  framework: 'AI Policy Frameworks',
};

const SOURCES = [
  // 1. Core LAWS / military AI
  { file: 'icrc-position-autonomous-weapons', title: 'ICRC Position on Autonomous Weapon Systems (2021)', url: 'https://www.icrc.org/en/document/icrc-position-autonomous-weapon-systems', category: 'unagency' },
  { file: 'icrc-recommends-new-rules', title: 'ICRC — Autonomous Weapons: The ICRC Recommends New Rules', url: 'https://www.icrc.org/en/document/autonomous-weapons-icrc-recommends-new-rules', category: 'unagency' },
  { file: 'icrc-autonomous-weapons-overview', title: 'ICRC — Autonomous Weapons & AI (law & policy)', url: 'https://www.icrc.org/en/law-and-policy/artificial-intelligence', category: 'unagency' },
  { file: 'icrc-la-ai-and-ihl', title: 'ICRC — AI & Machine Learning in Armed Conflict: Human-Centred Approach', url: 'https://www.icrc.org/en/document/artificial-intelligence-and-machine-learning-armed-conflict-human-centred-approach', category: 'unagency' },
  { file: 'icrc-faq-autonomous-weapons', title: 'ICRC — FAQ: AI in the Military Domain', url: 'https://www.icrc.org/en/article/faq-artificial-intelligence-in-military-domain', category: 'unagency' },
  { file: 'icrc-data-protection-ai', title: 'ICRC — Data Protection in Humanitarian Action (2nd ed)', url: 'https://www.icrc.org/en/document/handbook-data-protection-humanitarian-action-second-edition', category: 'unagency' },
  { file: 'icrc-llm-armed-conflict', title: 'ICRC — Large Language Models & Armed Conflict', url: 'https://www.icrc.org/en/law-and-policy/artificial-intelligence', category: 'unagency' },
  { file: 'unoda-lethal-autonomous-weapons', title: 'UNODA — Lethal Autonomous Weapon Systems', url: 'https://www.unoda.org/en/our-work/emerging-challenges/lethal-autonomous-weapon-systems', category: 'unagency' },
  { file: 'un-charter', title: 'Charter of the United Nations (1945)', url: 'https://www.un.org/en/about-us/un-charter/full-text', category: 'convention' },
  { file: 'un-disarmament-agenda', title: 'UN SG’s Agenda for Disarmament (2018)', url: 'https://www.un.org/disarmament/sg-agenda/', category: 'unresolution' },
  { file: 'un-disarmament-hub', title: 'UNODA — Disarmament main hub', url: 'https://www.un.org/disarmament/', category: 'unresolution' },
  { file: 'wikipedia-lethal-autonomous-weapons', title: 'Wikipedia — Lethal Autonomous Weapons', url: 'https://en.wikipedia.org/wiki/Lethal_autonomous_weapon', category: 'framework' },
  { file: 'wikipedia-military-ai', title: 'Wikipedia — Military Artificial Intelligence', url: 'https://en.wikipedia.org/wiki/Military_artificial_intelligence', category: 'framework' },
  { file: 'new-agenda-for-peace', title: 'UN Policy Brief — A New Agenda for Peace (2023)', url: 'https://www.un.org/sites/un2.un.org/files/our-common-agenda-policy-brief-new-agenda-for-peace-en.pdf', category: 'unresolution', pdf: true },

  { file: 'un-res-a78-241-laws', title: 'Resolutions A/RES/78/241 — LAWS (2023)', url: 'https://digitallibrary.un.org/record/4033027/files/A_RES_78_241-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-res-a79-62-laws', title: 'Resolutions A/RES/79/62 — LAWS (2024, 166-3-15)', url: 'https://digitallibrary.un.org/record/4071100/files/A_RES_79_62-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-res-a80-57-laws', title: 'Resolutions A/RES/80/57 — LAWS (2025)', url: 'https://digitallibrary.un.org/record/4095989/files/A_RES_80_57-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-res-a79-239-military-ai', title: 'Resolutions A/RES/79/239 — AI in the Military Domain (2024)', url: 'https://digitallibrary.un.org/record/4071348/files/A_RES_79_239-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-sg-report-a78-273-laws', title: 'UN SG Report A/78/273 — LAWS views (2023)', url: 'https://digitallibrary.un.org/record/4017741/files/A_78_273-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-sg-report-a79-88-laws', title: 'UN SG Report A/79/88 — LAWS views (2024)', url: 'https://digitallibrary.un.org/record/4059475/files/A_79_88-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-sg-report-a80-92-military-ai', title: 'UN SG Report A/80/92 — AI in the Military Domain (2025)', url: 'https://digitallibrary.un.org/record/4086346/files/A_80_92-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-a79-408-first-committee', title: 'First Committee Report A/79/408 — LAWS (2024)', url: 'https://digitallibrary.un.org/record/4067759/files/A_79_408-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'unroca-founding-res-46-36', title: 'UNROCA founding Resolutions A/RES/46/36 (1991)', url: 'https://undocs.org/en/A/RES/46/36', category: 'unresolution' },
  { file: 'un-digital-library', title: 'UN Digital Library (searchable documents)', url: 'https://digitallibrary.un.org/', category: 'unresolution' },
  { file: 'ccw-gge-2025-meetings', title: 'CCW GGE on LAWS — 2025 Meetings (UNODA portal)', url: 'https://meetings.unoda.org/ccw/convention-on-certain-conventional-weapons-group-of-governmental-experts-on-lethal-autonomous-weapons-systems-2025', category: 'unagency' },

  { file: 'gge-laws-2023-report', title: 'CCW GGE on LAWS — 2023 Chair’s report (CRP.1)', url: 'https://docs-library.unoda.org/Convention_on_Conventional_Weapons_-Group_of_Governmental_Experts_on_LaWS_(2023)/CCW_GGE1_2023_CRP.1.pdf', category: 'unagency', pdf: true },
  { file: 'gge-laws-2023-final-report', title: 'CCW GGE on LAWS — 2023 final report (A/78/116)', url: 'https://digitallibrary.un.org/record/4005963/files/A_78_116-EN.pdf', category: 'unagency', pdf: true },
  { file: 'gge-laws-2019-report', title: 'CCW GGE on LAWS — 2019 report & 11 Guiding Principles', url: 'https://documents.unoda.org/wp-content/uploads/2020/09/CCW_GGE.1_2019_3_E.pdf', category: 'unagency', pdf: true },
  { file: 'gge-laws-2025-chair-summary-march', title: 'CCW GGE on LAWS — 2025 Chair’s Summary (March)', url: 'https://docs-library.unoda.org/Convention_on_Certain_Conventional_Weapons_-Group_of_Governmental_Experts_on_Laeth_Autonomous_Weapons_Systems_(2025)/CCW-GGE_1-2025-WP-1-En.pdf', category: 'unagency', pdf: true },

  { file: 'unidir-abdm-2024', title: 'UNIDIR — Advisory Board on Disarmament Matters Report (2024)', url: 'https://unidir.org/wp-content/uploads/2024/09/UNIDIR_2024_ABDM_Report.pdf', category: 'unagency', pdf: true },
  { file: 'unidir-governance-ai-military', title: 'UNIDIR — Governance of AI in the Military Domain', url: 'https://unodaweb.unoda.org/public/2024-06/OP42.pdf', category: 'unagency', pdf: true },
  { file: 'unidir-security-technology', title: 'UNIDIR — Security & Technology Programme', url: 'https://unidir.org/programmes/security-and-technology/', category: 'unagency' },
  { file: 'unidir-ai-military-priority-areas', title: 'UNIDIR — Governance of military AI: Priority Areas', url: 'https://unidir.org/publication/governance-of-artificial-intelligence-in-the-military-domain-a-multi-stakeholder-perspective-on-priority-areas/', category: 'unagency' },
  { file: 'unoda-explosive-weapons', title: 'UNODA — Explosive Weapons in Populated Areas', url: 'https://www.unoda.org/en/our-work/conventional-arms/explosive-weapons-populated-areas', category: 'unagency' },
  { file: 'un-register-conventional-arms', title: 'UN Register of Conventional Arms (UNROCA)', url: 'https://www.unoda.org/en/our-work/cross-cutting-issues/military-confidence-building-measures/register-conventional-arms', category: 'unagency' },
  { file: 'unidir-military-ai-79-239', title: 'UNIDIR — AI in the Military Domain (1C briefing)', url: 'https://unidir.org/publication/artificial-intelligence-in-the-military-domain/', category: 'unagency' },
  { file: 'unsc-1540', title: 'UNSC Resolution 1540 (2004) — WMD non-proliferation', url: 'https://www.un.org/en/sc/1540/', category: 'unresolution' },
  { file: 'unodc-firearms-protocol', title: 'UNODC — Firearms Protocol overview', url: 'https://www.unodc.org/unodc/en/firearms-protocol/index.html', category: 'unagency' },
  { file: 'unocha-ai-humanitarian', title: 'Humanitarian Action info — AI in the Humanitarian Sector', url: 'https://humanitarianaction.info/', category: 'unagency' },
  { file: 'un-ai-advisory-body-final-report', title: 'UN AI Advisory Body — Governing AI for Humanity', url: 'https://www.un.org/techenvoy/ai-advisory-body', category: 'unagency' },

  { file: 'us-dod-directive-300009', title: 'US DoD Directive 3000.09 — Autonomy in Weapon Systems (2023)', url: 'https://static.carahsoft.com/concrete/files/4917/1101/9112/Guidance_DoD_Directive_3000.09_-_Autonomy_in_Weapon_Systems.pdf', category: 'government' },
  { file: 'hrw-review-dod-300009', title: 'HRW — Review of the 2023 US Policy on Autonomy in Weapons', url: 'https://www.hrw.org/topic/arms/killer-robots', category: 'government' },
  { file: 'us-political-declaration-military-ai', title: 'US Political Declaration on Responsible Military Use of AI (2023)', url: 'https://www.state.gov/political-declaration-on-responsible-military-use-of-artificial-intelligence-and-autonomy/', category: 'government' },
  { file: 'us-political-declaration-military-ai-pdf', title: 'US Political Declaration on Responsible Military Use of AI (PDF)', url: 'https://www.state.gov/wp-content/uploads/2023/11/Political-Declaration-on-Responsible-Military-Use-of-Artificial-Intelligence-and-Autonomy.pdf', category: 'government', pdf: true },
  { file: 'eu-ai-act', title: 'EU Artificial Intelligence Act — Regulation (EU) 2024/1689', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1689', category: 'government' },

  { file: 'sipri-yearbook', title: 'SIPRI Yearbook 2025', url: 'https://www.sipri.org/yearbook/2025', category: 'thinktank' },
  { file: 'sipri-autonomy-weapons', title: 'SIPRI — Autonomy in Weapon Systems', url: 'https://www.sipri.org/research/armament-and-disarmament/emerging-military-and-security-technologies/autonomy-weapon-systems', category: 'thinktank' },
  { file: 'sipri-yb25-ai-chapter', title: 'SIPRI Yearbook 2025 — Chapter 12 AI & Peace/Security', url: 'https://www.sipri.org/yearbook/2025/12', category: 'thinktank' },
  { file: 'sipri-unroca-reporting', title: 'SIPRI — Reporting to the UNROCA (background paper)', url: 'https://www.sipri.org/sites/default/files/2019-06/bp_1906_unroca.pdf', category: 'thinktank', pdf: true },
  { file: 'iiss-military-balance', title: 'IISS — The Military Balance (overview)', url: 'https://www.iiss.org/online-analysis/military-balance/', category: 'thinktank' },
  { file: 'iiss-military-balance-2025', title: 'IISS — The Military Balance 2025', url: 'https://www.iiss.org/publications/the-military-balance/', category: 'thinktank' },
  { file: 'rand-ai-national-security', title: 'RAND — AI & National Security', url: 'https://www.rand.org/topics/artificial-intelligence.html', category: 'thinktank' },
  { file: 'rand-shahed-economics', title: 'RAND — Economics of the Shahed-136 Drone', url: 'https://www.rand.org/pubs/research_reports/RR3200.html', category: 'thinktank' },
  { file: 'hrw-arms', title: 'Human Rights Watch — Arms & Military Technology', url: 'https://www.hrw.org/topic/arms', category: 'thinktank' },
  { file: 'stop-killer-robots', title: 'Stop Killer Robots — campaign', url: 'https://www.stopkillerrobots.org/', category: 'thinktank' },
  { file: 'article36-autonomous-weapons', title: 'Article 36 — Autonomous Weapons project', url: 'https://article36.org/what-we-do/autonomous-weapons/', category: 'thinktank' },
  { file: 'small-arms-survey', title: 'Small Arms Survey (Geneva)', url: 'https://www.smallarmssurvey.org/', category: 'thinktank' },

  { file: 'nato-ai-strategy', title: 'NATO AI Strategy (2021)', url: 'https://www.nato.int/cps/en/natohq/official_texts_187617.htm', category: 'regional' },

  { file: 'mit-spr-laws-ai', title: 'MIT Science Policy Review — LAWS & AI', url: 'http://mit-spr.pubpub.org/pub/laws-ai', category: 'academic' },

  { file: 'unesco-ai-ethics', title: 'UNESCO Recommendation on the Ethics of AI (2021)', url: 'https://unesdoc.unesco.org/ark:/48223/pf0000373433', category: 'framework' },
  { file: 'oecd-ai-principles', title: 'OECD AI Principles (2019)', url: 'https://oecd.ai/en/ai-principles', category: 'framework' },
  { file: 'fl-military-ai', title: 'Future of Life Institute — Position on Autonomous Weapons', url: 'https://futureoflife.org/aws/fli-position-on-autonomous-weapons/', category: 'framework' },
  { file: 'ieee-ethically-aligned-design', title: 'IEEE — Ethically Aligned Design (Autonomous Systems)', url: 'https://standards.ieee.org/industry-connections/ec/autonomous-systems.html', category: 'framework' },

  { file: 'ccw-overview', title: 'Convention on Certain Conventional Weapons (CCW, 1980)', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons', category: 'convention' },
  { file: 'ccw-amended-protocol-ii', title: 'CCW Amended Protocol II — Mines, Booby-Traps & Devices', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons/ccw-amended-protocol-ii', category: 'convention' },
  { file: 'ccw-protocol-v', title: 'CCW Protocol V — Explosive Remnants of War', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons/ccw-protocol-v-explosive-remnants-war', category: 'convention' },
  { file: 'geneva-conventions', title: 'Geneva Conventions (1949) & Additional Protocols — ICRC', url: 'https://www.icrc.org/en/law-and-policy/geneva-conventions-and-their-commentaries', category: 'convention' },
  { file: 'npt-full-text', title: 'Treaty on the Non-Proliferation of Nuclear Weapons (NPT)', url: 'https://www.un.org/disarmament/wmd/nuclear/npt/', category: 'convention' },
  { file: 'tpnw', title: 'Treaty on the Prohibition of Nuclear Weapons (2017)', url: 'https://www.unoda.org/en/our-work/weapons-mass-destruction/nuclear-weapons/treaty-prohibition-nuclear-weapons', category: 'convention' },
  { file: 'cwc-opcw', title: 'Chemical Weapons Convention (CWC) & OPCW', url: 'https://www.opcw.org/chemical-weapons-convention', category: 'convention' },
  { file: 'bwc', title: 'Biological Weapons Convention (1972)', url: 'https://www.unoda.org/en/our-work/weapons-mass-destruction/biological-weapons/biological-weapons-convention', category: 'convention' },
  { file: 'att', title: 'Arms Trade Treaty (2013)', url: 'https://www.unoda.org/en/our-work/conventional-arms/legal-instruments/arms-trade-treaty', category: 'convention' },
  { file: 'firearms-protocol', title: 'UN Firearms Protocol (2001)', url: 'https://www.unoda.org/en/our-work/conventional-arms/legal-instruments/firearms-protocol', category: 'convention' },
  { file: 'apmbc', title: 'Anti-Personnel Mine Ban Convention (1997)', url: 'https://www.apminebanconvention.org/en/', category: 'convention' },
  { file: 'ccm', title: 'Convention on Cluster Munitions (2008)', url: 'https://www.clusterconvention.org/', category: 'convention' },
  { file: 'geneva-protocol-1925', title: '1925 Geneva Protocol (poisonous gases)', url: 'https://front.un-arm.org/wp-content/uploads/2020/10/1925-Geneva-Protocol-1.pdf', category: 'convention', pdf: true },

  { file: 'wikipedia-iran-wmd', title: 'Wikipedia — Iran and WMD', url: 'https://en.wikipedia.org/wiki/Iran_and_weapons_of_mass_destruction', category: 'iran' },
  { file: 'wikipedia-iran-nuclear', title: 'Wikipedia — Nuclear Program of Iran', url: 'https://en.wikipedia.org/wiki/Nuclear_program_of_Iran', category: 'iran' },
  { file: 'wikipedia-iranian-armed-forces', title: 'Wikipedia — Iranian Armed Forces', url: 'https://en.wikipedia.org/wiki/Iranian_Armed_Forces', category: 'iran' },
  { file: 'wikipedia-irgc', title: 'Wikipedia — Islamic Revolutionary Guard Corps', url: 'https://en.wikipedia.org/wiki/Islamic_Revolutionary_Guard_Corps', category: 'iran' },
  { file: 'wikipedia-iran-israel-war', title: 'Wikipedia — Iran–Israel conflict', url: 'https://en.wikipedia.org/wiki/Iran%E2%80%93Israel_war', category: 'iran' },
  { file: 'wikipedia-iran-us-relations', title: 'Wikipedia — Iran–United States relations', url: 'https://en.wikipedia.org/wiki/Iran%E2%80%93United_States_relations', category: 'iran' },
  { file: 'csis-drone-saturation', title: 'CSIS — Drone Saturation: Russia’s Shahed campaign', url: 'https://www.csis.org/analysis/drone-saturation-russias-shahed-campaign', category: 'iran' },
  { file: 'csis-iran-drone-campaign', title: 'CSIS — Unpacking Iran’s Drone Campaign', url: 'https://www.csis.org/analysis/unpacking-irans-drone-campaign-gulf-early-lessons-future-drone-warfare', category: 'iran' },

  { file: 'data-unhcr-refugee', title: 'UNHCR — Refugee Data Finder (forced displacement)', url: 'https://www.unhcr.org/refugee-statistics/', category: 'unagency' },
  { file: 'data-uncomtrade', title: 'UN Comtrade — International merchandise trade statistics', url: 'https://comtradeplus.un.org/', category: 'unagency' },
  { file: 'github-data-military-ai', title: 'SIPRI — Databases & data sources (military expenditure, arms transfers, national material)', url: 'https://www.sipri.org/databases', category: 'framework', skip: false },
]

const results = [];
const state = stateLoad();

// Pages larger than this (raw text) are excluded from the search index so the
// client-side index stays small and search stays instant. They remain fully
// readable on the site — just not full-text indexed (searching a 1MB UN
// resolution dump isn't useful anyway).
const SEARCH_EXCLUDE_MIN = 80 * 1024;

function addSearchExcludeFm(file, md) {
  if (md.length < SEARCH_EXCLUDE_MIN) return md;
  const cur = fs.readFileSync(file, 'utf8');
  if (cur.startsWith('---')) return md;
  return '---\nsearch:\n  exclude: true\n---\n' + md;
}

async function downloadAll() {
  let sources = SOURCES;
  if (FLAGS.only) {
    sources = SOURCES.filter(s => s.file === FLAGS.only);
    if (!sources.length) {
      term.status.fail(`No source with file id "${FLAGS.only}"`);
      process.exit(1);
    }
  }
  const total = sources.length;

  for (let i = 0; i < total; i++) {
    const src = sources[i];
    term.progress(i, total, `downloading ${src.file}`);

    if (src.skip) {
      results.push({ ok: true, cached: true, ...src });
      term.progress(i + 1, total, `done ${src.file}`);
      if (!FLAGS.quiet) term.status.skip(src.title, 'skipped');
      continue;
    }
    // Skip fully-processed sources unless explicitly refreshing/forcing.
    if (!FLAGS.force && !FLAGS.refresh && isSourceDone(state, src)) {
      results.push({ ok: true, cached: true, ...src });
      term.progress(i + 1, total, `done ${src.file}`);
      if (!FLAGS.quiet) term.status.skip(src.title, 'state: done');
      continue;
    }
    try {
      const { contentType, buf, fromCache } = await fetchBytes(src, { pdf: src.pdf });
      const outFile = path.join(REFS_DIR, `${src.file}.md`);
      const isPdf = src.pdf || contentType.includes('pdf') || (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-');
      const detail = fromCache ? `${(buf.length / 1024).toFixed(0)} KB (cached)` : `${(buf.length / 1024).toFixed(0)} KB (fetched)`;

      if (isPdf) {
        // always keep a local copy of the PDF
        const pdfFile = path.join(DOWNLOADS, `${src.file}.pdf`);
        fs.writeFileSync(pdfFile, buf);
        let md = PDFTEXT_AVAILABLE ? pdfToMarkdown(buf, src.title) : null;
        if (md) {
          md = addSearchExcludeFm(outFile, md);
          fs.writeFileSync(outFile, md);
          if (!FLAGS.quiet) term.status.ok(src.title, `${detail} · ${md.length.toLocaleString()} chars`);
        } else {
          let stub = `# ${src.title}\n\n> PDF saved locally (${(buf.length / 1024).toFixed(0)} KB). pdftotext unavailable.\n\nSource: <${src.url}>\n\n[Open the PDF](../downloads/${src.file}.pdf)\n`;
          stub = addSearchExcludeFm(outFile, stub);
          fs.writeFileSync(outFile, stub);
          if (!FLAGS.quiet) term.status.warn(src.title, `${detail} · stub (no text extractor)`);
        }
      } else {
        const text = buf.toString('utf-8');
        let title = src.title;
        const t = text.match(/<h1[^>]*>(.*?)<\/h1>/is);
        if (t) title = t[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() || src.title;
        let md = toMarkdown(text, title, src.url);
        md = addSearchExcludeFm(outFile, md);
        fs.writeFileSync(outFile, md);
        const warn = md.length < 1500 ? ' ⚠ SHORT (likely JS-rendered shell)' : '';
        if (!FLAGS.quiet) {
          if (warn) term.status.warn(src.title, `${detail} · ${md.length.toLocaleString()} chars${warn}`);
          else term.status.ok(src.title, `${detail} · ${md.length.toLocaleString()} chars`);
        }
      }
      results.push({ ok: true, cached: fromCache, ...src });
      markDone(state, src);
      stateSave(state);
    } catch (e) {
      if (!FLAGS.quiet) term.status.fail(src.title, e.message);
      results.push({ ok: false, ...src });
    }
    term.progress(i + 1, total, `done ${src.file}`);
  }
  term.progress(total, total, 'done');
  return results;
}

// Regenerate the reference index grouped by category
function writeReferenceIndex(runResults) {
  const okSources = runResults.filter(r => r.ok);
  const files = fs.readdirSync(REFS_DIR).filter(f => f.endsWith('.md') && f !== 'index.md').sort();
  const md = [];
  md.push('# Offline Source Documents');
  md.push('');
  md.push(`Primary documents saved locally so the entire library works without internet. ${okSources.length} of ${runResults.length} sources downloaded.`);
  md.push('');
  for (const [key, label] of Object.entries(CAT)) {
    const items = okSources.filter(s => s.category === key);
    if (!items.length) continue;
    md.push(`## ${label}`);
    md.push('');
    for (const src of items) {
      const f = `${src.file}.md`;
      const exists = files.includes(f);
      if (exists) {
        md.push(`- [${src.title}](${f})`);
      } else {
        md.push(`- [${src.title}](${src.url}) — external link`);
      }
    }
    md.push('');
  }
  md.push('---');
  md.push('');
  md.push('Re-run `npm run download` to refresh.');
  md.push('');
  fs.writeFileSync(path.join(REFS_DIR, 'index.md'), md.join('\n'));
  return md.length;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`DISEC source downloader
Usage: node scripts/download-sources.mjs [options]

Options:
  --force, -f    ignore the blob cache and re-download everything
  --refresh, -r  re-validate cached blobs via conditional GET (ETag/Last-Modified)
  --only <file>  download only one source by file id (e.g. --only unsc-1540)
  --quiet, -q    suppress per-file status lines
  --help, -h     show this help`);
    process.exit(0);
  }

  const t0 = Date.now();
  const run = await downloadAll();
  writeReferenceIndex(run);

  // Summary table per category
  const rows = [];
  for (const [key, label] of Object.entries(CAT)) {
    const items = run.filter(s => s.category === key);
    if (!items.length) continue;
    rows.push({ name: label, ok: items.filter(r => r.ok).length, fail: items.filter(r => !r.ok).length });
  }
  const t = term.summaryTable(rows);
  const cached = run.filter(r => r.ok && r.cached && r.file && !state[r.file]?.at).length;
  const skipped = run.filter(r => r.ok && r.cached && r.file && state[r.file]?.at).length;
  const fresh = run.filter(r => r.ok && !r.cached).length;
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  term.section('Summary');
  term.status.info(`Done in ${ms}s`, `${t.ok} ok · ${t.fail} failed`);
  term.status.info('Blobs', `${fresh} fresh · ${cached} cached · ${skipped} state-skipped`);
  console.log(`\nDone. ${t.ok}/${run.length} sources saved to docs/references/`);
}

export { SOURCES, CAT, downloadAll, writeReferenceIndex };
