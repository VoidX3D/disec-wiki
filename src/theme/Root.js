import {useEffect, useState} from 'react';
import {useLocation} from '@docusaurus/router';
import {Analytics} from '@vercel/analytics/react';

// Global skeleton loading overlay. Fades in briefly on every route change so
// navigation never feels unresponsive, then fades out once the page settles.
export default function Root({children}) {
  const [navigating, setNavigating] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let t1;
    let t2;
    const key = location.pathname + location.search + location.hash;

    t1 = setTimeout(() => setNavigating(true), 120);
    t2 = setTimeout(() => setNavigating(false), 320);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [location]);

  return (
    <>
      {navigating && (
        <div className="sk-screen" aria-hidden="true">
          <div className="sk-screen-card">
            <div className="sk-screen-line t" />
            <div className="sk-screen-line s" />
            <div className="sk-screen-line x" />
          </div>
        </div>
      )}
      {children}
      <Analytics />
    </>
  );
}
