import {useEffect, useRef, useState} from 'react';
import Layout from '@theme/Layout';
import styles from './live.module.css';

function LiveNews() {
  const [all, setAll] = useState([]);
  const [status, setStatus] = useState('Loading feeds…');
  const [term, setTerm] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/rss?limit=12');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (cancelled) return;
        setAll(data.articles || []);
        setStatus((data.articles || []).length
          ? `${(data.articles || []).length} headlines`
          : 'No articles returned.');
      } catch (e) {
        if (cancelled) return;
        setStatus('Cannot reach the RSS proxy. Start it with `npm run serve` (or open the offline News Archive). ' + e.message);
        setAll([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus(all.length ? `${all.filter(a => `${a.title || ''} ${a.content || ''}`.toLowerCase().includes(term.toLowerCase())).length} of ${all.length} headlines` : '');
    }, 120);
    return () => clearTimeout(timer.current);
  }, [term, all]);

  const items = all.filter(a =>
    `${a.title || ''} ${a.content || ''}`.toLowerCase().includes(term.toLowerCase())
  );

  return (
    <Layout
      title="Live News"
      description="Live-aggregated headlines across UN, BBC, Al Jazeera, Reuters, Defense News, IISS, HRW, SIPRI and ICRC feeds.">
      <main className="container">
        <h1>Live News</h1>
        <p>
          Live-aggregated headlines across UN, BBC, Al Jazeera, Reuters, Defense News,
          IISS, HRW, SIPRI and ICRC feeds.
        </p>
        <p>
          Requires the proxy server running: <code>npm run serve</code> in the <code>wiki/</code> folder.
          When running purely offline with the saved archive, use the <a href="/news">News Archive</a> instead.
        </p>

        <label htmlFor="lnq">Filter:</label>
        <input
          id="lnq"
          type="search"
          placeholder="Search live headlines…"
          className={styles.input}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />

        <p className={styles.status}>{status}</p>
        <div className={styles.grid}>
          {items.map((a, idx) => {
            const date = a.pubDate ? new Date(a.pubDate).toLocaleDateString() : '';
            return (
              <div key={idx} className="ln-card">
                <span className="ln-src">{a.source || ''}</span>
                <a href={a.link} target="_blank" rel="noopener">{a.title || ''}</a>
                <span className="ln-date">{date}</span>
                <div className="ln-sum">{a.content || ''}</div>
              </div>
            );
          })}
        </div>
      </main>
    </Layout>
  );
}

export default LiveNews;
