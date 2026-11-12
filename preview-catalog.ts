import type { PreviewProduct, ProductKind } from "./placement-engine.ts";
import { storefront } from "./pcx-storefront-data.ts";

const day = 86_400_000;
const catalogDate = Date.UTC(2026, 10, 12);
function fixture(
  id: keyof typeof storefront.products, kind: ProductKind, category: string,
  paidOrdersLast30Days: number, daysAgo: number, description: string,
  options: Partial<Pick<PreviewProduct, "inStock" | "published" | "keywords" | "accessoryIds" | "alsoBoughtIds">> = {},
): PreviewProduct {
  return {
    id, ...storefront.products[id], kind, category, paidOrdersLast30Days, description,
    addedAtMs: catalogDate - daysAgo * day, inStock: true, published: true, ...options,
  };
}

const graphics = "graphics cards";
const headsets = "headsets";
const gpuTerms = "gpu gpus video card graphics gaming";
export const previewCatalog: readonly PreviewProduct[] = [
  fixture("gpu-mid", "gpu", graphics, 18, 20, "GeForce RTX 5050 · 8 GB GDDR6", {
    keywords: gpuTerms, accessoryIds: ["psu-650", "monitor-fhd"],
    alsoBoughtIds: ["monitor-fhd", "psu-650", "keyboard"],
  }),
  fixture("gpu-compact", "gpu", graphics, 14, 1, "GeForce RTX 5050 · 8 GB GDDR6", { keywords: gpuTerms, accessoryIds: ["psu-650"] }),
  fixture("gpu-premium", "gpu", graphics, 9, 8, "Radeon RX 9070 · 16 GB GDDR6", { keywords: gpuTerms, accessoryIds: ["psu-850"] }),
  fixture("gpu-entry", "gpu", graphics, 13, 18, "GeForce RTX 3050 · 6 GB GDDR6", { keywords: gpuTerms, accessoryIds: ["psu-650"] }),
  fixture("gpu-max", "gpu", graphics, 6, 2, "GeForce RTX 5080 · 16 GB GDDR7", { keywords: gpuTerms, accessoryIds: ["psu-850"] }),
  fixture("gpu-work", "gpu", graphics, 11, 11, "Radeon AI PRO · 32 GB GDDR6", { keywords: gpuTerms }),
  fixture("gpu-value", "gpu", graphics, 16, 4, "Radeon RX 9050 · 8 GB GDDR6", { keywords: gpuTerms }),
  fixture("gpu-unavailable", "gpu", graphics, 80, 3, "Unavailable in this demo", { keywords: gpuTerms, inStock: false }),
  { ...fixture("gpu-unavailable", "gpu", graphics, 900, 0, "Unpublished fixture"), id: "gpu-draft", published: false },
  fixture("audio-usb", "headset", headsets, 42, 16, "USB wired headset", { keywords: "audio headphone headphones", accessoryIds: ["keyboard"] }),
  fixture("audio-stereo", "headset", headsets, 24, 5, "Wired gaming headset", { keywords: "audio headphone headphones" }),
  fixture("audio-wireless", "headset", headsets, 20, 2, "Wireless Bluetooth headset", { keywords: "audio headphone headphones", accessoryIds: ["mouse"] }),
  fixture("audio-studio", "headset", headsets, 10, 14, "Wireless gaming headset", { keywords: "audio headphone headphones" }),
  fixture("mouse", "mouse", "mice", 51, 24, "USB wireless mouse", { keywords: "wireless mouse pointer peripherals" }),
  fixture("keyboard", "keyboard", "keyboards", 37, 12, "RGB gaming keyboard", { keywords: "gaming keyboard switches peripherals" }),
  fixture("monitor-fhd", "monitor", "monitors", 31, 19, "23.8 inches · 144 Hz · IPS", { keywords: "display screen gaming" }),
  fixture("monitor-qhd", "monitor", "monitors", 17, 3, "27 inches · 180 Hz", { keywords: "display screen gaming" }),
  fixture("psu-650", "power", "power supplies", 22, 7, "650 W · 80 Plus Bronze", { keywords: "psu power supply" }),
  fixture("psu-850", "power", "power supplies", 12, 2, "850 W · 80 Plus Gold", { keywords: "psu power supply" }),
  fixture("desktop-ms", "desktop", "desktop pcs", 15, 9, "GeForce RTX 3050 · Intel Core i5", { keywords: "desktop computers pc" }),
  fixture("desktop-in", "desktop", "desktop pcs", 16, 8, "GeForce RTX 3050 · Intel Core i5", { keywords: "desktop computers pc" }),
  fixture("laptop-lenovo", "laptop", "laptops", 16, 7, "GeForce RTX 5060 · AMD Ryzen 7", { keywords: "laptop notebook gaming" }),
  fixture("laptop-msi", "laptop", "laptops", 14, 6, "GeForce RTX 5070 · Intel Core i7", { keywords: "laptop notebook gaming" }),
];
