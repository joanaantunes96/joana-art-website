# Square Online purchases

Available Works uses Catalog and Inventory server-side. The portfolio and homepage
remain local artwork data. `SQUARE_ACCESS_TOKEN` must be set securely in Vercel's
Preview/Production environments; never use a PUBLIC_ variable.

`src/data/squareOnline.ts` contains the one-time published site ID and shipping
inventory location ID. Confirm this location in Square Online's shipping settings
before approving production. There is no per-item mapping. If the fulfilment
location or website changes, update this configuration once.

New paintings must be published and visible on that Square Online website, have
shipping enabled and the appropriate shipping profile, and have positive tracked
inventory at the configured location. Optional existing category environment filters
still apply. Square handles all payments, shipping calculations and final stock checks.

Product links are read from the site's sitemap, including same-origin sitemap
indexes, matched against exact catalogue item IDs, and checked for a successful HTML
response without redirects. Duplicate, foreign or malformed destinations are rejected.
Sitemap publication may lag. This is not a guaranteed Square API URL contract:
route changes, hidden/no-index products and storefront failures can prevent discovery.
HTTP success alone cannot prove checkout eligibility; Square checks that at checkout.
When discovery fails, the artwork remains enquiry-only. API/inventory failures show
an availability error, never a purchase link or stale stock.

Stock is fetched without cache on every Available Works request and again at the
Buy Original redirect. Returning via browser history refreshes the page. Already-open
pages do not live-update; reload to remove sold items. No reservation is made by this
website. Test Square's stock enforcement with two browser sessions before production.

Run `node tests/square-online.mjs` and `npm run build`. In preview, check Unknown
Soldier, follow Buy Original to Square, check shipping destinations/rates, then test
the approved real purchase. After Square updates inventory to zero, refresh Available
Works and check that an old purchase URL falls back to enquiry. Do not perform the
real purchase as part of automated tests. Restore the intended price after testing.
