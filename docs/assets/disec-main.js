/**
 * DISEC Research Wiki — client-side performance layer
 *
 * Features:
 *   - Service worker registration (aggressive caching)
 *   - Skeleton loaders during page transitions
 *   - Link preloading on hover (instant navigation)
 *   - Page transition animations
 *   - Search index preloading
 *   - Offline indicator
 */
(function () {
  'use strict';

  // ── Service Worker Registration ────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/assets/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[DISEC] SW registered, scope:', reg.scope);
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('[DISEC] SW updated — new content available');
            }
          });
        });
      })
      .catch(err => console.warn('[DISEC] SW registration failed:', err));
  }

  // ── Skeleton Loader for Page Transitions ───────────────────────
  const SKELETON_HTML = `
    <div class="dse-page-skeleton" aria-hidden="true">
      <div class="dse-skel-header">
        <div class="skeleton" style="height:2rem;width:40%;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:1rem;width:70%;margin-bottom:0.5rem"></div>
        <div class="skeleton" style="height:1rem;width:55%"></div>
      </div>
      <div class="dse-skel-content">
        <div class="skeleton" style="height:1rem;width:100%;margin-bottom:0.75rem"></div>
        <div class="skeleton" style="height:1rem;width:90%;margin-bottom:0.75rem"></div>
        <div class="skeleton" style="height:1rem;width:95%;margin-bottom:0.75rem"></div>
        <div class="skeleton" style="height:1rem;width:60%;margin-bottom:1.5rem"></div>
        <div class="skeleton" style="height:8rem;width:100%;border-radius:10px;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:1rem;width:100%;margin-bottom:0.75rem"></div>
        <div class="skeleton" style="height:1rem;width:85%;margin-bottom:0.75rem"></div>
        <div class="skeleton" style="height:1rem;width:92%"></div>
      </div>
    </div>`;

  // Inject skeleton transition styles
  if (!document.getElementById('dse-transition-styles')) {
    const style = document.createElement('style');
    style.id = 'dse-transition-styles';
    style.textContent = `
      .dse-page-skeleton {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
      }
      .dse-skel-header { margin-bottom: 2rem; }
      .dse-skel-content { display: flex; flex-direction: column; gap: 0; }
      .dse-page-exit {
        animation: dse-fade-out 120ms ease forwards;
      }
      .dse-page-enter {
        animation: dse-fade-in 200ms ease both;
      }
      @keyframes dse-fade-out {
        to { opacity: 0; transform: translateY(-4px); }
      }
      @keyframes dse-fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      /* Offline banner */
      .dse-offline-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #e65100;
        color: #fff;
        text-align: center;
        padding: 0.5rem;
        font-size: 0.82rem;
        z-index: 9999;
        transform: translateY(100%);
        transition: transform 200ms ease;
      }
      .dse-offline-banner.visible {
        transform: translateY(0);
      }
      /* Prefetch indicator */
      .dse-prefetching .md-main__inner {
        opacity: 0.85;
        transition: opacity 120ms;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Link Prefetching on Hover ──────────────────────────────────
  const prefetched = new Set();
  const LINK_SELECTOR = 'a[href^="/"]';

  function prefetch(url) {
    if (prefetched.has(url)) return;
    prefetched.add(url);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);
  }

  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest(LINK_SELECTOR);
    if (a && a.href) {
      const url = new URL(a.href);
      if (url.origin === location.origin) {
        prefetch(url.pathname);
      }
    }
  });

  // ── Page Transition on Navigation ──────────────────────────────
  document.addEventListener('click', (e) => {
    const a = e.target.closest(LINK_SELECTOR);
    if (!a) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) return;

    // Don't intercept search result clicks
    if (a.closest('.dse-search-results')) return;

    e.preventDefault();
    document.documentElement.classList.add('dse-page-exit');

    setTimeout(() => {
      window.location.href = a.href;
    }, 120);
  });

  // ── Offline Indicator ──────────────────────────────────────────
  const banner = document.createElement('div');
  banner.className = 'dse-offline-banner';
  banner.textContent = 'You are offline -- showing cached content';
  document.body.appendChild(banner);

  function updateOnlineStatus() {
    banner.classList.toggle('visible', !navigator.onLine);
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // ── Preload Search Index on Focus ──────────────────────────────
  let searchPreloaded = false;
  const searchInput = document.querySelector('.md-search__input');
  if (searchInput) {
    searchInput.addEventListener('focus', () => {
      if (!searchPreloaded) {
        searchPreloaded = true;
        prefetch('/search/flexsearch-index.json');
      }
    }, { once: true });
  }

  // ── Performance Metrics ────────────────────────────────────────
  if ('performance' in window) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const paint = performance.getEntriesByType('paint');
        const nav = performance.getEntriesByType('navigation')[0];
        console.log('[DISEC] Performance:', {
          domContentLoaded: nav?.domContentLoadedEventEnd,
          loadEvent: nav?.loadEventEnd,
          firstPaint: paint.find(e => e.name === 'first-paint')?.startTime,
          firstContentfulPaint: paint.find(e => e.name === 'first-contentful-paint')?.startTime,
          transferSize: nav?.transferSize,
        });
      }, 0);
    });
  }
})();
