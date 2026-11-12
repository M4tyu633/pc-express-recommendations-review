import type { PreviewProduct, ProductKind } from "./placement-engine.ts";

const day = 86_400_000;
const catalogDate = Date.UTC(2026, 10, 12);
function fixture(
  id: string, name: string, kind: ProductKind, category: string, pricePhp: number,
  paidOrdersLast30Days: number, daysAgo: number, description: string,
  options: Partial<Pick<PreviewProduct, "inStock" | "published" | "keywords" | "accessoryIds" | "alsoBoughtIds">> = {},
): PreviewProduct {
  return {
    id, name, kind, category, pricePhp, paidOrdersLast30Days, description,
    addedAtMs: catalogDate - daysAgo * day, inStock: true, published: true, ...options,
  };
}

const graphics = "graphics cards";
const headsets = "headsets";
const gpuTerms = "gpu gpus video card graphics gaming";
export const previewCatalog: readonly PreviewProduct[] = [
  fixture("gpu-mid", "Vector G5 12GB Graphics Card", "gpu", graphics, 23500, 18, 20, "12 GB · Dual fan · PCIe 4.0", {
    keywords: gpuTerms, accessoryIds: ["psu-650", "monitor-fhd"],
    alsoBoughtIds: ["monitor-fhd", "psu-650", "keyboard"],
  }),
  fixture("gpu-compact", "Vector G4 8GB Compact Graphics Card", "gpu", graphics, 22900, 14, 1, "8 GB · Compact dual fan", { keywords: gpuTerms, accessoryIds: ["psu-650"] }),
  fixture("gpu-premium", "Vector G7 16GB Graphics Card", "gpu", graphics, 44500, 9, 8, "16 GB · Triple fan · PCIe 4.0", { keywords: gpuTerms, accessoryIds: ["psu-850"] }),
  fixture("gpu-entry", "Vector G3 6GB Graphics Card", "gpu", graphics, 14950, 13, 18, "6 GB · Dual fan", { keywords: gpuTerms, accessoryIds: ["psu-650"] }),
  fixture("gpu-max", "Vector G9 24GB Graphics Card", "gpu", graphics, 67900, 6, 2, "24 GB · Triple fan", { keywords: gpuTerms, accessoryIds: ["psu-850"] }),
  fixture("gpu-work", "Vector Studio 16GB Graphics Card", "gpu", graphics, 48950, 11, 11, "16 GB · Compact workstation card", { keywords: gpuTerms }),
  fixture("gpu-value", "Vector G4 SE 8GB Graphics Card", "gpu", graphics, 19950, 16, 4, "8 GB · Dual fan", { keywords: gpuTerms }),
  fixture("gpu-unavailable", "Vector G5 OC 12GB Graphics Card", "gpu", graphics, 23900, 80, 3, "12 GB · Factory overclocked", { keywords: gpuTerms, inStock: false }),
  fixture("gpu-draft", "Vector Draft 12GB Graphics Card", "gpu", graphics, 22000, 900, 0, "Unpublished fixture", { keywords: gpuTerms, published: false }),
  fixture("audio-usb", "Pulse H1 USB Headset", "headset", headsets, 1800, 42, 16, "USB-A · Flip-to-mute microphone", { keywords: "audio headphone headphones", accessoryIds: ["keyboard"] }),
  fixture("audio-stereo", "Pulse H2 Stereo Headset", "headset", headsets, 1650, 24, 5, "3.5 mm · Detachable cable", { keywords: "audio headphone headphones" }),
  fixture("audio-wireless", "Pulse H3 Wireless Headset", "headset", headsets, 4590, 20, 2, "2.4 GHz · USB-C charging", { keywords: "audio headphone headphones", accessoryIds: ["mouse"] }),
  fixture("audio-studio", "Pulse Studio Wired Headset", "headset", headsets, 2590, 10, 14, "USB-C · Padded headband", { keywords: "audio headphone headphones" }),
  fixture("mouse", "Arc M2 Wireless Mouse", "mouse", "mice", 1050, 51, 24, "2.4 GHz · Adjustable DPI", { keywords: "wireless mouse pointer" }),
  fixture("keyboard", "Arc K87 Mechanical Keyboard", "keyboard", "keyboards", 2700, 37, 12, "87 keys · Tactile switches", { keywords: "gaming keyboard switches" }),
  fixture("monitor-fhd", "Vista 24-inch 144 Hz Monitor", "monitor", "monitors", 7890, 31, 19, "24 inches · 1080p · 144 Hz", { keywords: "display screen gaming" }),
  fixture("monitor-qhd", "Vista 27-inch QHD Monitor", "monitor", "monitors", 13750, 17, 3, "27 inches · 1440p · 165 Hz", { keywords: "display screen gaming" }),
  fixture("psu-650", "Forge 650 W Gold Power Supply", "power", "power supplies", 4290, 22, 7, "650 W · 80 Plus Gold", { keywords: "psu power supply" }),
  fixture("psu-850", "Forge 850 W Gold Power Supply", "power", "power supplies", 5790, 12, 2, "850 W · 80 Plus Gold", { keywords: "psu power supply" }),
];
