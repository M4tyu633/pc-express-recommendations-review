import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { after, before, test } from "node:test";
import type { RecommendationResult } from "./engine.ts";
import { createRecommendationServer } from "./server.ts";

const server = createRecommendationServer();
let origin: string;
const emptyInput = { personalizationAllowed: true, events: [], cartProductIds: [] };

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

function postRanking(body: unknown) {
  return fetch(origin + "/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("the ranking API uses recent activity and server catalog eligibility", async () => {
  const response = await postRanking({
    ...emptyInput,
    events: [{
      id: "gpu-cart",
      type: "product_added_to_cart",
      productId: "gpu-mid",
      occurredAtMs: Date.now() - 1000,
    }],
    cartProductIds: ["gpu-mid"],
    catalog: [{ id: "injected-product" }],
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result: RecommendationResult = await response.json();
  assert.equal(result.mode, "personalized");
  assert.deepEqual(result.items.map((item) => item.productId), ["gpu-compact", "gpu-premium"]);
});

test("the ranking API honors opt-out and keeps each request independent", async () => {
  const response = await postRanking({
    ...emptyInput,
    personalizationAllowed: false,
    events: [{
      id: "headset-view",
      type: "product_viewed",
      productId: "audio-usb",
      occurredAtMs: Date.now() - 1000,
    }],
    cartProductIds: ["mouse"],
  });
  assert.equal(response.status, 200);
  const declined: RecommendationResult = await response.json();
  assert.equal(declined.mode, "bestsellers");
  assert(!declined.items.some((item) => item.productId === "mouse"));

  const freshResponse = await postRanking(emptyInput);
  assert.equal(freshResponse.status, 200);
  const fresh: RecommendationResult = await freshResponse.json();
  assert.equal(fresh.mode, "bestsellers");
  assert.equal(fresh.items[0].productId, "mouse");
});

test("the ranking API rejects invalid payloads and unsupported media types", async () => {
  const badEvent = {
    id: "invalid",
    type: "checkout",
    productId: "gpu-mid",
    occurredAtMs: Date.now(),
  };
  const invalid = await postRanking({ ...emptyInput, events: [badEvent] });
  assert.equal(invalid.status, 400);
  const tooMany = await postRanking({ ...emptyInput, cartProductIds: Array(51).fill("mouse") });
  assert.equal(tooMany.status, 400);

  const malformed = await fetch(origin + "/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);

  const plainText = await fetch(origin + "/api/recommendations", {
    method: "POST",
    body: "{}",
  });
  assert.equal(plainText.status, 415);
});

test("the ranking API rejects oversized bodies with or without a declared length", async () => {
  const oversized = await postRanking({ padding: "x".repeat(33 * 1024) });
  assert.equal(oversized.status, 413);

  const status = await new Promise<number | undefined>((resolve, reject) => {
    const upload = request(origin + "/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    upload.once("error", reject);
    upload.write("x".repeat(20 * 1024));
    upload.end("x".repeat(20 * 1024));
  });
  assert.equal(status, 413);
});

test("the demo catalog exposes display fields and the API enforces route methods", async () => {
  const catalogResponse = await fetch(origin + "/api/catalog");
  assert.equal(catalogResponse.status, 200);
  const items = await catalogResponse.json();
  assert.deepEqual(Object.keys(items[0]).sort(), ["category", "id", "inStock", "name", "pricePhp"]);

  const wrongMethod = await fetch(origin + "/api/recommendations");
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");
});

test("the homepage includes a stock-aware fallback before JavaScript runs", async () => {
  const homepage = await fetch(origin);
  assert.equal(homepage.status, 200);
  assert.match(homepage.headers.get("content-type") ?? "", /^text\/html/);
  const html = await homepage.text();
  assert.match(html, /<h2 id="recommendation-heading">Bestsellers<\/h2>/);
  assert.deepEqual(
    [...html.matchAll(/data-product-id="([^"]+)"/g)].map((match) => match[1]),
    ["mouse", "audio-usb", "keyboard", "audio-stereo"],
  );
  assert.equal((await fetch(origin + "/demo.js")).status, 200);
  assert.equal((await fetch(origin + "/demo.css")).status, 200);
});
