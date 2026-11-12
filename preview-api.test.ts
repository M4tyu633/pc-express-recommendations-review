import assert from "node:assert/strict";
import test from "node:test";
import vercelPreview from "./api/preview.ts";
import { previewPage } from "./preview-page.ts";

const url = "https://preview.example.invalid/api/preview";
const plain = { surface: "home", events: [], cartProductIds: [], personalizationAllowed: false };
const post = (body: unknown, headers: Record<string, string> = {}) => new Request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

test("Vercel entry returns public fixture catalog and private, independent session picks", async () => {
  const bootstrap = await vercelPreview.fetch(new Request(url));
  assert.equal(bootstrap.status, 200);
  const initial = await bootstrap.json();
  assert.ok(initial.catalog.length > 10);
  assert.ok(!initial.catalog.some((p: { id: string }) => p.id === "gpu-draft"));
  const now = Date.now();
  const request = {
    ...plain, personalizationAllowed: true,
    events: [{ id: "recent", type: "product_viewed", productId: "gpu-mid", occurredAtMs: now }],
  };
  const result = await vercelPreview.fetch(post(request));
  assert.match(result.headers.get("Cache-Control") ?? "", /no-store/);
  assert.equal((await result.json()).placements[0].title, "Recommended for you");
  const anonymous = await vercelPreview.fetch(post({ ...request, personalizationAllowed: false }));
  assert.equal((await anonymous.json()).placements[0].title, "Bestsellers");
});

test("preview API rejects bad contexts, cross-site requests and oversized payloads", async () => {
  assert.equal((await vercelPreview.fetch(post({ ...plain, surface: "unknown" }))).status, 400);
  assert.equal((await vercelPreview.fetch(post({ ...plain, query: "x".repeat(81) }))).status, 400);
  assert.equal((await vercelPreview.fetch(post(plain, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
  assert.equal((await vercelPreview.fetch(post({ ...plain, extra: "x".repeat(33_000) }))).status, 413);
  const method = await vercelPreview.fetch(new Request(url, { method: "PUT" }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "GET, POST");
});

test("staged HTML has no third-party resources and includes an anonymous row without JavaScript", () => {
  assert.match(previewPage, /id="home_recommendations_1"/);
  assert.match(previewPage, /Bestsellers/);
  assert.match(previewPage, /LOGITECH B175 USB Wireless Mouse/);
  assert.match(previewPage, /src="\/pcx-assets\/mouse\.jpg"/);
  assert.match(previewPage, /src="\/pcx-assets\/pcx-logo\.png"/);
  assert.doesNotMatch(previewPage, /(?:src|href|action)=["'](?:https?:)?\/\//i);
});
