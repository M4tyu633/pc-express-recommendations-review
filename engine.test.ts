import assert from "node:assert/strict";
import { test } from "node:test";
import { recommend, type RecommendationRequest, type ShopperEvent } from "./engine.ts";
import { catalog, gpuEvents, headsetEvents, nowMs } from "./fixtures.ts";

const defaults = {
  catalog,
  nowMs,
  personalizationAllowed: true,
  events: [],
  cartProductIds: [],
} satisfies RecommendationRequest;

function productIds(request: Partial<RecommendationRequest>) {
  return recommend({ ...defaults, ...request }).items.map((item) => item.productId);
}

test("different browsing histories produce different categories with closer prices first", () => {
  assert.deepEqual(productIds({ events: gpuEvents, cartProductIds: ["gpu-mid"] }),
    ["gpu-compact", "gpu-premium"]);
  assert.deepEqual(productIds({ events: headsetEvents }),
    ["audio-stereo", "audio-usb", "audio-wireless"]);
});

test("first visits and denied personalization use stock-aware bestsellers", () => {
  const expected = ["mouse", "audio-usb", "keyboard", "audio-stereo"];
  assert.deepEqual(productIds({}), expected);
  assert.deepEqual(productIds({ events: gpuEvents, personalizationAllowed: false }), expected);
});

test("retrying events or repeatedly viewing the same product does not inflate its rank", () => {
  const events = [...gpuEvents, ...headsetEvents];
  const repeatedView = { ...headsetEvents[0], id: "headset-reload" };
  assert.deepEqual(productIds({ events: [...events, ...events, repeatedView] }), productIds({ events }));
  assert.ok(productIds({ events })[0].startsWith("gpu-"));
});

test("stale and future-dated activity do not personalize the row", () => {
  const events = [
    { ...gpuEvents[0], occurredAtMs: nowMs - 20 * 24 * 60 * 60 * 1000 },
    { ...headsetEvents[0], occurredAtMs: nowMs + 1000 },
  ] satisfies ShopperEvent[];
  assert.deepEqual(productIds({ events }), productIds({}));
});

test("a fresh view can outweigh an old cart action", () => {
  const oldCart = { ...gpuEvents[1], occurredAtMs: nowMs - 9 * 24 * 60 * 60 * 1000 };
  assert.ok(productIds({ events: [oldCart, headsetEvents[0]] })[0].startsWith("audio-"));
});

test("an invalid timestamp cannot hide the newest delivery of an event", () => {
  const newestCart = gpuEvents[1];
  const oldCart = { ...newestCart, occurredAtMs: nowMs - 9 * 24 * 60 * 60 * 1000 };
  const invalidView = { ...headsetEvents[1], occurredAtMs: Number.NaN };
  const validView = headsetEvents[0];
  const expected = productIds({ events: [newestCart, validView] });

  assert.deepEqual(productIds({ events: [oldCart, invalidView, newestCart, validView] }), expected);
});

test("a category with no eligible products falls back without showing the cart or sold-out SKUs", () => {
  const cartProductIds = ["gpu-mid", "gpu-compact", "gpu-premium", "mouse"];
  const result = recommend({ ...defaults, cartProductIds, events: gpuEvents });
  assert.equal(result.mode, "bestsellers");
  assert.deepEqual(result.items.map((item) => item.productId),
    ["audio-usb", "keyboard", "audio-stereo", "audio-wireless"]);
});
