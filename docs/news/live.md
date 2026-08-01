# Live News

Live-aggregated headlines across UN, BBC, Al Jazeera, Reuters, Defense News, IISS, HRW, SIPRI and ICRC feeds.

Requires the proxy server running: `npm run serve` in the `wiki/` folder. When running
purely offline with the saved archive, use the [News Archive](index.md) instead.

<label for="lnq">Filter:</label>
<input id="lnq" type="search" placeholder="Search live headlines…" style="width:100%;padding:.5rem .75rem;border:1px solid var(--md-default-fg-color--lightest);border-radius:6px;margin-bottom:1rem;background:var(--md-default-bg-color);color:var(--md-default-fg-color)">

<div id="ln-status" style="color:var(--md-default-fg-color--light);font-size:.8rem;margin-bottom:1rem"></div>
<div id="ln-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.75rem"></div>

<style>
.ln-card{border:1px solid var(--md-default-fg-color--lightest);border-radius:8px;padding:.85rem;display:flex;flex-direction:column;gap:.35rem;background:var(--md-default-bg-color)}
.ln-card a{font-weight:600;font-size:.9rem}
.ln-src{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--md-default-fg-color--light)}
.ln-date{font-size:.72rem;color:var(--md-default-fg-color--light)}
.ln-sum{font-size:.78rem;color:var(--md-default-fg-color);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
</style>

<script>
(function () {
  const status = document.getElementById('ln-status');
  const list = document.getElementById('ln-list');
  const q = document.getElementById('lnq');
  let all = [];

  status.textContent = 'Loading feeds…';

  async function load() {
    try {
      const res = await fetch('/api/rss?limit=12');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      all = data.articles || [];
      render();
    } catch (e) {
      status.textContent = 'Cannot reach the RSS proxy. Start it with `npm run serve` (or open the offline News Archive). ' + e.message;
      list.innerHTML = '';
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function render() {
    const term = (q.value || '').toLowerCase();
    const items = term
      ? all.filter(a => ((a.title || '') + ' ' + (a.content || '')).toLowerCase().includes(term))
      : all;
    status.textContent = all.length
      ? items.length + ' of ' + all.length + ' headlines'
      : 'No articles returned.';
    list.innerHTML = items.map(a => {
      const date = a.pubDate ? new Date(a.pubDate).toLocaleDateString() : '';
      return '<div class="ln-card">' +
        '<span class="ln-src">' + esc(a.source || '') + '</span>' +
        '<a href="' + esc(a.link) + '" target="_blank" rel="noopener">' + esc(a.title || '') + '</a>' +
        '<span class="ln-date">' + esc(date) + '</span>' +
        '<div class="ln-sum">' + esc(a.content || '') + '</div>' +
        '</div>';
    }).join('');
  }

  q.addEventListener('input', render);
  load();
})();
</script>
