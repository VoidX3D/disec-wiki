/**
 * DISEC Research Wiki -- letter-by-letter instant search
 *
 * - Single character triggers results
 * - Prefix, substring, and phrase matching
 * - Highlighted snippets with context
 * - Keyboard navigation (/ to focus, arrows, enter, escape)
 * - localStorage caching
 */
(function () {
  'use strict';

  const INDEX_URL = '/search/flexsearch-index.json';
  const CACHE_KEY = 'disec-search-v4';
  const CACHE_TTL = 3600000;

  let docs = null;
  let loading = false;
  let debounceTimer = null;
  let selectedIndex = -1;
  let searchInput = null;
  let resultsContainer = null;

  function getCached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
      return c.data;
    } catch { localStorage.removeItem(CACHE_KEY); return null; }
  }

  function setCached(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
  }

  async function loadIndex() {
    if (docs) return docs;
    if (loading) return null;
    loading = true;
    const cached = getCached();
    if (cached) { docs = cached; loading = false; return docs; }
    try {
      const res = await fetch(INDEX_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      docs = data.docs || [];
      setCached(docs);
      return docs;
    } catch (e) {
      console.warn('[DISEC search] load failed:', e);
      return null;
    } finally {
      loading = false;
    }
  }

  function parseQuery(query) {
    const phrases = [];
    const words = [];
    const re = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(query))) {
      if (m[1]) phrases.push(m[1].toLowerCase());
      else words.push(m[2].toLowerCase());
    }
    return { phrases, words };
  }

  function search(query, maxResults) {
    if (!docs || !query.trim()) return [];
    maxResults = maxResults || 15;

    const { phrases, words } = parseQuery(query);
    if (!phrases.length && !words.length) return [];

    const allTerms = phrases.concat(words);
    const results = [];

    for (let i = 0, len = docs.length; i < len; i++) {
      const doc = docs[i];
      const t = (doc.title || '').toLowerCase();
      const x = (doc.text || '').toLowerCase();
      const c = t + ' ' + x;
      let score = 0;

      for (let j = 0; j < allTerms.length; j++) {
        const term = allTerms[j];
        const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (j < phrases.length) {
          // Exact phrase
          if (c.indexOf(term) >= 0) {
            score += 60;
            if (t.indexOf(term) >= 0) score += 40;
          } else {
            score = 0;
            break;
          }
        } else {
          // Letter-by-letter: full word > prefix > substring
          const wordRe = new RegExp('\\b' + esc + '\\b', 'i');
          const prefixRe = new RegExp('\\b' + esc, 'i');
          const subRe = new RegExp(esc, 'i');

          if (wordRe.test(c)) {
            score += 15;
            if (wordRe.test(t)) score += 25;
          } else if (prefixRe.test(c)) {
            score += 10;
            if (prefixRe.test(t)) score += 18;
          } else if (subRe.test(c)) {
            score += 5;
            if (subRe.test(t)) score += 10;
          } else {
            score = 0;
            break;
          }
        }
      }

      if (score > 0) results.push({ doc: doc, score: score });
    }

    results.sort(function (a, b) { return b.score - a.score; });

    const out = [];
    for (let i = 0, n = Math.min(results.length, maxResults); i < n; i++) {
      const d = results[i].doc;
      out.push({
        location: d.location,
        title: d.title || 'Untitled',
        text: d.text || '',
        score: results[i].score,
      });
    }
    return out;
  }

  function highlight(text, query, maxLen) {
    maxLen = maxLen || 160;
    if (!text) return '';
    const { phrases, words } = parseQuery(query);
    const allTerms = phrases.concat(words).filter(Boolean);
    if (!allTerms.length) return text.slice(0, maxLen);

    var bestIdx = -1;
    for (var i = 0; i < allTerms.length; i++) {
      var idx = text.toLowerCase().indexOf(allTerms[i]);
      if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) bestIdx = idx;
    }

    var snippet;
    if (bestIdx > 25) {
      snippet = '\u2026' + text.slice(bestIdx - 20, bestIdx + maxLen);
    } else {
      snippet = text.slice(0, maxLen);
    }

    for (var i = 0; i < allTerms.length; i++) {
      var re = new RegExp('(' + allTerms[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      snippet = snippet.replace(re, '<mark>$1</mark>');
    }

    if (bestIdx + maxLen < text.length) snippet += '\u2026';
    return snippet;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderResults(results, query) {
    if (!resultsContainer) return;

    if (!query.trim()) {
      resultsContainer.innerHTML = '';
      resultsContainer.style.display = 'none';
      return;
    }

    if (!results.length) {
      resultsContainer.innerHTML =
        '<div class="dse-search-empty">' +
          '<p>No results for <strong>' + esc(query) + '</strong></p>' +
          '<p class="dse-search-hint">Try different keywords</p>' +
        '</div>';
      resultsContainer.style.display = 'block';
      selectedIndex = -1;
      return;
    }

    var html = '';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var url = r.location.charAt(0) === '/' ? r.location : '/' + r.location;
      var snippet = highlight(r.text, query);
      html +=
        '<a class="dse-search-result' + (i === selectedIndex ? ' selected' : '') +
        '" href="' + esc(url) + '" data-index="' + i + '">' +
          '<div class="dse-search-result-title">' + esc(r.title) + '</div>' +
          '<div class="dse-search-result-url">' + esc(r.location) + '</div>' +
          '<div class="dse-search-result-snippet">' + snippet + '</div>' +
        '</a>';
    }

    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
  }

  function updateSel(items) {
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('selected', i === selectedIndex);
      if (i === selectedIndex) items[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function createUI() {
    // Remove old material search
    var oldSearch = document.querySelector('.md-search');
    if (oldSearch) oldSearch.remove();

    var headerInner = document.querySelector('.md-header__inner');
    if (!headerInner) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'dse-search';
    wrapper.innerHTML =
      '<div class="dse-search-box">' +
        '<svg class="dse-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">' +
          '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>' +
        '</svg>' +
        '<input type="text" class="dse-search-input" placeholder="Search the wiki\u2026" aria-label="Search" autocomplete="off" />' +
        '<kbd class="dse-search-kbd">/</kbd>' +
      '</div>' +
      '<div class="dse-search-results" id="dse-search-results"></div>';

    headerInner.appendChild(wrapper);

    searchInput = wrapper.querySelector('.dse-search-input');
    resultsContainer = wrapper.querySelector('#dse-search-results');

    // Single character triggers results -- 50ms debounce
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var q = searchInput.value.trim();
        if (q.length < 1) { renderResults([], q); return; }
        loadIndex().then(function () { renderResults(search(q), q); });
      }, 50);
    });

    searchInput.addEventListener('keydown', function (e) {
      var items = resultsContainer.querySelectorAll('.dse-search-result');
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, items.length - 1); updateSel(items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateSel(items); }
      else if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); items[selectedIndex].click(); }
      else if (e.key === 'Escape') { resultsContainer.style.display = 'none'; selectedIndex = -1; searchInput.blur(); }
    });

    // / to focus
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          searchInput.focus();
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        resultsContainer.style.display = 'none';
        selectedIndex = -1;
      }
    });

    searchInput.addEventListener('focus', function () { if (!docs) loadIndex(); }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
  } else {
    createUI();
  }
})();
