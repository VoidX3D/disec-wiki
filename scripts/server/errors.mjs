/**
 * HTML error pages with SVG icons, action buttons and a site-matched palette.
 * No emojis — icons are inline SVG.
 */

import { text } from './middleware.mjs';

// Small inline SVG icons (24x24, stroke-based)
const ICONS = {
  back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  retry: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  wrench: '<path d="M14.7 6.3a5 5 0 0 0-6.8 6L2 18.2V21a1 1 0 0 0 1 1h2.8l5.9-5.9a5 5 0 0 0 6-6.8l-2.7 2.7-3.2-.5-.5-3.2z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};

function icon(name, size = 20) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Per-status configuration: palette, accent icon, primary action.
function statusTheme(status) {
  if (status === 404) {
    return {
      bg: '#f0f4f8',
      accent: '#4051b5',
      icon: 'back',
      hint: 'The page was moved, renamed or never existed.',
    };
  }
  if (status === 503) {
    return {
      bg: '#fef3c7',
      accent: '#a16207',
      icon: 'wrench',
      hint: 'The static build output is missing or incomplete.',
    };
  }
  if (status === 429) {
    return {
      bg: '#fef3c7',
      accent: '#a16207',
      icon: 'retry',
      hint: 'Too many requests — please slow down and try again.',
    };
  }
  if (status === 403) {
    return {
      bg: '#fef3c7',
      accent: '#a16207',
      icon: 'alert',
      hint: 'You do not have permission to access this resource.',
    };
  }
  return {
    bg: '#fee2e2',
    accent: '#b91c1c',
    icon: 'alert',
    hint: 'Something went wrong on our side.',
  };
}

function buttons(status) {
  const home = `<a class="btn" href="/">${icon('home', 16)}<span>Home</span></a>`;
  const back = `<a class="btn" href="javascript:history.back()">${icon('back', 16)}<span>Go back</span></a>`;
  if (status === 503) {
    return [
      home,
      `<a class="btn btn--accent" href="/api/health">${icon('retry', 16)}<span>Check status</span></a>`,
      `<a class="btn" href="/references/">${icon('wrench', 16)}<span>Source library</span></a>`,
    ].join('\n  ');
  }
  if (status === 404) {
    return [home, back, `<a class="btn" href="/references/">${icon('wrench', 16)}<span>Reference library</span></a>`].join('\n  ');
  }
  return [home, back].join('\n  ');
}

export function errorPage(req, res, status, title, message) {
  const t = statusTheme(status);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${status} ${title} — DISEC Research Wiki</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{min-height:100%}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:${t.bg};display:flex;align-items:center;justify-content:center;padding:2rem;color:#1b1f27}
  .card{background:#fff;border-radius:16px;padding:2.75rem 3rem;max-width:520px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.10);border:1px solid rgba(0,0,0,.06)}
  .badge{display:inline-flex;align-items:center;gap:.5rem;width:3.25rem;height:3.25rem;border-radius:12px;background:color-mix(in srgb, ${t.accent} 12%, #fff);color:${t.accent};justify-content:center;margin-bottom:1.25rem}
  h1{font-size:4rem;font-weight:800;letter-spacing:-.04em;line-height:1;color:#1b1f27}
  h2{font-size:1.15rem;font-weight:700;color:#2a303a;margin-top:.6rem}
  p{color:#5a6472;margin-top:.75rem;line-height:1.6;font-size:.95rem}
  .hint{color:#8a94a3;font-size:.8rem}
  .actions{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;margin-top:1.75rem}
  a.btn{display:inline-flex;align-items:center;gap:.45rem;padding:.6rem 1.1rem;border-radius:10px;background:#f2f4f8;color:#333a45;text-decoration:none;font-weight:600;font-size:.86rem;border:1px solid #e3e6ea;transition:transform .12s, box-shadow .12s, border-color .12s}
  a.btn:hover{transform:translateY(-1px);border-color:#c7cdd8;box-shadow:0 3px 10px rgba(0,0,0,.08)}
  a.btn--accent{background:${t.accent};border-color:${t.accent};color:#fff}
  a.btn--accent:hover{filter:brightness(1.05)}
  code{background:#eef0f4;padding:.15em .4em;border-radius:4px;font-size:.85em}
  .meta{margin-top:1.75rem;padding-top:1rem;border-top:1px solid #e9ecf1;font-size:.72rem;color:#9aa2b0;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  @media (max-width:480px){.card{padding:2rem 1.5rem}}
</style></head><body><div class="card">
  <div class="badge">${icon(t.icon, 28)}</div>
  <h1>${status}</h1>
  <h2>${title}</h2>
  <p>${message}</p>
  <p class="hint">${t.hint}</p>
  <div class="actions">
  ${buttons(status)}
  </div>
  <div class="meta"><span>DISEC Research Wiki · Iran Delegation</span><span>${new Date().toUTCString()}</span></div>
</div></body></html>`;
  text(req, res, status, html, 'text/html; charset=utf-8');
}
