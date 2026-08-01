import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const cards = [
  {
    tag: 'Position',
    title: 'Position Paper',
    desc: "Iran's official statement on LAWS & military AI — core stance, principles and recommendations.",
    to: '/position/',
  },
  {
    tag: 'Position',
    title: 'Strategy & Resolutions',
    desc: 'Negotiation plan, talking points and sample draft resolutions aligned with Iranian positions.',
    to: '/position/strategy/',
  },
  {
    tag: 'Delegation',
    title: 'Iran Profile',
    desc: 'Country facts, military capabilities, autonomous systems, alliances and counter-arguments.',
    to: '/iran/',
  },
  {
    tag: 'Committee',
    title: 'Committee & Study Guide',
    desc: 'Rules of procedure, country matrix, chair notice and the full committee study guide.',
    to: '/committee/',
  },
  {
    tag: 'Law',
    title: 'Treaties & Frameworks',
    desc: 'The legal architecture: CCW, NPT, Geneva Conventions, ATT and international AI frameworks.',
    to: '/resources/treaties/',
  },
  {
    tag: 'Reference',
    title: 'Key Terms',
    desc: 'Essential vocabulary for debates, resolutions and the study guide.',
    to: '/resources/key-terms/',
  },
  {
    tag: 'Data',
    title: 'Data & Statistics',
    desc: 'Demographics, HDI, GDP, poverty & income, internet, military hardware, nuclear states, landmines and the full history of Iran.',
    to: '/data/',
  },
  {
    tag: 'Library',
    title: 'Source Documents',
    desc: 'Every downloaded primary source — UN resolutions, GGE reports, treaties, think-tank PDFs.',
    to: '/references/',
  },
  {
    tag: 'Press',
    title: 'News & Live Feed',
    desc: 'Offline news archive and an optional live headline feed via a local proxy.',
    to: '/news',
  },
];

function Card({tag, title, desc, to}) {
  return (
    <Link className={clsx('card', styles.card)} to={to}>
      <span className="card-tag">{tag}</span>
      <span className="card-title">{title}</span>
      <span className="card-desc">{desc}</span>
      <span className="card-link">Open dossier →</span>
    </Link>
  );
}

export default function HomepageCards() {
  return (
    <div className="card-grid">
      {cards.map((c, idx) => (
        <Card key={idx} {...c} />
      ))}
    </div>
  );
}
