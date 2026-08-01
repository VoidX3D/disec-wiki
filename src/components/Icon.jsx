import React from 'react';

// Inline SVG icon set. 24x24 viewBox, stroke-based (Lucide-style), fills currentColor.
// Usage: <Icon name="people" size={16} /> or <Icon name="arrow" />
const paths = {
  people: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  dollar: (
    <>
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  chart: (
    <>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  energy: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" />
    </>
  ),
  finance: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
      <path d="M9 17h.01M15 17h.01" />
    </>
  ),
  rank: <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8L12 2z" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  flag: (
    <>
      <path d="M4 22V4s2-1.5 4-1.5S12 4 14 4s4-1.5 4-1.5v10S16 14 14 14s-4-1.5-6-1.5S4 14 4 14" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18" />
      <path d="M8 21h8" />
      <path d="M4 7h16" />
      <path d="M6 7l-3 6a3 3 0 0 0 6 0L6 7z" />
      <path d="M18 7l-3 6a3 3 0 0 0 6 0l-3-6z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
    </>
  ),
  news: (
    <>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V9" />
      <path d="M6 6h10v6H6z" />
      <path d="M4 22h16" />
    </>
  ),
  term: (
    <>
      <path d="M4 20h16" />
      <path d="M6 20V6l8-3v17" />
      <path d="M6 20l8-3" />
      <path d="M18 17V8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
};

const Icon = ({ name, size = 16, className = '', style }) => {
  const child = paths[name];
  if (!child) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {child}
    </svg>
  );
};

export default Icon;
