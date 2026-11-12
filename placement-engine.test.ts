import assert from "node:assert/strict";
import test from "node:test";
import { createPlacementEngine, type PlacementInput, type PreviewProduct } from "./placement-engine.ts";
import { previewCatalog } from "./preview-catalog.ts";

const now = Date.UTC(2026, 10, 12, 4);
const engine = createPlacementEngine(previewCatalog);
const base = { surface: "home", cartProductIds: [], events: [], personalizationAllowed: false } satisfies PlacementInput;

function viewed(productId: string) {
  return { id: `view-${productId}`, type: "product_viewed" as const, productId, occurredAtMs: now - 1000 };
}

test("home switches by opted-in intent and ignores opted-out history", () => {
  const gpu = engine.recommend({ ...base, events: [viewed("gpu-mid")], personalizationAllowed: true }, now);
  const audio = engine.recommend({ ...base, events: [viewed("audio-usb")], personalizationAllowed: true }, now);
  assert.equal(gpu.placements[0].title, "Recommended for you");
  assert.equal(gpu.placements[0].items[0].productId, "gpu-compact");
  assert.equal(gpu.placements.find(row => row.id === "home_recommendations_2")?.title, "Top Sellers");
  assert.ok(audio.placements[0].items.every(item => item.productId.startsWith("audio-")));
  assert.deepEqual(
    engine.recommend({ ...base, events: [viewed("gpu-mid")] }, now),
    engine.recommend(base, now),
  );
});

test("every placement excludes cart, unpublished and unavailable products without duplicates", () => {
  for (const surface of ["home", "product", "search", "cart"] as const) {
    const result = engine.recommend({
      ...base, surface, productId: "gpu-mid", query: "graphics cards",
      cartProductIds: ["gpu-mid"], events: [viewed("gpu-mid")], personalizationAllowed: true,
    }, now);
    const ids = result.placements.flatMap(row => row.items.map(item => item.productId));
    assert.ok(result.placements.every(row => row.items.length <= 4));
    assert.equal(ids.length, new Set(ids).size);
    for (const excluded of ["gpu-mid", "gpu-draft", "gpu-unavailable"]) {
      assert.ok(!ids.includes(excluded), `${excluded} leaked into ${surface}`);
    }
  }
});

test("product uses sample co-purchases and cart uses its curated pairings", () => {
  const product = engine.recommend({ ...base, surface: "product", productId: "gpu-mid" }, now);
  assert.equal(product.placements[0].id, "pdp_recommendations_1");
  assert.equal(product.placements[0].title, "Customers Also Bought");
  assert.deepEqual(product.placements[0].items.map(item => item.productId), ["monitor-fhd", "psu-650", "keyboard"]);
  assert.ok(!product.placements.flatMap(row => row.items).some(item => item.productId === "gpu-mid"));
  const cart = engine.recommend({ ...base, surface: "cart", cartProductIds: ["gpu-mid"] }, now);
  assert.equal(cart.placements[0].id, "cart_recommendations_1");
  assert.equal(cart.placements[0].title, "Related Products");
  assert.deepEqual(cart.placements[0].items.map(item => item.productId), ["psu-650", "monitor-fhd"]);
  const emptyCart = engine.recommend({ ...base, surface: "cart" }, now);
  assert.deepEqual(emptyCart.placements.map(row => [row.id, row.title]), [["cart_recommendations_3", "Top Sellers"]]);
});

test("search ranks matching products and returns a safe fallback for an unknown query", () => {
  const matches = engine.recommend({ ...base, surface: "search", query: "GRAPHICS cards" }, now);
  assert.ok(matches.searchMatches.length > 4);
  assert.ok(matches.searchMatches.every(id => id.startsWith("gpu-") && !["gpu-unavailable", "gpu-draft"].includes(id)));
  assert.ok(matches.placements.every(row => row.items.every(item => matches.searchMatches.includes(item.productId))));
  const empty = engine.recommend({ ...base, surface: "search", query: "unknown widget" }, now);
  assert.deepEqual(empty.searchMatches, []);
  assert.equal(empty.placements[0].title, "Bestsellers");
});

test("a precise search still finds a low-popularity match in a large common category", () => {
  const seed = previewCatalog.find(product => product.id === "gpu-mid")!;
  const fixtures: PreviewProduct[] = Array.from({ length: 6000 }, (_, index) => ({
    ...seed, id: `fixture-${index}`, name: `Graphics Card ${index}`, paidOrdersLast30Days: 6000 - index,
  }));
  fixtures.push({ ...seed, id: "rare", name: "Graphics Card Triarch", paidOrdersLast30Days: 0 });
  const result = createPlacementEngine(fixtures).recommend({
    ...base, surface: "search", query: "graphics triarch",
  }, now);
  assert.deepEqual(result.searchMatches, ["rare"]);
});
