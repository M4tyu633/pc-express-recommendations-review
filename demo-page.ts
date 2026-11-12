import { readFileSync } from "node:fs";
import { recommend } from "./engine.ts";
import { catalog } from "./fixtures.ts";

const prices = new Map(catalog.map(({ id, pricePhp }) => [id, pricePhp]));
const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const fallback = recommend({
  catalog,
  cartProductIds: [],
  events: [],
  nowMs: Date.now(),
  personalizationAllowed: false,
});

const bestsellerCards = fallback.items.map(({ productId, name, reason }) => {
  const price = prices.get(productId);
  if (price === undefined) return "";
  return `<li data-product-id="${escapeHtml(productId)}">
            <p class="product-name">${escapeHtml(name)}</p>
            <p>${escapeHtml(currency.format(price))}</p>
            <p class="product-detail">${escapeHtml(reason)}</p>
          </li>`;
}).join("\n");

const page = readFileSync(new URL("./public/index.html", import.meta.url), "utf8")
  .replace("<!-- BESTSELLERS -->", () => bestsellerCards);

export const demoAssets = new Map([
  ["/", { contentType: "text/html; charset=utf-8", body: page }],
  ["/demo.css", {
    contentType: "text/css; charset=utf-8",
    body: readFileSync(new URL("./public/demo.css", import.meta.url), "utf8"),
  }],
  ["/demo.js", {
    contentType: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("./public/demo.js", import.meta.url), "utf8"),
  }],
]);
