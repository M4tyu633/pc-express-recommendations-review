import type { Product, ShopperEvent } from "./engine.ts";

export const nowMs = Date.parse("2026-11-12T08:00:00+08:00");

// Fictional prices, stock and order counts for a local demo.
export const catalog = [
  { id: "gpu-mid", name: "Midrange graphics card", category: "graphics cards", pricePhp: 23500, inStock: true, paidOrdersLast30Days: 18 },
  { id: "gpu-compact", name: "Compact graphics card", category: "graphics cards", pricePhp: 22900, inStock: true, paidOrdersLast30Days: 14 },
  { id: "gpu-premium", name: "High-memory graphics card", category: "graphics cards", pricePhp: 44500, inStock: true, paidOrdersLast30Days: 9 },
  { id: "gpu-unavailable", name: "Sold-out graphics card", category: "graphics cards", pricePhp: 23300, inStock: false, paidOrdersLast30Days: 80 },
  { id: "audio-usb", name: "Wired USB headset", category: "headsets", pricePhp: 1800, inStock: true, paidOrdersLast30Days: 42 },
  { id: "audio-stereo", name: "Wired stereo headset", category: "headsets", pricePhp: 1650, inStock: true, paidOrdersLast30Days: 24 },
  { id: "audio-wireless", name: "Wireless headset", category: "headsets", pricePhp: 4590, inStock: true, paidOrdersLast30Days: 20 },
  { id: "mouse", name: "Wireless mouse", category: "mice", pricePhp: 1050, inStock: true, paidOrdersLast30Days: 51 },
  { id: "keyboard", name: "Mechanical keyboard", category: "keyboards", pricePhp: 2700, inStock: true, paidOrdersLast30Days: 37 },
] satisfies Product[];

export const gpuEvents = [
  { id: "gpu-view", type: "product_viewed", productId: "gpu-mid", occurredAtMs: nowMs - 900_000 },
  { id: "gpu-cart", type: "product_added_to_cart", productId: "gpu-mid", occurredAtMs: nowMs - 60_000 },
] satisfies ShopperEvent[];

export const headsetEvents = [
  { id: "headset-view", type: "product_viewed", productId: "audio-usb", occurredAtMs: nowMs - 400_000 },
  { id: "stereo-view", type: "product_viewed", productId: "audio-stereo", occurredAtMs: nowMs - 220_000 },
] satisfies ShopperEvent[];
