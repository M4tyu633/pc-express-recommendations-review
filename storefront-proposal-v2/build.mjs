import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile, cp } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { previewCatalog } from "./catalog/preview-catalog.ts";
import { storefront } from "./catalog/pcx-storefront-data.ts";
import { demoParts, partCategories } from "./pc-parts.mjs";

const source = new URL("../", import.meta.url);
const output = new URL("./dist/", import.meta.url);
const catalog = [...previewCatalog.filter(product => product.published), ...demoParts];
const slides = storefront.slides;
await mkdir(new URL("pcx-assets/", output), { recursive: true });
const assets = new Set([
  storefront.logo,
  ...catalog.map(product => product.image),
  ...slides.flatMap(slide => [slide.desktop, slide.mobile]),
]);
await Promise.all([...assets].map(name => {
  const demoAsset = new URL("product-assets/" + name, import.meta.url);
  const asset = existsSync(demoAsset) ? demoAsset : new URL("storefront-theme/assets/" + name, source);
  return copyFile(asset, new URL("pcx-assets/" + name, output));
}));
for (const file of ["index.html", "shop.js", "proposal.css", "v2.css", "landing.css", "vercel.json"]) {
  await copyFile(new URL(file, import.meta.url), new URL(file, output));
}
for (const file of ["preview.css", "pcx-storefront.css", "pcx-carousel.js", "cards.js"]) {
  await copyFile(new URL("public/preview/" + file, source), new URL(file, output));
}
const carouselPath = new URL("pcx-carousel.js", output);
const carousel = await readFile(carouselPath, "utf8");
await writeFile(carouselPath, carousel.replace(
  /  setInterval\(\(\) => \{[\s\S]+?  \}, 5000\);/,
  "  return () => resize.disconnect();",
));
await cp(new URL("partner-assets/", import.meta.url), new URL("partner-assets/", output), { recursive: true });
await cp(new URL("icons/", import.meta.url), new URL("icons/", output), { recursive: true });
// Compile the same ranking sources for the browser, even on a clean checkout.
await mkdir(new URL("ranking/", output), { recursive: true });
for (const [name, path] of [["engine", "../engine.ts"], ["placement-engine", "./catalog/placement-engine.ts"]]) {
  const ts = await readFile(new URL(path, import.meta.url), "utf8");
  const js = stripTypeScriptTypes(ts).replace('from "../../engine.ts"', 'from "./engine.js"');
  await writeFile(new URL("ranking/" + name + ".js", output), js);
}
await writeFile(new URL("catalog.js", output), "export const data = " + JSON.stringify({ catalog, slides, partCategories }) + ";\n");
const verification = await readFile(new URL("index.html", output), "utf8");
if (!verification.includes('id="shop-content"')) throw new Error("Missing storefront entry point");
console.log("Built storefront proposal v2 with " + catalog.length + " products and " + assets.size + " reused images.");
