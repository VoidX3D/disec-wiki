import {useEffect, useRef} from 'react';
import '@pagefind/default-ui/css/ui.css';

// Algolia-style search, fully open source and offline: Pagefind.
// Indexes the static build at `npm run build` time (see package.json).
export default function SearchBar() {
  const container = useRef(null);

  useEffect(() => {
    let ui = null;
    let cancelled = false;

    async function init() {
      if (cancelled || !container.current) return;
      const {PagefindUI} = await import('@pagefind/default-ui');
      if (cancelled || !container.current) return;
      ui = new PagefindUI({
        element: container.current,
        showSubResults: true,
        showImages: false,
        resetStyles: false,
        baseUrl: '/',
        translations: {
          placeholder: 'Search the wiki…',
          zero_results: 'No results — try a broader term.',
          many_results: 'results found',
          one_result: 'result found',
        },
      });
    }

    init();

    return () => {
      cancelled = true;
      if (ui && typeof ui.destroy === 'function') ui.destroy();
    };
  }, []);

  return <div ref={container} className="pf-search" data-pagefind-ignore />;
}
