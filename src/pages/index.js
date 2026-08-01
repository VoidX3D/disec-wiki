import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

function Hero() {
  return (
    <section className="hero">
      <div className="hero-flag">United Nations · General Assembly · First Committee (DISEC)</div>
      <h1>Regulating Lethal Autonomous Weapons Systems &amp; Military AI</h1>
      <p className="hero-sub">
        Full offline research hub for the delegation of the <strong>Islamic Republic of Iran</strong> —
        Motherland Model United Nations 2026. Position, law, capabilities and sources, all on one disk.
      </p>
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
  'Fullscreen diplomatic design',
  '84+ primary sources offline',
  'UN resolutions & GGE reports',
  'Complete Iran biography',
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

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description={siteConfig.tagline}>
      <main className="container">
        <Hero />
        <HomepageFeatures />
        <WhatsNew />
      </main>
    </Layout>
  );
}
