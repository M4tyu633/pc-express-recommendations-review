# PC Express storefront personalization preview

Run `npm ci` and `npm start` with Node.js 24, then open [the storefront preview](http://127.0.0.1:4173/preview). It uses a snapshot of public PC Express products and supports Home, Product, Search results and Cart. Turn on personalization and choose Graphics cards or Headsets in the browsing controls. The homepage recommends products based on the simulated activity. Turn personalization off to clear browsing history.

The page renders from Shopify-style Liquid layout and snippet files under `storefront-theme/`. It uses the real PC Express logo, campaign banner, category artwork and product photos. The source list is in `storefront-theme/assets-source.json`. The preview uses LiquidJS to render those files on Vercel, with simulated inventory, popularity, cart and consent. Checkout and tracking are disconnected.

After opting in, use the sample browsing buttons to replay a graphics-card or headset view. Each replay replaces the demo browsing history and keeps the current cart.

The preview reuses the twelve observed storefront placement IDs (`home_recommendations_1` to `_3`, with corresponding `pdp`, `srp` and `cart` prefixes) and adapts the theme's card pattern. Home shows session recommendations and top sellers. Product pages use sample co-purchases and similar items. Search shows relevant sample products, and Cart shows curated pairings and top sellers. Empty slots are hidden. Products that are sold out, unpublished, already in the cart or the currently viewed product are excluded where applicable.

The page loads its fixtures and recommendations from `/api/preview` on its own origin. Anonymous fallback cards are built into the page, and a short deadline protects the UI when the API fails. Event history lives in the current page and is sent only with the demo's personalization switch on. The API validates and limits requests, builds its catalog and search indexes once per instance, scores price-near candidates for the strongest categories, and keeps personalized responses out of caches.

Run `npm test` for the engine and API checks. Run `npm run build` to generate the static preview in `dist/`. On an approved Vercel team, use a separate protected Preview deployment of this repo. `vercel.json` sets the build and output directory, `api/preview.ts` is the Node.js function, and the hosted preview opens at `/`. The preview needs no environment variables, store credentials, vendor scripts or production domain. [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [deployment protection](https://vercel.com/docs/deployment-protection)

The next production-facing proof would use a separately approved Shopify test store. It needs authenticated catalog sync, purpose-specific consent, a fresh inventory check and exposure tracking before a same-placement experiment. The preview demonstrates the ranking and UX with fixtures.

## Original one-row demo

The draft implements the product ranking for one proposed homepage row. It runs locally against a fictional catalog and fictional shopper events. The ranking function receives normalized store data and returns an ordered list of product IDs, display names for the demo, and a reason for each pick.

## Run the browser demo

Use Node.js 24.2 or later. Run `npm start` from this folder and open [http://127.0.0.1:4173](http://127.0.0.1:4173). The app uses local fixtures and has no package dependencies to install.

1. Open the page to see in-stock bestsellers.
2. Check **Allow personalization** and select **View** on **Midrange graphics card**. The recommendation row switches to graphics cards.
3. Add that graphics card to the cart. The row keeps the two available alternatives and drops the cart item.
4. Select **Reset demo**, allow personalization again and view **Wired USB headset**. The row now shows headsets.
5. Turn personalization off. The demo clears browsing activity and returns to bestsellers.

The server renders the initial bestseller cards. The browser keeps eligible cards from that list visible when the recommendation request times out or fails. The cart and browsing history exist only in the current page. Refreshing clears them.

## Command-line demo and tests

```powershell
npm run demo
npm test
```

- A graphics card shopper gets other in-stock graphics cards. The card already in the cart and the sold-out card are excluded.
- A headset shopper sees headsets near the prices they browsed, with the more expensive option later in the row.
- A first-time shopper or a shopper who declines personalization gets default in-stock picks ordered by recent paid orders.

## Local HTTP API

Run `npm start` and use `http://127.0.0.1:4173`. The server listens only on loopback. Set `PCX_PORT` to use another port.

- `GET /api/catalog` returns the fictional product catalog's display fields.
- `POST /api/recommendations` accepts JSON containing `personalizationAllowed`, `events` and `cartProductIds`. Events contain `id`, `type`, `productId` and `occurredAtMs` in Unix milliseconds. The server supplies its own time and catalog.

```json
{
  "personalizationAllowed": false,
  "events": [],
  "cartProductIds": ["mouse"]
}
```

That request returns the bestseller fallback excluding the mouse already in the cart. Responses are marked `no-store`. The API keeps no request history. The permission flag and event history in this demo are simulated inputs. A Shopify integration needs the consent and profile checks described below.

## How the first version ranks

1. Index the catalog by product ID and exclude unavailable products, products without a valid positive price, and products already in the cart.
2. Where personalization is allowed, consider up to 14 days of activity. Within that window, keep the most recent view and the most recent cart addition per product. Give a cart addition three times the weight of a view of the same age. Halve each event's weight every three days.
3. Group activity by product category. Use the total weight to score category interest, then favor products closer to that category's weighted average browsed price. Break ties using paid orders over the last 30 days and then product ID.
4. Return up to four eligible matches. When there are no eligible personalized matches, use the default list. In a Shopify theme, render the default collection first and retain it if the personalized API times out.

The three-to-one weighting, recency window, and row size are starting assumptions for the demo. The fixtures are only for checking behavior. They do not estimate performance, sales, or the right weights for PC Express.

## Marketing choices

- **Shopping intent.** Use what a shopper recently browsed or put in the cart as a signal of what they are trying to buy. Product category determines the initial matches. Price proximity keeps alternatives within the general range the shopper explored. In a randomized retail field experiment, item recommendations helped shoppers find products with better fit. PC Express should test its own catalog and placements. [Wan, Kumar and Li field experiment](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.4951)
- **Merchandising for new visitors.** Use eligible bestsellers as a default. If paid-order history is too sparse or stale, use a merchandiser-selected Shopify collection. Refresh stock before displaying products and watch for the same products dominating exposure. The first row is deliberately small enough to skim.
- **Alternatives and cross-sells serve different decisions.** On the homepage, help the shopper pick a relevant product. Later on a product page or in the cart, suggest accessories that help use the chosen item. For PC hardware, require a curated pairing or verified specs before describing an accessory as compatible. Order history can identify candidate pairings, while specs determine whether they work together. [Baymard cart usability research](https://baymard.com/research-articles/product-recommendations-cart), [Shopify complementary products](https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations/complementary-products)
- **Merchandising control.** Once real catalog data is available, give staff control of the default collection and product exclusions. This would let them respond to a stock shortage or remove a stale listing without changing the algorithm. Netcore Unbxd already offers context, placement controls and reporting, so the case for replacement depends on cost, fit and measured results. [Unbxd recommendations overview](https://strapi.unbxd.com/recommendations/overview/)

## How it would connect to Shopify

- Review the supplied Shopify code **read-only**. Map the existing Unbxd widget and inspect theme support, catalog fields and available inventory and order signals. Use the Netcore placement settings and reports, if shared, to confirm what the first row needs to match.
- Put integration work in a separate PC Express app. Use TypeScript and Node.js for the API, PostgreSQL for normalized product and event data, and a Liquid theme app block if the theme supports it. Shopify remains the source of truth for product and stock data. Webhooks update the sync, with signature verification, deduplication and periodic reconciliation. [Shopify app templates](https://shopify.dev/docs/api/libraries-and-templates), [Shopify webhooks](https://shopify.dev/docs/apps/build/webhooks), [Theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration)
- Collect only the product ID, event ID, time and purpose-appropriate pseudonymous identifier through a consent-aware Shopify web pixel. The future adapter must validate input, separate browser and signed-in account histories, and handle opt-outs and expiry before sending normalized data to the ranker. The demo's permission flag exercises the branch inside the ranker. [Shopify standard events](https://shopify.dev/docs/api/web-pixels-api/standard-events), [Pixel privacy](https://shopify.dev/docs/api/web-pixels-api/pixel-privacy), [App proxy authentication](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies)
- Prove the widget in a test store first, including stock changes, cart exclusions, opt-outs, an API timeout, and mobile layout. The storefront should be able to render bestsellers even if the custom API is down.

## How to decide whether to replace Netcore

Compare the same homepage placement against Netcore with a stable, randomized visitor assignment. Use the same product cards and measure the same eligible population in both groups. Define a meaningful loss threshold, sample size, and decision date from current traffic and sales before starting.

- **Primary metric:** gross profit per eligible visitor when reliable margin data is available. Otherwise, revenue per eligible visitor.
- **Diagnostics:** impressions, recommendation clicks, add-to-cart rate, conversion, and purchase rate. Record fallback frequency, mobile page performance and recommendations for unavailable products.
- **Cost:** compare removable Netcore fees with the app's hosting, maintenance and support costs. Confirm the invoice split, since the contract may include workflows outside the recommendation engine. Estimate the effect of any measured change in gross profit before approving a cutover.

An offline check can prove the code follows the rules. The controlled storefront comparison is what can establish sales impact. [Microsoft research on controlled experiments](https://www.microsoft.com/en-us/research/publication/online-experimentation-at-microsoft/)
