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
const DOWNLOADS = path.join(WIKI, 'downloads');
const REFS_DIR = path.join(DOCS, 'references');
const CACHE_DIR = path.join(WIKI, '.cache', 'blobs');

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
  // ══ A. LAWS / military AI (core topic) ══════════════════════════
  { file: 'icrc-position-autonomous-weapons', title: 'ICRC Position on Autonomous Weapon Systems (2021)', url: 'https://www.icrc.org/en/document/icrc-position-autonomous-weapon-systems', category: 'unagency' },
  { file: 'icrc-recommends-new-rules', title: 'ICRC — Autonomous Weapons: The ICRC Recommends Adopting New Rules', url: 'https://www.icrc.org/en/document/autonomous-weapons-icrc-recommends-new-rules', category: 'unagency' },
  { file: 'unoda-lethal-autonomous-weapons', title: 'UNODA — Lethal Autonomous Weapon Systems', url: 'https://www.unoda.org/en/our-work/emerging-challenges/lethal-autonomous-weapon-systems', category: 'unagency' },
  { file: 'icrc-autonomous-weapons-overview', title: 'ICRC — Autonomous Weapons (law & policy overview)', url: 'https://www.icrc.org/en/law-and-policy/autonomous-weapons', category: 'unagency' },
  { file: 'un-charter', title: 'Charter of the United Nations (1945)', url: 'https://www.un.org/en/about-us/un-charter/full-text', category: 'convention' },
  { file: 'un-disarmament-agenda', title: 'UN Secretary-General\'s Agenda for Disarmament — "Securing Our Common Future" (2018)', url: 'https://digitallibrary.un.org/record/1628227/files/SG%2Bdisarmament%2Bagenda_1.pdf', category: 'unresolution', pdf: true },
  { file: 'wikipedia-lethal-autonomous-weapons', title: 'Wikipedia — Lethal Autonomous Weapons (overview & state positions)', url: 'https://en.wikipedia.org/wiki/Lethal_autonomous_weapon', category: 'framework' },
  { file: 'wikipedia-military-ai', title: 'Wikipedia — Military Artificial Intelligence', url: 'https://en.wikipedia.org/wiki/Military_artificial_intelligence', category: 'framework' },
  { file: 'new-agenda-for-peace', title: 'UN Policy Brief — A New Agenda for Peace (2023)', url: 'https://www.un.org/sites/un2.un.org/files/our-common-agenda-policy-brief-new-agenda-for-peace-en.pdf', category: 'unresolution', pdf: true },

  // ══ B. UN Resolutions & Official Documents ══════════════════════
  { file: 'un-res-a78-241-laws', title: 'UNGA Resolution A/RES/78/241 — LAWS (2023)', url: 'https://digitallibrary.un.org/record/4033027/files/A_RES_78_241-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-res-a79-62-laws', title: 'UNGA Resolution A/RES/79/62 — LAWS (2024, adopted 166-3-15)', url: 'https://digitallibrary.un.org/record/4071100/files/A_RES_79_62-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-res-a80-57-laws', title: 'UNGA Resolution A/RES/80/57 — LAWS (2025)', url: 'https://digitallibrary.un.org/record/4095989/files/A_RES_80_57-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-res-a79-239-military-ai', title: 'UNGA Resolution A/RES/79/239 — AI in the Military Domain (2024)', url: 'https://digitallibrary.un.org/record/4071348/files/A_RES_79_239-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-sg-report-a78-273-laws', title: 'UN SG Report A/78/273 — LAWS views & analysis (2023)', url: 'https://digitallibrary.un.org/record/4017741/files/A_78_273-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-sg-report-a79-88-laws', title: 'UN SG Report A/79/88 — LAWS views & analysis (2024)', url: 'https://digitallibrary.un.org/record/4059475/files/A_79_88-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-sg-report-a80-92-military-ai', title: 'UN SG Report A/80/92 — AI in the Military Domain (2025)', url: 'https://digitallibrary.un.org/record/4086346/files/A_80_92-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'un-a79-408-first-committee', title: 'First Committee Report A/79/408 — LAWS (2024)', url: 'https://digitallibrary.un.org/record/4067759/files/A_79_408-EN.pdf', category: 'unresolution', pdf: true },
  { file: 'unroca-founding-res-46-36', title: 'UNROCA founding Resolution A/RES/46/36 (1991)', url: 'https://undocs.org/en/A/RES/46/36', category: 'unresolution' },
  { file: 'un-disarmament-hub', title: 'UN — Office for Disarmament Affairs (main hub)', url: 'https://www.un.org/disarmament/', category: 'unresolution' },
  { file: 'un-digital-library', title: 'UN Digital Library (searchable resolutions & documents)', url: 'https://digitallibrary.un.org/', category: 'unresolution' },
  { file: 'ccw-gge-2025-meetings', title: 'CCW GGE on LAWS — 2025 Meeting Page (UNODA meetings portal)', url: 'https://meetings.unoda.org/ccw/convention-on-certain-conventional-weapons-group-of-governmental-experts-on-lethal-autonomous-weapons-systems-2025', category: 'unagency' },

  // ══ C. GGE on LAWS reports & guiding principles ══════════════════
  { file: 'gge-laws-2023-report', title: 'CCW GGE on LAWS — 2023 Chair\'s report (CCW/GGE.1/2023/CRP.1)', url: 'https://docs-library.unoda.org/Convention_on_Certain_Conventional_Weapons_-Group_of_Governmental_Experts_on_Lethal_Autonomous_Weapons_Systems_(2023)/CCW_GGE1_2023_CRP.1_0.pdf', category: 'unagency', pdf: true },
  { file: 'gge-laws-2023-final-report', title: 'CCW GGE on LAWS — 2023 final report (CCW/GGE.1/2023/2)', url: 'https://docs-library.unoda.org/Convention_on_Certain_Conventional_Weapons_-Group_of_Governmental_Experts_on_Lethal_Autonomous_Weapons_Systems_(2023)/CCW_GGE1_2023_2_Advance_version.pdf', category: 'unagency', pdf: true },
  { file: 'gge-laws-2019-report', title: 'CCW GGE on LAWS — 2019 report & 11 Guiding Principles (CCW/GGE.1/2019/3)', url: 'https://documents.unoda.org/wp-content/uploads/2020/09/CCW_GGE.1_2019_3_E.pdf', category: 'unagency', pdf: true },
  { file: 'gge-laws-2025-chair-summary-march', title: 'CCW GGE on LAWS — 2025 Chair\'s summary (March session)', url: "https://docs-library.unoda.org/Convention_on_Certain_Conventional_Weapons_-Group_of_Governmental_Experts_on_Lethal_Autonomous_Weapons_Systems_(2025)/CCW-GGE.1-2025-WP.1_-_Chair's_summary.pdf", category: 'unagency', pdf: true },
  { file: 'gge-laws-2025-chair-summary-sept', title: 'CCW GGE on LAWS — 2025 Chair\'s summary (September session)', url: "https://docs-library.unoda.org/Convention_on_Certain_Conventional_Weapons_-Group_of_Governmental_Experts_on_Lethal_Autonomous_Weapons_Systems_(2025)/CCW-GGE.1-2025-WP.9_-_Chair's_summary.pdf", category: 'unagency', pdf: true },
  { file: 'ccw-msp-2019-guiding-principles', title: 'CCW Guiding Principles affirmed by GGE (CCW/MSP/2019/9 Annex III)', url: 'https://ccdcoe.org/uploads/2020/02/UN-191213_CCW-MSP-Final-report-Annex-III_Guiding-Principles-affirmed-by-GGE.pdf', category: 'unagency', pdf: true },

  // ══ D. UN Agencies & Bodies ══════════════════════════════════════
  { file: 'unidir-abdm-2024', title: 'UNIDIR — Advisory Board on Disarmament Matters Report (2024)', url: 'https://unidir.org/wp-content/uploads/2024/09/UNIDIR_2024_ABDM_Report.pdf', category: 'unagency', pdf: true },
  { file: 'unidir-governance-ai-military', title: 'UNIDIR — Governance of AI in the Military Domain', url: 'https://unodaweb.unoda.org/public/2024-06/OP42.pdf', category: 'unagency', pdf: true },
  { file: 'unidir-security-technology', title: 'UNIDIR — Security & Technology Programme', url: 'https://unidir.org/programmes/security-and-technology/', category: 'unagency' },
  { file: 'unidir-military-ai-79-239', title: 'UNIDIR — AI in the Military Domain (First Committee briefing, 2025)', url: 'https://docs-library.unoda.org/General_Assembly_First_Committee_-Eightieth_session_(2025)/79-239-UNIDIR-EN.pdf', category: 'unagency', pdf: true },
  { file: 'unidir-ai-military-priority-areas', title: 'UNIDIR — Governance of AI in the Military Domain: Multi-stakeholder Priority Areas', url: 'https://unidir.org/publication/governance-of-artificial-intelligence-in-the-military-domain-a-multi-stakeholder-perspective-on-priority-areas/', category: 'unagency' },
  { file: 'unoda-explosive-weapons', title: 'UNODA — Explosive Weapons in Populated Areas', url: 'https://www.unoda.org/en/our-work/conventional-arms/explosive-weapons-populated-areas', category: 'unagency' },
  { file: 'un-register-conventional-arms', title: 'UN Register of Conventional Arms (UNROCA)', url: 'https://www.unoda.org/en/our-work/cross-cutting-issues/military-confidence-building-measures/register-conventional-arms', category: 'unagency' },
  { file: 'unroca-definitions', title: 'UNROCA — List of Definitions (2024)', url: 'https://front.un-arm.org/wp-content/uploads/2024/05/DEFINITIONS-71-UNROCA.pdf', category: 'unagency', pdf: true },
  { file: 'unsc-1540', title: 'UN Security Council Resolution 1540 (2004) — WMD non-proliferation', url: 'https://www.un.org/en/sc/1540/', category: 'unresolution' },
  { file: 'unodc-firearms-protocol', title: 'UNODC — Firearms Protocol overview', url: 'https://www.unodc.org/unodc/en/firearms-protocol/index.html', category: 'unagency' },

  // ══ E. Government & National Policy ══════════════════════════════
  { file: 'us-dod-directive-300009', title: 'US DoD Directive 3000.09 — Autonomy in Weapon Systems (2023)', url: 'https://static.carahsoft.com/concrete/files/4917/1101/9112/Guidance_DoD_Directive_3000.09_-_Autonomy_in_Weapon_Systems.pdf', category: 'government', pdf: true },
  { file: 'hrw-review-dod-300009', title: 'HRW / Harvard IHRC — Review of the 2023 US Policy on Autonomy in Weapons', url: 'https://humanrightsclinic.law.harvard.edu/wp-content/uploads/2023/02/Review-of-the-2023-US-Policy-on-Autonomy-in-Weapons-Systems.pdf', category: 'government', pdf: true },
  { file: 'us-political-declaration-military-ai', title: 'US Political Declaration on Responsible Military Use of AI and Autonomy (2023)', url: 'https://www.state.gov/political-declaration-on-responsible-military-use-of-artificial-intelligence-and-autonomy/', category: 'government' },
  { file: 'us-political-declaration-military-ai-pdf', title: 'US Political Declaration on Responsible Military Use of AI (PDF text)', url: 'https://www.state.gov/wp-content/uploads/2023/11/Political-Declaration-on-Responsible-Military-Use-of-Artificial-Intelligence-and-Autonomy-1.pdf', category: 'government', pdf: true },
  { file: 'eu-ai-act', title: 'EU Artificial Intelligence Act — Regulation (EU) 2024/1689', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1689', category: 'government' },

  // ══ F. Think Tanks & Research Institutes ═════════════════════════
  { file: 'sipri-yearbook', title: 'SIPRI Yearbook 2025 — Armaments, Disarmament & Int\'l Security', url: 'https://www.sipri.org/yearbook/2025', category: 'thinktank' },
  { file: 'sipri-autonomy-weapons', title: 'SIPRI — Autonomy in Weapon Systems (research programme)', url: 'https://www.sipri.org/research/armament-and-disarmament/emerging-military-and-security-technologies/autonomy-weapon-systems', category: 'thinktank' },
  { file: 'sipri-yb25-ai-chapter', title: 'SIPRI Yearbook 2025 — Ch.12 AI & International Peace and Security', url: 'https://www.sipri.org/sites/default/files/SIPRIYB25c12.pdf', category: 'thinktank', pdf: true },
  { file: 'sipri-unroca-reporting', title: 'SIPRI — Reporting to the UNROCA for 2017 (background paper)', url: 'https://www.sipri.org/sites/default/files/2019-06/bp_1906_unroca.pdf', category: 'thinktank', pdf: true },
  { file: 'iiss-military-balance', title: 'IISS — The Military Balance (annual)', url: 'https://www.iiss.org/online-analysis/military-balance/', category: 'thinktank' },
  { file: 'carnegie-ai-global-power', title: 'Carnegie Endowment — How AI Shapes Global Power', url: 'https://carnegieendowment.org/research/2023/05/how-ai-shapes-global-power?lang=en', category: 'thinktank' },
  { file: 'rand-ai-national-security', title: 'RAND — AI & National Security', url: 'https://www.rand.org/topics/artificial-intelligence.html', category: 'thinktank' },
  { file: 'hrw-arms', title: 'Human Rights Watch — Arms & Military Technology', url: 'https://www.hrw.org/topic/arms', category: 'thinktank' },
  { file: 'stop-killer-robots', title: 'Stop Killer Robots — Campaign for a ban on fully autonomous weapons', url: 'https://www.stopkillerrobots.org/', category: 'thinktank' },
  { file: 'article36-autonomous-weapons', title: 'Article 36 — Autonomous Weapons programme', url: 'https://article36.org/what-we-do/autonomous-weapons/', category: 'thinktank' },
  { file: 'small-arms-survey', title: 'Small Arms Survey (Geneva)', url: 'https://www.smallarmssurvey.org/', category: 'thinktank' },

  // ══ G. Regional & International Organizations ════════════════════
  { file: 'nato-ai-strategy', title: 'NATO Artificial Intelligence Strategy (2021)', url: 'https://www.nato.int/cps/en/natohq/official_texts_187617.htm', category: 'regional' },
  { file: 'unoda-regional-centres', title: 'UNODA — Regional Centres for Peace and Disarmament', url: 'https://www.unoda.org/en/our-work/regional-centres', category: 'regional' },

  // ══ H. Academic & Journals ════════════════════════════════════════
  { file: 'mit-spr-laws-ai', title: 'MIT Science Policy Review — LAWS & AI: Trends, Challenges, Policies', url: 'https://mit-spr.pubpub.org/pub/laws-ai', category: 'academic' },

  // ══ I. AI Policy Frameworks ═══════════════════════════════════════
  { file: 'unesco-ai-ethics', title: 'UNESCO Recommendation on the Ethics of AI (2021)', url: 'https://www.unesco.org/en/artificial-intelligence/recommendation-ethics', category: 'framework' },
  { file: 'oecd-ai-principles', title: 'OECD AI Principles (2019)', url: 'https://oecd.ai/en/ai-principles', category: 'framework' },

  // ══ J. Weapons conventions ════════════════════════════════════════
  { file: 'ccw-1980', title: 'Convention on Certain Conventional Weapons (CCW, 1980) — Full Text', url: 'https://www.icrc.org/sites/default/files/external/doc/en/assets/files/other/1980_ccw.en.pdf', category: 'convention', pdf: true },
  { file: 'ccw-unoda-page', title: 'UNODA — The Convention on Certain Conventional Weapons (disarmament.unoda.org)', url: 'https://disarmament.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons', category: 'convention' },
  { file: 'ccw-overview', title: 'UNODA — Convention on Certain Conventional Weapons (overview)', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons', category: 'convention' },
  { file: 'ccw-amended-protocol-ii', title: 'CCW Amended Protocol II — Mines, Booby-Traps & Other Devices', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons/ccw-amended-protocol-ii', category: 'convention' },
  { file: 'ccw-protocol-v', title: 'CCW Protocol V — Explosive Remnants of War', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-certain-conventional-weapons/ccw-protocol-v-explosive-remnants-war', category: 'convention' },
  { file: 'geneva-conventions', title: 'ICRC — The Geneva Conventions (1949) & Additional Protocols', url: 'https://www.icrc.org/en/law-and-policy/geneva-conventions-and-their-commentaries', category: 'convention' },
  { file: 'geneva-conventions-ihl-db', title: 'ICRC IHL Database — Geneva Conventions of 1949 (full text)', url: 'https://ihl-databases.icrc.org/en/ihl-treaties/geneva-conventions-of-1949', category: 'convention', skip: true },
  { file: 'npt-full-text', title: 'Treaty on the Non-Proliferation of Nuclear Weapons (NPT) — Full Text', url: 'https://www.un.org/disarmament/wmd/nuclear/npt/', category: 'convention' },
  { file: 'tpnw', title: 'Treaty on the Prohibition of Nuclear Weapons (TPNW, 2017)', url: 'https://www.unoda.org/en/our-work/weapons-mass-destruction/nuclear-weapons/treaty-prohibition-nuclear-weapons', category: 'convention' },
  { file: 'cwc', title: 'Chemical Weapons Convention (CWC, 1993)', url: 'https://www.unoda.org/en/our-work/weapons-mass-destruction/chemical-weapons', category: 'convention' },
  { file: 'cwc-opcw', title: 'OPCW — Chemical Weapons Convention (full text & provisions)', url: 'https://www.opcw.org/chemical-weapons-convention', category: 'convention' },
  { file: 'bwc', title: 'Biological Weapons Convention (BWC, 1972)', url: 'https://www.unoda.org/en/our-work/weapons-mass-destruction/biological-weapons/biological-weapons-convention', category: 'convention' },
  { file: 'att', title: 'Arms Trade Treaty (ATT, 2013)', url: 'https://www.unoda.org/en/our-work/conventional-arms/legal-instruments/arms-trade-treaty', category: 'convention' },
  { file: 'firearms-protocol', title: 'UN Firearms Protocol (2001)', url: 'https://www.unoda.org/en/our-work/conventional-arms/legal-instruments/firearms-protocol', category: 'convention' },
  { file: 'apmbc', title: 'Anti-Personnel Mine Ban Convention (Ottawa, 1997)', url: 'https://www.unoda.org/en/our-work/conventional-arms/anti-personnel-landmines-convention', category: 'convention' },
  { file: 'ccm', title: 'Convention on Cluster Munitions (2008)', url: 'https://www.unoda.org/en/our-work/conventional-arms/convention-cluster-munitions', category: 'convention' },
  { file: 'geneva-protocol-1925', title: '1925 Geneva Protocol (asphyxiating & poisonous gases)', url: 'https://front.un-arm.org/wp-content/uploads/2020/10/1925-Geneva-Protocol-1.pdf', category: 'convention', pdf: true },

  // ══ K. Iran / Middle East ═════════════════════════════════════════
  { file: 'wikipedia-iran-wmd', title: 'Wikipedia — Iran and Weapons of Mass Destruction', url: 'https://en.wikipedia.org/wiki/Iran_and_weapons_of_mass_destruction', category: 'iran' },
  { file: 'wikipedia-iran-nuclear', title: 'Wikipedia — Nuclear Program of Iran', url: 'https://en.wikipedia.org/wiki/Nuclear_program_of_Iran', category: 'iran' },
  { file: 'wikipedia-military-of-iran', title: 'Wikipedia — Military of Iran', url: 'https://en.wikipedia.org/wiki/Military_of_Iran', category: 'iran' },
  { file: 'wikipedia-iranian-armed-forces', title: 'Wikipedia — Iranian Armed Forces', url: 'https://en.wikipedia.org/wiki/Iranian_Armed_Forces', category: 'iran' },
  { file: 'wikipedia-irgc-aerospace', title: 'Wikipedia — IRGC Aerospace Force', url: 'https://en.wikipedia.org/wiki/Islamic_Revolutionary_Guard_Corps_Aerospace_Force', category: 'iran' },
  { file: 'wikipedia-irgc', title: 'Wikipedia — Islamic Revolutionary Guard Corps', url: 'https://en.wikipedia.org/wiki/Islamic_Revolutionary_Guard_Corps', category: 'iran' },
  { file: 'wikipedia-iran-israel-war', title: 'Wikipedia — Iran–Israel conflict overview', url: 'https://en.wikipedia.org/wiki/Iran%E2%80%93Israel_war', category: 'iran' },
  { file: 'wikipedia-iran-us-relations', title: 'Wikipedia — Iran–United States Relations', url: 'https://en.wikipedia.org/wiki/Iran%E2%80%93United_States_relations', category: 'iran' },
  { file: 'wikipedia-arms-trade-treaty', title: 'Wikipedia — Arms Trade Treaty', url: 'https://en.wikipedia.org/wiki/Arms_Trade_Treaty', category: 'iran' },
  { file: 'csis-drone-saturation', title: 'CSIS — Drone Saturation: Russia\'s Shahed Campaign (2025)', url: 'https://www.csis.org/analysis/drone-saturation-russias-shahed-campaign', category: 'iran' },
  { file: 'csis-iran-drone-campaign', title: 'CSIS — Unpacking Iran\'s Drone Campaign in the Gulf (2026)', url: 'https://www.csis.org/analysis/unpacking-irans-drone-campaign-gulf-early-lessons-future-drone-warfare', category: 'iran' },
  { file: 'iran-mfa-english', title: 'Iran Ministry of Foreign Affairs (English official site)', url: 'https://en.mfa.gov.ir/', category: 'iran', skip: true },
  { file: 'irna-english', title: 'IRNA (Islamic Republic News Agency, English)', url: 'https://en.irna.ir/', category: 'iran', skip: true },
  { file: 'mecouncil-iran-missiles-drones', title: 'Middle East Council — Iran\'s Missile & Drone Program (2024)', url: 'https://mecouncil.org/wp-content/uploads/2024/07/ME-Council_Issue-Brief-Iranian-Drones-Final-_WEB.pdf', category: 'iran', pdf: true },
  { file: 'iphr-iran-role-drone-war', title: 'IPHR — From Tehran to Kyiv: Iran\'s Role in Russia\'s Drone War (2026)', url: 'https://iphronline.org/wp-content/uploads/2026/03/from-tehran-to-kyiv_report.pdf', category: 'iran', pdf: true, skip: true },
];

const results = [];

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
    try {
      const { contentType, buf, fromCache } = await fetchBytes(src, { pdf: src.pdf });
      const outFile = path.join(REFS_DIR, `${src.file}.md`);
      const isPdf = src.pdf || contentType.includes('pdf');
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
  const cached = run.filter(r => r.cached).length;
  const fresh = run.filter(r => r.ok && !r.cached).length;
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  term.section('Summary');
  term.status.info(`Done in ${ms}s`, `${t.ok} ok · ${t.fail} failed`);
  term.status.info('Blobs', `${fresh} fresh · ${cached} from cache · ${run.filter(r => r.ok && !r.ok && false).length || 0} skipped`);
  console.log(`\nDone. ${t.ok}/${run.length} sources saved to docs/references/`);
}

export { SOURCES, CAT, downloadAll, writeReferenceIndex };
