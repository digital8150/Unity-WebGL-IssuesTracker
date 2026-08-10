# Apache /en reverse-proxy contract

The English SEO routes depend on Apache forwarding the original URI to Node.
This repository does not own the production Apache configuration, so deploy
the equivalent of the following rules in the vhost, before the SPA fallback:

```apache
# Keep the /en prefix. Do not rewrite /en/blog to /blog before proxying.
# This example proxies the SEO route shapes only, so the catch-all below is
# still reachable for an unknown /en/* client route.
RewriteEngine On
RewriteRule ^(/en/?|/en/(?:arcade|privacy(?:/\d{4}-\d{2}-\d{2})?|blog(?:/[^/]+)?|play/[^/]+(?:/articles(?:/[^/]+)?|/[^/]+)?)/?)$ http://127.0.0.1:4000$1 [P,L,NE]

# The remaining /en shell is deliberately noindex. Serve the built shell
# without changing the browser URL; its inline prepaint metadata is fail-closed.
RewriteRule ^/en(?:/.*)?$ /web/dist/index.html [END]
```

Use the production path for web/dist/index.html (the example assumes that
Apache can read the repository's web/dist directory). If the Node proxy
uses a separate upstream vhost, keep the same URI-preserving behavior there.
The important invariant is that a request for /en/blog reaches Node with
req.originalUrl === "/en/blog"; stripping the prefix silently disables SSR
bootstrap hydration and falls back to a client fetch.

The proxy rules must be ordered ahead of the generic React SPA fallback. Keep
the route-shape expression synchronized with
`server/src/routes/seoRoutes.config.js`; it intentionally excludes `/en/play`
and other non-SEO client routes. If the production vhost uses a separate
proxy include, the same two-stage ordering is required there: known SEO
shapes to Node, then the unmatched `/en/*` catch-all to `web/dist/index.html`.

Smoke checks after deployment:

```sh
curl -i https://arcade.codingbot.kr/en
curl -i https://arcade.codingbot.kr/en/blog
```

The first response should contain lang="en" and noindex,follow. The
server-side log for /en/blog must still show the /en prefix.
