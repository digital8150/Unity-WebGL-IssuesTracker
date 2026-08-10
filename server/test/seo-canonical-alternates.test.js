import test from 'node:test';
import assert from 'node:assert/strict';
import { alternateSet, pageUrl } from '../src/routes/seo.js';
import { SEO_PAGE_ROUTES } from '../src/routes/seoRoutes.config.js';

// Google discards an hreflang cluster whose members do not point at each page's
// own canonical URL. Canonical and alternate hrefs are built by two different
// helpers, so nothing but this test stops them from drifting apart — which is
// exactly what happened on `/`, where `absoluteUrl('/')` appended a trailing
// slash while the alternate set and sitemap emitted a bare origin.
const SITE_ORIGIN = 'https://example.test';
const LOCALES = ['ko', 'en'];

test('every localized route canonical matches its own hreflang alternate', () => {
  const localized = SEO_PAGE_ROUTES.filter((route) => route.localized);
  assert.ok(localized.length > 0, 'expected at least one localized SEO route');

  for (const route of localized) {
    for (const locale of LOCALES) {
      const canonical = pageUrl(SITE_ORIGIN, route.path, locale);
      const alternates = alternateSet(SITE_ORIGIN, route.path, locale, {
        publishEnabled: true,
        // Static pages advertise alternates unconditionally; dynamic ones are
        // covered by the listReady flag so this stays a pure URL-shape check.
        listReady: true,
      });

      assert.ok(alternates, `${route.path} (${locale}) emitted no alternates`);
      const own = alternates.find((entry) => entry.hreflang === locale);
      assert.ok(own, `${route.path} (${locale}) has no self-referential hreflang`);
      assert.equal(
        own.href,
        canonical,
        `${route.path} (${locale}): canonical ${canonical} != hreflang ${own.href}`,
      );
    }
  }
});

test('alternate hrefs never carry a trailing slash on the origin', () => {
  const alternates = alternateSet(SITE_ORIGIN, '/', 'ko', { publishEnabled: true });
  assert.deepEqual(alternates.map((entry) => entry.href), [
    SITE_ORIGIN,
    `${SITE_ORIGIN}/en`,
    SITE_ORIGIN,
  ]);
  assert.equal(pageUrl(SITE_ORIGIN, '/', 'ko'), SITE_ORIGIN);
  assert.equal(pageUrl(SITE_ORIGIN, '/', 'en'), `${SITE_ORIGIN}/en`);
});

test('alternates stay suppressed while the publish gate is closed', () => {
  for (const route of SEO_PAGE_ROUTES.filter((entry) => entry.localized)) {
    for (const locale of LOCALES) {
      assert.equal(
        alternateSet(SITE_ORIGIN, route.path, locale, { publishEnabled: false, listReady: true }),
        null,
        `${route.path} (${locale}) leaked alternates with publishEnabled off`,
      );
    }
  }
});
