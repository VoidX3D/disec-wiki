import {useEffect, useState} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import IranDash from '@site/src/components/IranDash/IranDash';

import styles from './index.module.css';

function Hero() {
  return (
    <section className="hero">
      <span className="hero-eyebrow">
        <span className="eyebrow-dot" />
        United Nations · General Assembly · First Committee (DISEC)
      </span>
      <h1>Regulating Lethal Autonomous Weapons Systems &amp; Military AI</h1>
      <p className="hero-sub">
        Full offline research hub for the delegation of the <strong>Islamic Republic of Iran</strong> —
        Motherland Model United Nations 2026. Position, law, capabilities and sources, all on one disk.
      </p>
      <div className="hero-actions">
        <a className="btn btn--primary" href="/position/">Read the Position Paper</a>
        <a className="btn btn--hero-ghost" href="/iran/">Iran Delegation</a>
        <a className="btn btn--hero-ghost" href="/data/">Data &amp; Statistics</a>
      </div>
      <div className="hero-meta">
        <div><span>Committee</span><strong>DISEC</strong></div>
        <div><span>Agenda</span><strong>LAWS &amp; Military AI</strong></div>
        <div><span>Conference</span><strong>Motherland MUN 2026</strong></div>
        <div><span>Mode</span><strong>100% offline</strong></div>
      </div>
    </section>
  );
}

const chips = [
  'Iran factbook — every exact figure',
  'Full weapons & equipment inventory',
  'NATO full data dossier',
  'UN voting record & coalition math',
  'Allies, organizations & the Axis of Resistance',
  '84+ primary sources offline',
  'Live news via local proxy',
];

function WhatsNew() {
  return (
    <>
      <h2>What's new</h2>
      <div className="stat-chips">
        {chips.map((c, idx) => (
          <span key={idx} className="stat-chip">{c}</span>
        ))}
      </div>
    </>
  );
}

function SkeletonScreen() {
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFade(true), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`sk-screen${fade ? ' fade-out' : ''}`} aria-hidden="true">
      <div className="sk-screen-card">
        <div className="sk-screen-line t" />
        <div className="sk-screen-line s" />
        <div className="sk-screen-line x" />
        <div className="sk-screen-line s" />
        <div className="sk-screen-line x" />
      </div>
    </div>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 380);
    return () => clearTimeout(t);
  }, []);
  return (
    <Layout
      title={siteConfig.title}
      description={siteConfig.tagline}>
      {!booted && <SkeletonScreen />}
      <main className="container">
        <Hero />
        <IranDash />
        <HomepageFeatures />
        <WhatsNew />
      </main>
    </Layout>
  );
}
