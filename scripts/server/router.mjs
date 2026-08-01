/**
 * Minimal HTTP router with middleware pipeline.
 *
 *   const app = createRouter();
 *   app.use((req, res, next) => next());
 *   app.get('/api/health', handler);
 *   app.get(/^\/downloads\/.+\.pdf$/, pdfHandler);
 *   app.serveStatic(...); // terminal handler
 *
 * Handlers receive (req, res, next). Call next() to pass through, or end
 * the response directly. Route matching supports exact strings and RegExps.
 */
export function createRouter() {
  const middlewares = [];
  const routes = [];

  function use(fn) { middlewares.push(fn); return api; }
  function get(pattern, ...handlers) { routes.push({ method: 'GET', pattern, handlers: handlers.flat() }); return api; }
  function head(pattern, ...handlers) { routes.push({ method: 'HEAD', pattern, handlers: handlers.flat() }); return api; }
  function post(pattern, ...handlers) { routes.push({ method: 'POST', pattern, handlers: handlers.flat() }); return api; }

  function match(method, pathname) {
    for (const r of routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      if (r.pattern instanceof RegExp) {
        if (r.pattern.test(pathname)) return r;
      } else if (r.pattern === pathname) {
        return r;
      }
    }
    return null;
  }

  // Run the full pipeline. `final` is the terminal handler if nothing matches.
  function dispatch(req, res, final = (r) => r.notFound(res)) {
    req.app = api;
    // Ensure pathname is available before route matching (middleware may not
    // have run yet).
    if (req.pathname === undefined) {
      try {
        const u = new URL(req.url, 'http://localhost');
        req.pathname = decodeURIComponent(u.pathname);
        req.query = u.searchParams;
      } catch {
        req.pathname = req.url.split('?')[0];
        req.query = new URLSearchParams();
      }
    }
    const chain = [...middlewares];
    const route = match(req.method, req.pathname);
    if (route) chain.push(...route.handlers);
    else chain.push(final);

    let i = 0;
    let ended = false;
    const next = () => {
      if (ended) return;
      const fn = chain[i++];
      if (!fn) return;
      try {
        fn(req, res, next);
      } catch (err) {
        if (ended) return;
        ended = true;
        req.app.onError(err, req, res);
      }
    };
    // Mark completion so later middleware can't run after response ends.
    res.once('finish', () => { ended = true; });
    next();
  }

  function handle(req, res) {
    dispatch(req, res);
  }

  const api = { use, get, head, post, handle, dispatch, routes, middlewares };
  return api;
}
