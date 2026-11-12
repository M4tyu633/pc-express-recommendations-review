import { readFileSync } from "node:fs";
import { renderPlacements } from "./public/preview/cards.js";
import { initialPlacements } from "./preview-api.ts";
import { previewCatalog } from "./preview-catalog.ts";

const assetsDirectory = new URL("./public/preview/", import.meta.url);
const page = readFileSync(new URL("index.html", assetsDirectory), "utf8")
  .replace("<!-- PREVIEW_FALLBACK -->", () => renderPlacements(
    "home", initialPlacements(), new Map(previewCatalog.map(product => [product.id, product])),
  ));

export const previewPage = page;

export const previewAssets = new Map([
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
]);
