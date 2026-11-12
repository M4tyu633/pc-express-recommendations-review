import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import { renderPlacements } from "./public/preview/cards.js";
import { initialPlacements, previewBootstrap, sampleShoppers } from "./preview-api.ts";
import { previewCatalog } from "./preview-catalog.ts";
import { storefront } from "./pcx-storefront-data.ts";

const assetsDirectory = new URL("./public/preview/", import.meta.url);
const theme = new URL("./storefront-theme/", import.meta.url);
const engine = new Liquid({ root: fileURLToPath(new URL("snippets/", theme)), extname: ".liquid" });
engine.registerFilter("asset_url", (filename: string) => "/pcx-assets/" + encodeURIComponent(filename));
engine.registerFilter("money", (cents: number) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP",
}).format(cents / 100));
const renderCard = (product: object, detail: string) =>
  engine.renderFileSync("pcx-product-card", { product, detail, actions: false });
const page = engine.parseAndRenderSync(readFileSync(new URL("layout/preview.liquid", theme), "utf8"), {
  logo: storefront.logo,
  slides: storefront.slides,
  categories: storefront.categories,
  sampleShoppers,
  products: previewCatalog.filter(product => product.published),
  operations: existsSync(new URL("operations.html", assetsDirectory)),
  bootstrap: JSON.stringify(previewBootstrap()).replace(/</g, "\\u003c"),
  recommendations: renderPlacements(
    "home", initialPlacements(), new Map(previewCatalog.map(product => [product.id, product])),
    new Set(), false, renderCard,
  ),
});

export const previewPage = page;

export const previewAssets = new Map<string, { contentType: string; body: string | Buffer }>([
  ["/preview", { contentType: "text/html; charset=utf-8", body: page }],
  ["/preview.css", {
    contentType: "text/css; charset=utf-8",
    body: readFileSync(new URL("preview.css", assetsDirectory), "utf8"),
  }],
  ["/preview.js", {
    contentType: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("preview.js", assetsDirectory), "utf8"),
  }],
  ["/cards.js", {
    contentType: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("cards.js", assetsDirectory), "utf8"),
  }],
  ...Object.entries({
    "operations.html": "text/html",
    "operations.css": "text/css",
    "operations.js": "text/javascript",
    "operations-data.js": "text/javascript",
    "pcx-storefront.css": "text/css",
    "pcx-carousel.js": "text/javascript",
  }).filter(([filename]) => existsSync(new URL(filename, assetsDirectory))).map(([filename, type]) => [
    "/" + filename, {
      contentType: type + "; charset=utf-8",
      body: readFileSync(new URL(filename, assetsDirectory), "utf8"),
    },
  ] as const),
  ...readdirSync(new URL("assets/", theme)).map(filename => [
    "/pcx-assets/" + filename,
    {
      contentType: filename.endsWith(".png") ? "image/png" : "image/jpeg",
      body: readFileSync(new URL("assets/" + filename, theme)),
    },
  ] as const),
]);
