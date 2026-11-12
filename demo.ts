import { recommend } from "./engine.ts";
import { catalog, gpuEvents, headsetEvents, nowMs } from "./fixtures.ts";

const common = { catalog, nowMs, personalizationAllowed: true };
const scenarios = [
  { label: "GPU shopper with one graphics card in the cart", events: gpuEvents, cartProductIds: ["gpu-mid"] },
  { label: "Headset shopper", events: headsetEvents, cartProductIds: [] },
  { label: "First-time visitor", events: [], cartProductIds: [] },
  { label: "Shopper declines personalization", events: gpuEvents, cartProductIds: [], personalizationAllowed: false },
];

for (const { label, ...request } of scenarios) {
  const result = recommend({ ...common, ...request });
  console.log(label + " (" + result.mode + ")");
  for (const item of result.items) {
    console.log("  " + item.name + " — " + item.reason);
  }
  console.log();
}
