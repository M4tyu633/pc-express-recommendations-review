import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { previewAssets, previewPage } from "./preview-page.ts";

const output = new URL("./dist/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("index.html", output), previewPage);
for (const [path, asset] of previewAssets) {
  if (path === "/preview") continue;
  const file = fileURLToPath(new URL(path.slice(1), output));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, asset.body);
}
console.log("Built the disconnected storefront preview in dist.");
