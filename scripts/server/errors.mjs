/**
 * HTML error pages (no emojis).
 */
import { text } from './middleware.mjs';

export function errorPage(req, res, status, title, message) {
  const bg = status >= 500 ? '#fee2e2' : status === 429 ? '#fef3c7' : status === 403 ? '#fef3c7' : '#f0f4f8';
  const html = `<!doctype html><html lang="en"><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${status} ${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:${bg};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
  .card{background:#fff;border-radius:12px;padding:2.5rem 3rem;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);border:1px solid #e3e6ea}
  h1{font-size:3rem;color:#1b1f27;margin-bottom:.25rem}
  p{color:#5a6472;margin-top:.75rem;line-height:1.6}
  a{color:#4051b5;text-decoration:none}a:hover{text-decoration:underline}
  code{background:#eef0f4;padding:.15em .4em;border-radius:4px;font-size:.85em}
  .meta{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e3e6ea;font-size:.75rem;color:#8a94a3}
</style></head><body><div class="card">
  <h1>${status}</h1>
  <p><strong>${title}</strong></p>
  <p>${message}</p>
  <p style="margin-top:1.5rem"><a href="/">← Back to DISEC Research Wiki</a></p>
  <div class="meta">${new Date().toISOString()}</div>
</div></body></html>`;
  text(req, res, status, html, 'text/html; charset=utf-8');
}
