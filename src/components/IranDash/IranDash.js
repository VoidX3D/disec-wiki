import Link from '@docusaurus/Link';
import Icon from '../Icon';
import styles from './IranDash.module.css';

const stats = [
  { icon: 'people', value: '92.4M', label: 'Population (2025)', tag: 'Demographics' },
  { icon: 'dollar', value: '$475B', label: 'Nominal GDP (2024)', tag: 'Economy' },
  { icon: 'chart', value: '0.799', label: 'HDI · rank 75/193', tag: 'Development' },
  { icon: 'shield', value: '610K', label: 'Active military', tag: 'Defence' },
  { icon: 'energy', value: '208.6B bbl', label: 'Proven oil reserves · 3rd', tag: 'Energy' },
  { icon: 'wifi', value: '79.6%', label: 'Internet penetration', tag: 'Digital' },
  { icon: 'finance', value: '36.9%', label: 'Oil & gas share of revenue', tag: 'Finance' },
  { icon: 'rank', value: '#17', label: 'Global Firepower rank', tag: 'Military' },
];

const allies = [
  { name: 'Russia', img: '/img/flags/ru.svg' },
  { name: 'China', img: '/img/flags/cn.svg' },
  { name: 'Syria', img: '/img/flags/sy.svg' },
  { name: 'Venezuela', img: '/img/flags/ve.svg' },
  { name: 'North Korea', img: '/img/flags/kp.svg' },
  { name: 'Cuba', img: '/img/flags/cu.svg' },
];

const hostile = [
  { name: 'United States', img: '/img/flags/us.svg' },
  { name: 'Israel', img: '/img/flags/il.svg' },
  { name: 'Saudi Arabia', img: '/img/flags/sa.svg' },
];

export default function IranDash() {
  return (
    <section>
      <h2>Iran at a glance</h2>
      <div className="iran-dash">
        <div className="iran-id">
          <div className="flags">
            <img src="/img/iran.png" alt="Flag of Iran" />
            <img src="/img/coat_Of_ARMS.jpg" alt="Coat of Arms of Iran" />
          </div>
          <h3>Islamic Republic of Iran</h3>
          <div className="sub">
            UNGA First Committee (DISEC) — Motherland MUN 2026 ·{' '}
            <strong>Regulating LAWS &amp; Military AI</strong>
          </div>
          <div className="kvs">
            <div className="kv"><span>Capital</span><strong>Tehran</strong></div>
            <div className="kv"><span>UNSC seat</span><strong>2025–2026</strong></div>
            <div className="kv"><span>NPT status</span><strong>Non-nuclear state</strong></div>
            <div className="kv"><span>Bloc</span><strong>NAM · BRICS · SCO</strong></div>
          </div>
        </div>
        <div className="iran-stats">
          {stats.map((s) => (
            <div className="iran-stat" key={s.label}>
              <span className="ic"><Icon name={s.icon} size={14} /></span>
              <span className="v">{s.value}</span>
              <span className="l">{s.label}</span>
              <span className="t">{s.tag}</span>
            </div>
          ))}
        </div>
      </div>

      <h2>Partners &amp; adversaries</h2>
      <div className="ally-strip">
        {allies.map((a) => (
          <Link className="ally-pill" key={a.name} to="/data/alliances/">
            <img src={a.img} alt="" loading="lazy" />
            {a.name}
          </Link>
        ))}
        {hostile.map((a) => (
          <Link className="ally-pill ally-hostile" key={a.name} to="/data/alliances/">
            <img src={a.img} alt="" loading="lazy" />
            {a.name}
          </Link>
        ))}
      </div>

      <div className="btn-row">
        <Link className="btn btn--primary" to="/data/">Open Data &amp; Statistics</Link>
        <Link className="btn btn--secondary" to="/data/factbook/">Iran Factbook</Link>
        <Link className="btn btn--secondary" to="/data/nato/">NATO Dossier</Link>
      </div>
    </section>
  );
}
