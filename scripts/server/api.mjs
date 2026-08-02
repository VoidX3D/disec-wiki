/**
 * API handlers: /api/rss (RSS aggregation), /api/health, /api/search.
 */
import fs from 'fs';
import path from 'path';
import cluster from 'cluster';
import Parser from 'rss-parser';
import { json } from './middleware.mjs';

const FEEDS = [
  { id: 'un', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', source: 'UN News' },
  { id: 'un-oda', url: 'https://www.un.org/press/en/rss.xml', source: 'UN Press' },
  { id: 'ohchr', url: 'https://www.ohchr.org/en/rss.xml', source: 'OHCHR' },
  { id: 'unhcr', url: 'https://www.unhcr.org/rss.xml', source: 'UNHCR' },
  { id: 'reliefweb', url: 'https://reliefweb.int/updates/rss', source: 'ReliefWeb' },
  { id: 'who', url: 'https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml', source: 'WHO' },
  { id: 'unicef', url: 'https://www.unicef.org/feeds/nf.xml', source: 'UNICEF' },
  { id: 'fao', url: 'http://www.fao.org/rss/en/', source: 'FAO' },
  { id: 'bbc', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  { id: 'defense-news', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', source: 'Defense News' },
  { id: 'hrw', url: 'https://www.hrw.org/rss.xml', source: 'Human Rights Watch' },
  { id: 'bbc-world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
  { id: 'reuters', url: 'https://feeds.reuters.com/reuters/worldNews', source: 'Reuters' },
  { id: 'france24', url: 'https://www.france24.com/en/rss', source: 'France24' },
  { id: 'dw', url: 'https://rss.dw.com/xml/rss-en-all', source: 'Deutsche Welle' },
  { id: 'guardian', url: 'https://www.theguardian.com/world/rss', source: 'The Guardian' },
];

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createApiHandlers({ siteDir, rssTimeoutMs = 12000, rssDefaultLimit = 12, rssMaxLimit = 50, logger }) {
  const parser = new Parser({ timeout: rssTimeoutMs, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' } });
  const SEARCH_INDEX = path.join(siteDir, 'search', 'flexsearch-index.json');

  let searchIndex = null;
  let searchIndexMtime = 0;

  function loadSearchIndex() {
    try {
      if (!fs.existsSync(SEARCH_INDEX)) return null;
      const stat = fs.statSync(SEARCH_INDEX);
      if (searchIndex && stat.mtimeMs === searchIndexMtime) return searchIndex;
      searchIndex = JSON.parse(fs.readFileSync(SEARCH_INDEX, 'utf8'));
      searchIndexMtime = stat.mtimeMs;
      return searchIndex;
    } catch {
      return null;
    }
  }

  async function fetchOgImage(url) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<meta[^>]+property=(?:"|')og:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i)
        || html.match(/<meta[^>]+name=(?:"|')twitter:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  async function fetchFeed(feed, limit) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DISEC-Hub/2.0)' },
        signal: AbortSignal.timeout(rssTimeoutMs),
      });
      if (!res.ok) {
        logger?.warn('rss-fetch', { feed: feed.id, status: res.status });
        return [];
      }
      const r = await parser.parseString(await res.text());
      return (r.items || []).slice(0, limit).map(it => {
        // attempt to extract an image from known fields or fallback to OG image
        const mediaUrl = it['media:content']?.url || it['media:thumbnail']?.url || it.image?.url || it.enclosure?.url || null;
        return ({
          title: it.title || 'Untitled',
          link: it.link || '',
          content: stripHtml(it.contentSnippet || it.content || '').slice(0, 300),
          pubDate: it.pubDate || it.isoDate || '',
          source: feed.source,
          sourceId: feed.id,
          image: mediaUrl || null,
          // note: OG image resolution may be deferred by the caller to avoid blocking
        });
      });
    } catch (e) {
      logger?.error('rss-fetch', { feed: feed.id, message: e.message });
      return [];
    }
  }

  return {
    rss: async (req, res) => {
      const limit = Math.min(parseInt(req.query.get('limit') || rssDefaultLimit, 10) || rssDefaultLimit, rssMaxLimit);
      const sources = (req.query.get('sources') || '').split(',').filter(Boolean);
      const active = FEEDS.filter(f => sources.length === 0 || sources.includes(f.id));
      const results = await Promise.all(active.map(f => fetchFeed(f, limit)));
      const articles = results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      json(req, res, 200, { total: articles.length, articles, ts: new Date().toISOString() });
    },

    health: (req, res) => {
      const mem = process.memoryUsage();
      const info = {
        status: 'ok',
        uptime: Math.round(process.uptime()),
        pid: process.pid,
        workers: cluster.isWorker
          ? 'cluster:' + (cluster.worker?.id ?? '?')
          : (cluster.isPrimary ? 'primary' : 'single'),
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
        site: { exists: fs.existsSync(siteDir), index: fs.existsSync(path.join(siteDir, 'index.html')) },
        search: { indexLoaded: !!loadSearchIndex(), docs: loadSearchIndex()?.docs?.length || 0 },
        timestamp: new Date().toISOString(),
      };
      json(req, res, 200, info);
    },

    search: (req, res) => {
      const q = (req.query.get('q') || '').trim();
      if (!q) { json(req, res, 200, { query: '', results: [], total: 0 }); return; }
      const idx = loadSearchIndex();
      if (!idx || !idx.docs) { json(req, res, 503, { error: 'Search index not available' }); return; }

      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = idx.docs.map(doc => {
        const titleLower = (doc.title || '').toLowerCase();
        const textLower = (doc.text || '').toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (titleLower.includes(t)) score += 10;
          if (textLower.includes(t)) score += 1;
        }
        return { ...doc, score };
      }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);

      json(req, res, 200, { query: q, results: scored, total: scored.length });
    },
  };
}
