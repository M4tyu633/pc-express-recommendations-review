// PC Express storefront proposal v2. Builds on the v1 proposal (storefront-enhancement-demo/shop.js).
// All prices, stock states, offers, quotes, alerts, exposure counts and delivery options are sample data.
import { data } from "./catalog.js";
import { escapeHtml as esc, formatPrice as money } from "./cards.js";
import { createPlacementEngine } from "./ranking/placement-engine.js";

const main = document.querySelector("#shop-content");
const dialog = document.querySelector("#shop-dialog");
const search = document.querySelector("#shop-search");
const query = document.querySelector("#shop-query");
const notice = document.querySelector("#notice");
const tray = document.querySelector("#compare-tray");
const mobileBar = document.querySelector("#mobile-bar");
const basket = new Map();
const comparison = [];
const alerts = new Map();
const quotes = [];
let demoDate = "2026-11-13";
let ref = 4100;

// ---------- Product states ----------
// buy: online stock · quote: order-basis (listed, Sales confirms price and lead time)
// price: in demand / price changing · check: branch or pickup check · restock: temporarily out, alert available
const STATE = {
  buy: { label: "In stock online", action: "Add to cart", rank: 0 },
  quote: { label: "Order basis", action: "Request a quote", rank: 1 },
  check: { label: "Check branch stock", action: "Check stock", rank: 2 },
  price: { label: "High demand · price changes", action: "Get today’s price", rank: 3 },
  restock: { label: "Temporarily out of stock", action: "Notify me", rank: 4 },
};
const stateOverrides = {
  "desktop-in": "quote", "gpu-max": "quote", "gpu-work": "price", "laptop-msi": "check",
  "monitor-qhd": "restock", "gpu-unavailable": "restock",
};
const leadTime = { "desktop-in": "5–7 business days", "gpu-max": "7–10 business days" };
const specs = {
  "gpu-mid": { chip: "RTX 5050", vram: "8 GB GDDR6", bus: "128-bit", length: "247 mm", power: "1× 8-pin", psu: "550 W" },
  "gpu-compact": { chip: "RTX 5050", vram: "8 GB GDDR6", bus: "128-bit", length: "199 mm", power: "1× 8-pin", psu: "550 W" },
  "gpu-unavailable": { chip: "RTX 5050", vram: "8 GB GDDR6", bus: "128-bit", length: "229 mm", power: "1× 8-pin", psu: "550 W" },
  "gpu-entry": { chip: "RTX 3050", vram: "6 GB GDDR6", bus: "96-bit", length: "191 mm", power: "None (slot)", psu: "300 W" },
  "gpu-value": { chip: "RX 9050", vram: "8 GB GDDR6", bus: "128-bit", length: "250 mm", power: "1× 8-pin", psu: "500 W" },
  "gpu-premium": { chip: "RX 9070", vram: "16 GB GDDR6", bus: "256-bit", length: "288 mm", power: "2× 8-pin", psu: "750 W" },
  "gpu-max": { chip: "RTX 5080", vram: "16 GB GDDR7", bus: "256-bit", length: "338 mm", power: "1× 16-pin", psu: "850 W" },
  "gpu-work": { chip: "Radeon AI PRO R9700", vram: "32 GB GDDR6", bus: "256-bit", length: "300 mm", power: "1× 16-pin", psu: "800 W" },
  "monitor-fhd": { size: "23.8″", res: "Full HD", hz: 144, panel: "IPS" },
  "monitor-ek251q": { size: "24.5″", res: "Full HD", hz: 144, panel: "IPS" },
  "monitor-qhd": { size: "27″", res: "QHD", hz: 180, panel: "Fast IPS" },
};
// Units left online (sample). Production reads Shopify variant inventory for tracked items.
const stockSeed = { "gpu-mid": 7, "gpu-compact": 3, "gpu-premium": 2, "gpu-entry": 11, "gpu-value": 4, "monitor-fhd": 18, "monitor-ek251q": 6,
  "laptop-lenovo": 3, "laptop-a16": 5, "desktop-ms": 2, "laptop-msi": 2, "mouse-g102": 26, "audio-wireless": 8, "psu-650": 14, "psu-850": 5 };
const products = data.catalog.map(p => ({ ...p, status: stateOverrides[p.id] ?? (p.inStock ? "buy" : "restock"),
  stock: p.stock ?? stockSeed[p.id] ?? 4 + (p.paidOrdersLast30Days * 7) % 29 }));
const LOW_STOCK = 5;

// ---------- Recommendations ----------
// The ranking engine (recommendation-engine-draft) runs in the page. It only ranks items that can be bought online,
// and it learns from this browser tab's views, cart adds and searches. Nothing leaves the browser.
const engine = createPlacementEngine(products.map(p => ({ ...p, inStock: p.status === "buy" })));
const memory = (() => { try { return JSON.parse(sessionStorage.getItem("pcx-v2-session")) ?? {}; } catch { return {}; } })();
memory.events = Array.isArray(memory.events) ? memory.events : [];
memory.wish = Array.isArray(memory.wish) ? memory.wish : [];
const saveMemory = () => { try { sessionStorage.setItem("pcx-v2-session", JSON.stringify(memory)); } catch { /* storage off */ } };
function remember(type, productId, query) {
  if (query !== undefined) { memory.query = query; memory.searches = [query, ...(memory.searches ?? []).filter(q => q.toLowerCase() !== query.toLowerCase())].slice(0, 5); }
  else {
    const last = memory.events.at(-1);
    if (type === "product_viewed" && last?.type === type && last.productId === productId) return;
    memory.events = [...memory.events, { id: "e" + Date.now() + "-" + memory.events.length, type, productId, occurredAtMs: Date.now() }].slice(-60);
  }
  try { sessionStorage.setItem("pcx-v2-session", JSON.stringify(memory)); } catch { /* storage off: picks fall back to bestsellers */ }
}
const recs = (surface, productId) => engine.recommend({ surface, productId, shoppingQuery: memory.query, personalizationAllowed: true,
  events: memory.events, cartProductIds: [...basket.keys()] }, Date.now()).placements;
const byId = new Map(products.map(p => [p.id, p]));
const partCategories = new Map(data.partCategories.map(category => [category.kind, category]));
const categories = [["laptops", "Laptops"], ["desktop", "Desktop PCs"], ["monitor", "Monitors"], ["headset", "Headsets"], ["mouse", "Mice"], ["keyboard", "Keyboards"], ["parts", "PC Parts"],
  ...data.partCategories.map(({ kind, name }) => [kind, name])];
const partLinks = data.partCategories.map(({ kind, name }) => [name, "#shop/" + kind]);
const modelCode = p => p.model ?? (p.name.match(/\(([A-Z0-9][A-Z0-9-]{4,})\)/) ?? p.name.match(/\b([A-Z]{1,3}\d{3,}[A-Z0-9-]*)\b/))?.[1] ?? "";
const inCategory = (product, kind) => !kind || (kind === "parts" ? partCategories.has(product.kind) : product.kind === (kind === "laptops" ? "laptop" : kind));

// ---------- Partner offers: one record drives banner, terms, badges, cart and retirement ----------
const offers = [
  { id: "laptop-bundle", partner: "NVIDIA", title: "Gaming laptop bundle", benefit: "Free wireless mouse with selected RTX laptops", cardBenefit: "Free wireless mouse", cardIcon: "gift", cardLabel: "Free",
    start: "2026-11-01", end: "2026-12-14", claim: null, items: ["laptop-lenovo", "laptop-a16", "laptop-msi"], art: "slide-7.jpg",
    steps: ["Add an eligible laptop to your cart. The gift appears on the order automatically.", "Sales confirms stock and the gift with your order.", "The mouse ships or is released with the laptop."] },
  { id: "asus-reward", partner: "ASUS", title: "ASUS gaming gear cashback", benefit: "₱500 e-wallet cashback per eligible item", cardBenefit: "₱500 e-wallet cashback", cardIcon: "cashback", cardLabel: "₱500 cashback", compactLabel: "₱500 back",
    start: "2026-11-10", end: "2026-12-31", claim: "2027-01-15", items: ["monitor-qhd", "keyboard", "gpu-unavailable"], art: "slide-1.jpg",
    steps: ["Buy an eligible ASUS item between Nov 10 and Dec 31.", "Keep your PC Express invoice.", "Submit the claim on the partner page by Jan 15."] },
  { id: "gpu-holiday", partner: "NVIDIA", title: "Holiday graphics card deals", benefit: "Bundle price on RTX graphics cards with a power supply", cardBenefit: "GPU and power supply bundle", cardIcon: "bundle", cardLabel: "PSU bundle", compactLabel: "Bundle",
    start: "2026-12-01", end: "2026-12-31", claim: null, items: ["gpu-mid", "gpu-compact", "gpu-max", "gpu-entry"], art: "slide-5.jpg",
    steps: ["Choose an eligible card and a listed power supply.", "The bundle price applies in the cart during the offer dates."] },
  { id: "gamer-days", partner: "Intel", title: "Gamer days game bundle", benefit: "Free game code with selected Intel PCs", cardBenefit: "Free game code", cardIcon: "gift", cardLabel: "Free",
    start: "2026-08-10", end: "2026-09-13", claim: "2026-10-31", items: ["laptop-msi", "desktop-in", "desktop-ms"], art: "../partner-assets/intel/Intel-IGD-1800x600.webp",
    steps: ["Buy an eligible Intel system during the purchase period.", "Redeem the code by the claim date."] },
];
const fmtDate = iso => new Date(iso + "T00:00:00+08:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
function offerStatus(o) { return demoDate < o.start ? "upcoming" : demoDate > o.end ? "ended" : "live"; }
const liveOffersFor = id => offers.filter(o => offerStatus(o) === "live" && o.items.includes(id));

// ---------- Funded placements: slot order is fixed by agreement; items inside a slot reorder by buyability ----------
const placements = [
  { key: "asus", partner: "ASUS", slot: "Home row 1 + hero slide 1", committed: 40000, delivered: 31240, hero: "monitor-qhd",
    items: ["monitor-qhd", "keyboard", "gpu-unavailable"], slide: 0, title: "ASUS gaming gear" },
  { key: "nvidia", partner: "NVIDIA", slot: "Home row 3 + hero slide 3", committed: 30000, delivered: 22410, hero: null,
    items: ["gpu-max", "gpu-mid", "gpu-compact", "laptop-lenovo", "gpu-entry"], slide: 6, title: "NVIDIA GeForce graphics and gaming laptops" },
  { key: "intel", partner: "Intel", slot: "Home row 4 + hero slide 2", committed: 20000, delivered: 17880, hero: "desktop-in",
    items: ["laptop-msi", "desktop-ms", "desktop-in", "laptop-a16"], slide: 2, title: "Intel and Windows 11 PCs" },
];
const sessionViews = { asus: 0, nvidia: 0, intel: 0 };
const arrange = (ids, hero) => ids.map(id => byId.get(id)).sort((a, b) =>
  (b.id === hero) - (a.id === hero) || STATE[a.status].rank - STATE[b.status].rank);

// Restock alerts the live site currently sends to the store contact inbox. Seeds are sample counts.
const alertSeeds = { "gpu-unavailable": 37, "monitor-qhd": 22, "desktop-in/complete": 9 };

// ---------- Rendering helpers ----------
function image(p, eager = false) {
  return '<img class="product-image" src="/pcx-assets/' + esc(p.image) + '" alt="' + esc(p.name) + '" width="480" height="480"' + (eager ? '' : ' loading="lazy"') + '>';
}
// Plain availability text everywhere (no dot chips): the count when in stock, otherwise a short state.
const chip = (s, p) => '<span class="avail s-' + s + '">' + (p ? availText(p, s) : STATE[s].label) + '</span>';
function priceLine(p, s = p.status) {
  if (s === "quote") return '<p class="price">' + money(p.pricePhp) + ' <small>last listed · Sales confirms today’s price</small></p>';
  if (s === "price") return '<p class="price">From ' + money(p.pricePhp) + ' <small>price moves with supply</small></p>';
  if (s === "restock") return '<p class="price">' + money(p.pricePhp) + ' <small>when back in stock</small></p>';
  return '<p class="price">' + money(p.pricePhp) + '</p>';
}
function actionButton(p, s = p.status, variant = "") {
  const saved = s === "restock" && alerts.has(p.id + "/" + variant);
  return '<button class="primary act-' + s + '" type="button" data-action="' + s + '" data-id="' + p.id + '" data-variant="' + variant + '"><span>' + (saved ? "Alert saved" : STATE[s].action) + '</span></button>';
}
function wishButton(p) {
  const on = memory.wish.includes(p.id);
  return '<button type="button" class="wish" data-action="wish" data-id="' + p.id + '" aria-pressed="' + on + '" aria-label="' + (on ? "Remove from wishlist" : "Add to wishlist") + '"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="' + (on ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>';
}
function compareButton(p) {
  const on = comparison.includes(p.id);
  return '<button type="button" class="secondary" data-action="compare" data-id="' + p.id + '" aria-pressed="' + on + '">' + (on ? "Comparing" : "Compare") + '</button>';
}
// Keep stock and offer details with the price so the product photo stays clear.
const availText = (p, s = p.status) => ({
  buy: p.stock + " in stock",
  quote: "By order, " + (leadTime[p.id] ?? "lead time from Sales"),
  check: p.stock + " left online",
  price: "Price changes often",
  restock: "Out of stock",
})[s];
const availClass = (p, s = p.status) => "avail s-" + s + (s === "buy" && p.stock <= LOW_STOCK ? " low" : "");
const avail = (p, s = p.status) => '<p class="' + availClass(p, s) + '">' + availText(p, s) + '</p>';
const offerIcons = {
  cashback: '<path fill-rule="evenodd" d="M3 5a2 2 0 0 1 2-2h6l9.4 9.4a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0L3 11V5Zm5.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
  gift: '<path d="M11 13v7H5a1 1 0 0 1-1-1v-6h7Zm9 0v6a1 1 0 0 1-1 1h-6v-7h7ZM8.5 4c1.5 0 2.7 1 3.5 2.3C12.8 5 14 4 15.5 4A2.5 2.5 0 0 1 18 6.5c0 .6-.2 1.1-.5 1.5H20a1 1 0 0 1 1 1v2h-8V8h-2v3H3V9a1 1 0 0 1 1-1h2.5A2.5 2.5 0 0 1 8.5 4Zm0 1.5a1 1 0 0 0 0 2h2c-.5-1-1.2-2-2-2Zm7 0c-.8 0-1.5 1-2 2h2a1 1 0 0 0 0-2Z"/>',
  bundle: '<path d="m12 3 8.6 4.3-8.6 4.3-8.6-4.3L12 3ZM3 9l8 4v8l-8-4V9Zm18 0v8l-8 4v-8l8-4Z"/>',
};
function cardOffer(promo) {
  const href = '#offer/' + promo.id;
  const icon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">' + offerIcons[promo.cardIcon] + '</svg>';
  const label = promo.cardIcon === "gift" ? "Free gift details" : promo.cardBenefit;
  const compact = promo.compactLabel ? '<span class="card-offer-compact">' + esc(promo.compactLabel) + '</span>' : '';
  return '<a class="card-offer card-' + promo.cardIcon + '" href="' + href + '" aria-label="' + esc(label) + '">' +
    icon + '<span>' + esc(promo.cardLabel) + '</span>' + compact + '</a>';
}
function card(p, opts = {}) {
  const promo = liveOffersFor(p.id)[0];
  return '<article class="shop-card" data-state="' + p.status + '"><a class="card-art" href="#product/' + p.id + '">' + image(p) + '</a>' +
    '<div class="card-info"><h3><a href="#product/' + p.id + '">' + esc(p.name) + '</a></h3>' +
    (p.specifications ? '<p class="part-summary">' + esc(p.description) + '</p>' : '') +
    '<div class="card-price-line"><p class="price">' + money(p.pricePhp) + (p.status === "quote" ? ' <small>last listed</small>' : '') + '</p>' +
    (promo ? cardOffer(promo) : '') + '</div>' +
    '<p class="meta"><span class="' + availClass(p) + '">' + availText(p) + '</span>' + (p.paidOrdersLast30Days ? '<span class="sold">' + p.paidOrdersLast30Days + ' sold</span>' : '') + '</p>' +
    (opts.note ? '<p class="rec-note">' + esc(opts.note) + '</p>' : '') +
    '<div class="button-row">' + actionButton(p) + compareButton(p) + '</div></div></article>';
}
const grid = (items, opts) => '<div class="shop-grid">' + items.map(p => card(p, opts?.(p))).join("") + '</div>';
const breadcrumb = s => '<p class="breadcrumb"><a href="#home">Home</a> <span aria-hidden="true">/</span> ' + esc(s) + '</p>';
function toast(message) {
  notice.className = "toast"; notice.textContent = message;
  clearTimeout(toast.t); toast.t = setTimeout(() => { notice.className = "sr-only"; notice.textContent = ""; }, 3400);
}
function syncChrome(page) {
  const cartN = [...basket.values()].reduce((a, b) => a + b, 0), cc = document.querySelector("#cart-count"), mc = document.querySelector("#compare-count");
  cc.textContent = cartN; cc.hidden = !cartN; mc.textContent = comparison.length; mc.hidden = !comparison.length;
  const wc = document.querySelector("#wish-count"); wc.textContent = memory.wish.length; wc.hidden = !memory.wish.length;
  tray.hidden = !comparison.length || page === "compare";
  tray.innerHTML = comparison.length ? '<div class="frame tray-inner"><strong>Compare (' + comparison.length + '/4)</strong><div class="tray-items">' +
    comparison.map(id => { const p = byId.get(id); return '<span class="tray-item">' + image(p) + '<button type="button" data-action="compare" data-id="' + id + '" aria-label="Remove ' + esc(p.name) + '">×</button></span>'; }).join("") +
    '</div><a class="primary" href="#compare">' + (comparison.length > 1 ? "Compare now" : "Add one more") + '</a><button type="button" class="link" data-action="clear-compare">Clear</button></div>' : "";
}

// ---------- Pages ----------
// Partner stage (patterns: Lazada/Villman main banner + fixed side banners, LazMall brand wall).
// Every funded partner is visible on first load, in the same order as today's partner bar.
// [key, name, brand color, slide index or null, panel headline, panel copy, panel products]
const stagePartners = [
  ["taiwan-excellence", "Taiwan Excellence", "#c8102e", null, "Award-winning Taiwan brands", "ASUS, Acer, MSI and Gigabyte picks carrying the Taiwan Excellence mark.", ["monitor-fhd", "gpu-mid", "keyboard"]],
  ["amd", "AMD", "#111111", 1],
  ["asus", "Powered by ASUS", "#00539b", { d: "asus/PBA-Choice-of-Champions-1800x600.jpg", label: "The choice of champions" }, "PCX builds, powered by ASUS", "ASUS monitors, graphics and gear. Ready to ship or by order.", ["monitor-qhd", "gpu-unavailable", "keyboard"]],
  ["asus-agent", "ASUS Agent Computer", "#1b2a6b", 0],
  ["nvidia", "NVIDIA", "#76b900", 6],
  ["intel", "Intel", "#0068b5", 2],
  ["microsoft", "Microsoft", "#2f2f2f", { d: "microsoft/1800x600px-M365-Oct-2026.jpg", m: "microsoft/750x1100-M365-Oct-2026.jpg", label: "Microsoft 365 with Copilot" }, "Windows 11 PCs", "Laptops and desktops with Windows 11, set up and ready to use.", ["laptop-a16", "desktop-ms", "laptop-lenovo"]],
  ["lenovo", "Lenovo", "#e2231a", { d: "lenovo/1800x600-Lenovo-laptop-Promo_Oct_2026.jpg", m: "lenovo/750x1100-Lenovo-laptop-Promo-Oct-2026.jpg", label: "Lenovo Holiday Promo 2026" }, "Lenovo LOQ gaming laptops", "RTX 50 Series performance from Lenovo, with PC Express warranty.", ["laptop-lenovo", "monitor-ek251q", "mouse-g102"]],
  ["msi", "Powered by MSI", "#d6001c", { d: "msi/1800px_x_600px_Desktop_Main_Slider.jpg", m: "msi/750px_x_1100px_Mobile_Main_Slider.jpg", label: "True gaming, powered by MSI" }],
  ["samsung", "Samsung Monitors", "#1428a0", 7],
  ["business", "Business Solutions", "#0a3a99", 5],
];
const otherBrands = ["Acer", "Gigabyte", "HP", "Dell", "Logitech", "HyperX", "Kingston", "ADATA", "Sapphire", "Galax", "Inno3D", "Zotac", "AOC", "ViewSonic", "JBL", "Seagate", "Synology", "TP-Link", "D-Link"];
const rotation = stagePartners;
const heroViews = Object.fromEntries(stagePartners.map(([k]) => [k, 0]));
// Official logos: Wikimedia Commons SVGs for AMD, NVIDIA, Intel, Microsoft, Lenovo, MSI, Samsung and ASUS;
// PC Express, Powered by ASUS, Agent Computer and Taiwan Excellence files from pcx.com.ph.
const logoFiles = {
  "taiwan-excellence": ["te.png", "Taiwan Excellence"], amd: ["amd.svg", "AMD"], asus: ["powered-by-asus.png", "Powered by ASUS"],
  "asus-agent": ["agent-computer.png", "ASUS Agent Computer"], nvidia: ["nvidia.svg", "NVIDIA"], intel: ["intel.svg", "Intel"],
  microsoft: ["microsoft.svg", "Microsoft"], lenovo: ["lenovo.svg", "Lenovo"], msi: ["msi.svg", "MSI", "Powered by"],
  samsung: ["samsung.svg", "Samsung"], business: ["pcx.png", "PC Express", null, "Business Solutions"],
  "asus-brand": ["asus.svg", "ASUS"], "msi-brand": ["msi.svg", "MSI"],
  "pcx-business": ["pcx.png", "PC Express"],
  "pcx-desktop": ["pcx-desktop.png", "PCX Desktop. Ang PC para sa makabagong Pilipino"],
};
function wordmark(key) {
  const l = logoFiles[key];
  if (!l) return undefined;
  const [file, alt, above, below] = l;
  return '<span class="logo logo-' + key + '">' + (above ? '<small>' + above + '</small>' : '') + '<img src="/partner-assets/logos/' + file + '" alt="' + esc(alt) + '" loading="lazy">' + (below ? '<small>' + below + '</small>' : '') + '</span>';
}
const chevron = dir => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="' + (dir < 0 ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7") + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function taiwanArtwork() {
  return '<div class="lp-compose"><div class="lp-compose-copy"><img src="' +
    PA("taiwan-excellence", "Taiwan-Logo-2.png") + '" alt="Taiwan Excellence. Everyday Excellence." width="900" height="250"></div>' +
    '<img class="lp-compose-products" src="' + PA("taiwan-excellence", "Taiwan-Products.webp") + '" alt="" width="1400" height="526"></div>';
}
function stagePane([key, name, color, slide, head, copy, items], i) {
  const cta = '<span class="pane-cta">Shop ' + esc(name) + ' <span aria-hidden="true">›</span></span>';
  const lazy = i ? ' loading="lazy"' : ' fetchpriority="high"';
  const attrs = ' href="#partner/' + key + '" style="--brand:' + color + '" data-key="' + key + '"' + (i ? ' aria-hidden="true" tabindex="-1"' : '');
  if (key === "taiwan-excellence") {
    return '<a class="pane taiwan-pane' + (i ? '' : ' is-active') + '"' + attrs + ' aria-label="Shop Taiwan Excellence">' + taiwanArtwork() + '</a>';
  }
  if (slide && typeof slide === "object") {
    return '<a class="pane art' + (i ? '' : ' is-active') + '"' + attrs + ' aria-label="' + esc(name) + ': ' + esc(slide.label) + '"><img src="/partner-assets/' + slide.d + '" alt="" width="1800" height="600"' + lazy + '></a>';
  }
  if (slide !== null && slide !== undefined) {
    const s = data.slides[slide];
    return '<a class="pane art' + (i ? '' : ' is-active') + '"' + attrs + ' aria-label="' + esc(name) + ': ' + esc(s.label) + '"><img src="/pcx-assets/' + esc(s.desktop) + '" alt="" width="1440" height="480"' + lazy + '></a>';
  }
  return '<a class="pane panel' + (i ? '' : ' is-active') + '"' + attrs + ' aria-label="' + esc(name) + '"><div class="panel-copy">' + wordmark(key) +
    '<h2>' + esc(head) + '</h2><p>' + esc(copy) + '</p>' + cta + '</div><div class="panel-products">' +
    items.map(id => byId.get(id)).map(p => '<figure><img src="/pcx-assets/' + esc(p.image) + '" alt="" width="480" height="480" loading="lazy"><figcaption><b>' + money(p.pricePhp) + '</b><span class="' + availClass(p) + '">' + availText(p) + '</span></figcaption></figure>').join("") + '</div></a>';
}
function teTile() {
  const [, , , , head, , items] = stagePartners[0];
  return '<a class="side-tile te" href="#partner/taiwan-excellence"><div><img class="te-logo" src="/partner-assets/taiwan-excellence/Taiwan-Logo-2.png" alt="Taiwan Excellence" width="900" height="250"><p>' + esc(head) + '</p><span class="pane-cta">Shop the collection <span aria-hidden="true">›</span></span></div>' +
    '<div class="side-products">' + items.slice(0, 2).map(id => '<img src="/pcx-assets/' + esc(byId.get(id).image) + '" alt="" width="480" height="480">').join("") + '</div></a>';
}
function offerSide() {
  const live = offers.filter(o => offerStatus(o) === "live").sort((a, b) => a.end.localeCompare(b.end));
  const o = live[0];
  if (!o) return '<a class="side-tile offer" href="#offers"><span class="side-offer-copy"><strong>Browse offers</strong></span>' + chevron(1) + '</a>';
  const product = byId.get(o.items[0]);
  const logo = wordmark(o.partner.toLowerCase()) ?? esc(o.partner);
  return '<a class="side-tile offer" href="#offer/' + o.id + '"><span class="side-offer-copy">' + logo +
    '<strong>' + esc(o.benefit) + '</strong><time datetime="' + o.end + '">Ends ' + fmtDate(o.end) + '</time></span>' +
    '<img class="side-offer-product" src="/pcx-assets/' + esc(product.image) + '" alt="" width="480" height="480">' + chevron(1) + '</a>';
}
function stage() {
  return '<section class="stage" aria-label="Partner showcases"><div class="frame">' +
    '<div class="stage-grid"><div class="stage-view" aria-roledescription="carousel" aria-label="Partner banners">' + rotation.map(stagePane).join("") +
    '<button class="stage-arrow prev" type="button" data-stage="-1" aria-label="Previous partner">' + chevron(-1) + '</button>' +
    '<button class="stage-arrow next" type="button" data-stage="1" aria-label="Next partner">' + chevron(1) + '</button>' +
    '<div class="stage-dots">' + rotation.map(([k, n], i) => '<button type="button" data-stage-go="' + i + '" aria-label="Show ' + esc(n) + '"' + (i ? '' : ' aria-current="true"') + '></button>').join("") +
    '<span class="stage-count">1 / ' + rotation.length + '</span>' +
    '<button class="stage-pause" type="button" data-stage="pause" aria-label="Pause rotation"><span aria-hidden="true">❚❚</span></button></div></div>' +
    '<div class="stage-side">' + teTile() + offerSide() + '</div></div>' +
    '<nav class="brand-wall" aria-label="Our brand partners">' + stagePartners.map(([key, name, color]) =>
      '<a class="brand-tile" href="#partner/' + key + '" data-key="' + key + '" style="--brand:' + color + '" aria-label="' + esc(name) + '">' + wordmark(key) + '</a>').join("") +
    '</nav><p class="more-brands"><span>Also at PC Express:</span> ' + otherBrands.map(b => '<a href="#search/' + encodeURIComponent(b) + '">' + b + '</a>').join("") + '</p></div></section>';
}
let stageIndex = 0, stageTimer = null, stagePaused = matchMedia("(prefers-reduced-motion: reduce)").matches;
function showPartner(i) {
  const root = document.querySelector(".stage");
  if (!root) return;
  const nextIndex = (i + rotation.length) % rotation.length;
  const panels = root.querySelectorAll(".pane");
  if (!panels[nextIndex].classList.contains("is-active")) {
    root.style.setProperty("--banner-enter-x", i < stageIndex ? "-6%" : "6%");
    root.classList.add("has-switched");
  }
  stageIndex = nextIndex;
  const key = rotation[stageIndex][0];
  panels.forEach((p, n) => { const on = n === stageIndex; p.classList.toggle("is-active", on); p.toggleAttribute("aria-hidden", !on); p.tabIndex = on ? 0 : -1; });
  root.querySelectorAll(".stage-dots [data-stage-go]").forEach((b, n) => b.toggleAttribute("aria-current", n === stageIndex));
  root.querySelector(".stage-count").textContent = (stageIndex + 1) + " / " + rotation.length;
  root.querySelectorAll(".brand-tile").forEach(b => b.classList.toggle("is-live", b.dataset.key === key));
  heroViews[key]++;
  restartStage();
}
function restartStage() {
  clearInterval(stageTimer);
  const root = document.querySelector(".stage");
  if (!root) return;
  const btn = root.querySelector(".stage-pause");
  btn.innerHTML = '<span aria-hidden="true">' + (stagePaused ? "▶" : "❚❚") + '</span>';
  btn.setAttribute("aria-label", stagePaused ? "Resume rotation" : "Pause rotation");
  if (!stagePaused) stageTimer = setInterval(() => {
    if (!root.querySelector(".stage-view").matches(":hover, :focus-within")) showPartner(stageIndex + 1);
  }, 6000);
}
function stopStage() { clearInterval(stageTimer); stageTimer = null; }
const directoryOverrides = {
  asus: { name: "ASUS", logo: "asus-brand", href: "#search/ASUS" },
  msi: { name: "MSI", logo: "msi-brand", href: "#search/MSI" },
  business: { name: "PCX Business Solutions", logo: "pcx-business", href: "#partner/business" },
};
const brandDirectory = stagePartners.map(([key, name, color]) => ({
  name, logo: key, href: "#partner/" + key, color, ...directoryOverrides[key],
}));
function brandsPage() {
  return breadcrumb("Brands") + '<h1>Our brand partners</h1><div class="brand-wall big">' + brandDirectory.map(({ name, logo, href, color }) =>
    '<a class="brand-tile" href="' + href + '" style="--brand:' + color + '" aria-label="' + esc(name) + '">' + wordmark(logo) + '<span class="tile-name">' + esc(name) + '</span></a>').join("") + '</div>';
}
function offerTile(o) {
  const st = offerStatus(o);
  return '<article class="offer-tile"><a class="offer-art" href="#offer/' + o.id + '" aria-label="' + esc(o.title) + '"><img src="/pcx-assets/' + esc(o.art) + '" alt="" width="1440" height="480" loading="lazy"></a><div>' +
    '<h3>' + esc(o.title) + '</h3><p>' + esc(o.benefit) + '</p><p class="fine">' + (st === "live" ? "Valid until " + fmtDate(o.end) : "Starts " + fmtDate(o.start)) + '</p>' +
    '<a class="offer-link" href="#offer/' + o.id + '">' + (st === "live" ? "Shop offer" : "Preview offer") + chevron(1) + '</a></div></article>';
}
function shelfArrows(title) {
  return '<div class="shelf-arrows" role="group" aria-label="' + esc(title) + ' products" hidden>' +
    '<button type="button" data-shelf-step="-1" aria-label="Previous products" aria-disabled="true">' + chevron(-1) + '</button>' +
    '<button type="button" data-shelf-step="1" aria-label="Next products" aria-disabled="false">' + chevron(1) + '</button></div>';
}
function partnerRow(pl) {
  sessionViews[pl.key]++;
  const items = arrange(pl.items, pl.hero);
  return '<section class="shelf partner-row" data-partner="' + pl.key + '"><div class="row-head"><div class="row-title">' + (wordmark(pl.key) ?? '') + '<div><h2>' + esc(pl.title) + '</h2>' +
    '</div></div><div class="shelf-tools"><a class="text-link" href="#partner/' + pl.key + '">View all <span aria-hidden="true">›</span></a>' + shelfArrows(pl.title) + '</div></div>' +
    grid(items) + '</section>';
}
function home() {
  const live = offers.filter(o => offerStatus(o) !== "ended");
  const [main, ...more] = recs("home");
  const extra = more.filter(pl => /add-ons|recently/i.test(pl.title));
  // Keep the row full: a short personal row is topped up with the engine's top sellers.
  const top = more.find(pl => pl.title === "Top Sellers");
  if (main && top && main.items.length < 4) main.items = [...main.items, ...top.items].slice(0, 4);
  return '<h1 class="sr-only">PC Express storefront</h1><section class="shelf offers-strip"><div class="row-head"><div><h2>Partner offers</h2></div><a class="text-link" href="#offers">All offers <span aria-hidden="true">›</span></a></div>' +
    '<div class="offer-tiles">' + live.map(offerTile).join("") + '</div></section>' +
    partnerRow(placements[0]) +
    (main ? recRow(main, { link: true }) : '') + partnerRow(placements[1]) + partnerRow(placements[2]) + extra.map(pl => recRow(pl)).join("");
}
const recTitles = { "Recommended for you": "Picked for you", "Bestsellers": "Bestsellers ready to ship", "Top Sellers": "Top sellers",
  "Add-ons for your cart": "Complete your setup", "Customers Also Bought": "Frequently bought together", "Suggested add-ons": "Goes well with" };
// One row per placement. Rows whose reasons differ per item (price gaps) show them on each card.
function recRow(pl, { title, link } = {}) {
  const items = pl.items.map(i => [byId.get(i.productId), i.reason]);
  const perCard = new Set(pl.items.map(i => i.reason)).size > 1;
  const heading = title ?? recTitles[pl.title] ?? pl.title;
  const reason = pl.items[0].reason;
  const showReason = reason && pl.title !== "Recently viewed" && !perCard && reason !== "Popular and available";
  return '<section class="shelf picks" data-rec="' + esc(pl.id) + '"><div class="row-head"><div><h2>' + esc(heading) + '</h2>' +
    (showReason ? '<p class="muted">' + esc(reason) + '</p>' : '') + '</div>' +
    '<div class="shelf-tools">' + (link ? '<a class="text-link" href="#shop?available=1">Shop in-stock items <span aria-hidden="true">›</span></a>' : '') +
    shelfArrows(heading) + '</div></div>' +
    '<div class="shop-grid">' + items.map(([p, why]) => card(p, perCard ? { note: why } : {})).join("") + '</div></section>';
}
// Cart cross-sell: a compact list beside the order, one-tap add.
function addonList(pl) {
  return '<section class="picks cart-addons" data-rec="' + esc(pl.id) + '"><h2>' + esc(recTitles[pl.title] ?? pl.title) + '</h2><p class="muted">' + esc(pl.items[0].reason) + '</p><ul>' +
    pl.items.map(({ productId }) => byId.get(productId)).map(p => '<li class="shop-card"><a href="#product/' + p.id + '">' + image(p) + '</a><div><h3><a href="#product/' + p.id + '">' + esc(p.name) + '</a></h3>' +
      '<p class="price">' + money(p.pricePhp) + '</p>' + avail(p) + '</div><button type="button" class="secondary" data-action="buy" data-id="' + p.id + '">Add</button></li>').join("") + '</ul></section>';
}
function offersPage() {
  return breadcrumb("Partner offers") + '<h1>Partner offers</h1>' +
    '<div class="offer-tiles big">' + offers.filter(o => offerStatus(o) !== "ended").map(offerTile).join("") + '</div>' +
    '<section class="shelf ended-list"><h2>Recently ended</h2>' + offers.filter(o => offerStatus(o) === "ended").map(o =>
      '<p><a href="#offer/' + o.id + '">' + esc(o.title) + '</a> · ended ' + fmtDate(o.end) + ' · removed from the homepage on ' + fmtDate(o.end) + '</p>').join("") + '</section>';
}
function offerPage(id) {
  const o = offers.find(x => x.id === id);
  if (!o) return missing();
  const st = offerStatus(o);
  const items = arrange(o.items);
  const banner = st === "ended"
    ? '<div class="state-banner ended"><strong>This offer ended on ' + fmtDate(o.end) + '.</strong> The products below are still available at regular terms. <a href="#offers">See current offers</a></div>'
    : st === "upcoming" ? '<div class="state-banner upcoming"><strong>Starts ' + fmtDate(o.start) + '.</strong> Prices and eligibility may change before launch.</div>' : "";
  const productsHeading = st === "ended" ? "Products from this offer" : "Eligible models";
  const productsLink = st === "live" ? "Shop eligible models" : "View products";
  const partnerKey = o.partner.toLowerCase();
  return breadcrumb("Partner offers") + banner +
    '<section class="campaign-banner v2"><div class="campaign-copy"><div class="campaign-brand">' + (wordmark(partnerKey) ?? esc(o.partner)) + '</div>' +
    '<h1>' + esc(o.title) + '</h1><p>' + esc(o.benefit) + '.</p>' +
    '<dl class="offer-facts"><div><dt>Purchase dates</dt><dd>' + fmtDate(o.start) + ' – ' + fmtDate(o.end) + '</dd></div>' + (o.claim ? '<div><dt>Claim by</dt><dd>' + fmtDate(o.claim) + '</dd></div>' : '<div><dt>Claim</dt><dd>No claim needed</dd></div>') + '</dl>' +
    '<a class="primary campaign-action" href="#offer/' + o.id + '/items">' + productsLink + '</a></div>' +
    '<div class="campaign-products">' + items.slice(0, 2).map(p => '<a href="#product/' + p.id + '">' + image(p, true) + '</a>').join("") + '</div></section>' +
    '<section class="shelf" id="eligible-models"><h2>' + productsHeading + '</h2>' + grid(items) + '</section>' +
    '<details class="terms"><summary>How the offer works</summary><ol>' + o.steps.map(s => '<li>' + esc(s) + '</li>').join("") + '</ol><p class="muted">Sample offer terms.</p></details>';
}
// ---------- Partner landing pages ----------
// Same building blocks as the live partner pages (brand hero, featured promotions, category tiles, product grids,
// brand story), reordered so products come before the story. Artwork is the partners' own, from pcx.com.ph.
const PA = (key, file) => "/partner-assets/" + key + "/" + file;
const kindLabel = { gpu: "Graphics cards", monitor: "Monitors", laptop: "Laptops", desktop: "Desktop PCs", keyboard: "Keyboards", mouse: "Mice", headset: "Headsets", power: "Power supplies" };
const pick = key => placements.find(x => x.key === key);
const landing = {
  "taiwan-excellence": { name: "Taiwan Excellence", compose: true, viaItems: true,
    tagline: "The best made in Taiwan. Award-winning brands chosen for innovation, design and quality.",
    test: p => ["ASUS", "Acer", "MSI", "Gigabyte"].includes(p.vendor),
    members: ["Acer", "ADATA", "AOpen", "ASRock", "ASUS", "AVerMedia", "BenQ", "Cooler Master", "D-Link", "G.Skill", "Gigabyte", "InWin", "MSI", "PowerColor", "QNAP", "Synology", "TeamGroup", "Thermaltake"],
    promos: [
      { img: "1800x600-Taiwan-Pre-Holiday-Diskwento-Deals.jpg", title: "Pre-holidays Diskwento Deals", note: "Save up to ₱750 on Taiwan tech brands", start: "2026-09-15", end: "2026-10-31" },
      { img: "Taiwan-Excellnec-Home-Credit-Web-banner.jpg", title: "Brand discount promo with Home Credit", note: "Discounts on Taiwan brands paid with Home Credit", start: "2026-06-01", end: "2026-08-31" }],
    story: [
      { img: "BCV1.jpg", art: true }, { img: "BCV2.jpg", art: true }, { img: "4major.webp", art: true }, { img: "BV1.webp", art: true }, { img: "Symbol.webp", art: true }] },
  amd: { name: "AMD", dark: true, hero: ["PCX_Gaming_Radeon9070XT_1800x600.jpg", "PCX_Gaming_Radeon9070XT_750x1100.jpg"],
    tagline: "Ryzen processors and Radeon graphics for gaming, creating and everyday speed.",
    test: p => /radeon|ryzen/i.test(p.name),
    campaigns: [{ img: "AMD_AMD4_-_PCX_1800x600px.jpg", title: "10 years of AM4", href: "#search/ryzen" }],
    story: [
      { img: "1800x400-AMD-WC1.jpg", wide: true, title: "Immersion starts here", text: "Ryzen processors and Radeon graphics bring the speed and visuals that pull you into the game." },
      { img: "1800x400-AMD-WC2.jpg", wide: true, title: "Build the future", text: "From a first build to a dream setup, Ryzen and Radeon RX bring tomorrow’s gaming to your desk." },
      { img: "1800x400-AMD-WC3.jpg", wide: true, title: "Built for big moments", text: "Pre-built Ryzen and Radeon desktops, ready to game out of the box." },
      { img: "1800x400-AMD-WC4.jpg", wide: true, title: "Game. Create. Anywhere.", text: "Ryzen laptops pair strong performance with dependable battery life." },
      { img: "Introducing-AMD-Radeon.jpg", title: "AMD Radeon RX 9000 Series", text: "RDNA 4 architecture with ray tracing and AI accelerators, plus continuous AMD Software updates." },
      { img: "AMD-Fidelity-FX.jpg", title: "Future-ready with AI", text: "Up to 16 GB of memory and FidelityFX Super Resolution for higher frame rates." }] },
  asus: { name: "Powered by ASUS", logo: "Powered_by_ASUS_LOGO.png", hero: ["PBA-Choice-of-Champions-1800x600.jpg"], offerPartner: "ASUS",
    tagline: "PC Express custom PCs built with ASUS hardware. The choice of champions.",
    placement: "asus",
    campaigns: [{ img: "1800x600-ASUS-4yr-Warranty.jpg", title: "4-year warranty on ASUS components", href: "#help" }, { img: "1800-x-600-ASUS-MB-Express-warranty.jpg", title: "Motherboard express warranty", href: "#help" }],
    feature: { img: "../pcx/750-x-1100-ASUS-Foundation.jpg", title: "PCX Desktops Foundation Series", test: p => p.vendor === "PCX" },
    tiles: [{ img: "ROG_AI_Gaming_Tumbnails.jpg", label: "ROG AI gaming", href: "#search/asus" }, { img: "TUF_Gaming_Tumbnails.jpg", label: "TUF Gaming", href: "#search/asus" }] },
  "asus-agent": { name: "ASUS Agent Computer", hero: ["1800x600-ASUS-AI-AGENT-PC.jpg", "750x1100-ASUS-AI-AGENT-PC.jpg"],
    tagline: "AI-ready PCs for local, cloud or hybrid AI, built on ASUS chassis, boards and graphics.",
    test: p => p.vendor === "ASUS" || p.kind === "desktop",
    tiles: [{ img: "item-case.png", label: "Chassis", href: "#search/asus" }, { img: "item-mb.png", label: "Motherboards", href: "#search/asus" }, { img: "item-gpu.png", label: "Graphics cards", href: "#shop/gpu" }, { img: "item-psu.png", label: "Power supplies", href: "#shop/power" }, { img: "item-cooling.png", label: "Cooling", href: "#search/asus" }],
    story: [
      { img: "feature-1.jpg", title: "Agents that work for you", text: "Run AI assistants on your own PC, in the cloud, or both." },
      { img: "pic_01.jpg", title: "Aesthetic finesse with Aura Sync", text: "Matched lighting across case, board, graphics and cooling." },
      { img: "pic_AI.jpg", title: "The ASUS AI PC ecosystem", text: "Hardware tuned for AI workloads, with ASUS support behind every part." }] },
  nvidia: { name: "NVIDIA", dark: true, hero: ["windows_1280_01_GF_DLSS4.5_Hero_1280x300.jpg"], heroRatio: "1280 / 300", offerPartner: "NVIDIA", placement: "nvidia",
    tagline: "GeForce RTX graphics cards, laptops and gaming PCs. Upgrade to DLSS 4.5.",
    tiles: [{ img: "windows_1280_00_NV_RTX_AI_PC_Home_Page_Square_375x375_resize.jpg", label: "RTX AI PCs", href: "#shop/laptops" }, { img: "windows_1280_0_GF_RTX_50Series_Brand_Store_Home_Square_375x375.jpg", label: "GeForce RTX 50 Series", href: "#search/rtx 50" }, { img: "windows_1280_40-series-all-Tiles.jpg", label: "GeForce RTX 40 Series", href: "#search/rtx 40" }, { img: "windows_1280_30-series-all-Tiles.jpg", label: "GeForce RTX 30 Series", href: "#search/rtx 30" }],
    story: [
      { img: "promoBannerL1280X580_2_GF_RTX_50Series_Platform_Copy_1280x580.jpg", art: true },
      { img: "promoBannerL1280X580_5_GF_RTX_50Series_DLSS4_1280x580.jpg", art: true },
      { img: "promoBannerL1280X580_8_GF_RTX_50Series_AI_PCs_1280x580.jpg", art: true }] },
  intel: { name: "Intel", hero: ["1800x600-INTEL-ULTRA-PC-DIY.jpg"], offerPartner: "Intel", placement: "intel",
    tagline: "Intel Core Ultra desktops and laptops. Game at your peak, create without pause.",
    campaigns: [{ img: "1800x600px-Intel-Ultra-Series-3-Laptops.jpg", title: "Intel Core Ultra Series 3 laptops", href: "#shop/laptops" }, { img: "Intel-14th-Gen-1800x600.jpg", title: "14th Gen Intel Core processors", href: "#shop/desktop" }],
    tiles: [{ img: "Intel-Ultra-DT-350x250.jpg", label: "Core Ultra desktops", href: "#shop/desktop" }, { img: "350x250-Intel-14th-Gen.jpg", label: "14th Gen Core", href: "#shop/desktop" }, { img: "350px-x-250px-Intel-Ultra-3-Series.png", label: "Core Ultra laptops", href: "#shop/laptops" }] },
  microsoft: { name: "Microsoft", hero: ["1800x600px-M365-Oct-2026.jpg", "750x1100-M365-Oct-2026.jpg"],
    tagline: "Windows 11 PCs and Microsoft 365, set up and ready to use.",
    test: p => ["laptop", "desktop"].includes(p.kind),
    campaigns: [{ img: "1800x600-Windows-Oct2026.jpg", title: "Windows 11 laptops", href: "#shop/laptops" }, { img: "AMD-Windows-Laptop-1800x600.jpg", title: "AMD Windows 11 laptops", href: "#shop/laptops" }],
    tiles: [{ img: "350x250-Intel-Windows-2026.jpg", label: "Intel Windows 11 devices", href: "#shop/laptops" }, { img: "AMD-Windows-Laptop-350x250.jpg", label: "AMD Windows 11 devices", href: "#shop/laptops" }, { img: "350x250M365Oct2026.png", label: "Microsoft 365", href: "#help" }] },
  lenovo: { name: "Lenovo", hero: ["1800x600-Lenovo-laptop-Promo_Oct_2026.jpg", "750x1100-Lenovo-laptop-Promo-Oct-2026.jpg"],
    tagline: "Legion, LOQ, Yoga and ThinkPad laptops with PC Express warranty.",
    test: p => p.vendor === "Lenovo",
    promos: [{ img: "1800x600-Lenovo-laptop-Promo_Oct_2026.jpg", title: "Lenovo Holiday Promo 2026", note: "SM gift pass with selected Lenovo laptops", start: "2026-10-15", end: "2026-12-31" }],
    campaigns: [{ img: "1800x600_LOQ.jpg", title: "Lenovo LOQ", href: "#shop/laptops" }, { img: "1800x600_Legion_7i.jpg", title: "Lenovo Legion 7i", href: "#shop/laptops" }, { img: "Brand_Banner_Yoga_1800_x_600_px_Desktop.jpg", title: "Lenovo Yoga", href: "#shop/laptops" }] },
  msi: { name: "Powered by MSI", hero: ["1800px_x_600px_Desktop_Main_Slider.jpg", "750px_x_1100px_Mobile_Main_Slider.jpg"],
    tagline: "PC Express Maven desktops and MSI graphics, boards and power.",
    test: p => p.vendor === "MSI",
    tiles: [{ img: "MSI-RTX50-AI-500x500.jpg", label: "MSI GeForce RTX 50", href: "#shop/gpu" }, { img: "MSI-Intel-MB-500x500.jpg", label: "MSI motherboards", href: "#search/msi" }, { img: "MSI-AI-Era-500x500.jpg", label: "AI-era desktops", href: "#shop/desktop" }, { img: "1_Desktop.jpg", label: "MSI desktop PCs", href: "#shop/desktop" }] },
  samsung: { name: "Samsung Monitors", hero: ["1800x600-Samsung-Odyssey-OLED-G8.jpg", "750x1100-Samsung-Odyssey-OLED-G8.jpg"],
    tagline: "Odyssey gaming monitors and Samsung AI smart monitors.",
    test: p => p.kind === "monitor",
    campaigns: [{ img: "1800x600-Samsung-AI-Monitor.jpg", title: "Samsung AI Smart Monitor", href: "#shop/monitor" }] },
  "mini-pc": { name: "Mini PCs", hero: ["1800x600-main-ASUS-NUC.jpg", "750x1100-main.jpg"],
    tagline: "Small, powerful desktops from ASUS NUC, ROG NUC and GMKtec.",
    test: p => p.kind === "desktop",
    tiles: [{ img: "Asus_NUC_350x250.jpg", label: "ASUS NUC", href: "#shop/desktop" }, { img: "ASUS_ROG_NUC_350x250.jpg", label: "ASUS ROG NUC", href: "#shop/desktop" }, { img: "GKMTEC_NUC_350x250.jpg", label: "GMKtec NUC", href: "#shop/desktop" }] },
  business: { name: "Business Solutions", hero: ["1800p_x_600p_Business_solutions.jpg", "750p_x_1100p_Business_Solution.jpg"],
    tagline: "Servers, storage, surveillance and office PCs, with a Sales team for quotes.",
    test: p => ["desktop", "monitor", "keyboard", "mouse"].includes(p.kind),
    campaigns: [{ img: "1800p_x_600p_-_NAS.jpg", title: "Data management with NAS", href: "#help" }, { img: "1800p_x_600p_-_HIKVISION_COLORVU.jpg", title: "Hikvision ColorVu surveillance", href: "#help" }],
    tiles: [{ img: "350x250-Server-Solutions.jpg", label: "Server solutions", href: "#help" }, { img: "350x250-NAS.jpg", label: "Network storage", href: "#help" }] },
};
const stateOf = (o, d = demoDate) => d < o.start ? "upcoming" : d > o.end ? "ended" : "live";
function landingProducts(L) {
  const pl = L.placement && pick(L.placement);
  return pl ? arrange(pl.items, pl.hero) : arrange(products.filter(L.test).map(p => p.id));
}
function partnerPage(key, focus) {
  const L = landing[key];
  if (!L) return missing();
  sessionViews[key] = (sessionViews[key] ?? 0) + 1;
  const color = stagePartners.find(([k]) => k === key)?.[2] ?? "#0b45a8";
  const list = landingProducts(L);
  const heroArt = L.compose
    ? taiwanArtwork()
    : '<picture>' + (L.hero[1] ? '<source media="(max-width: 700px)" srcset="' + PA(key, L.hero[1]) + '">' : '') + '<img src="' + PA(key, L.hero[0]) + '" alt="' + esc(L.name) + '" width="1800" height="600" fetchpriority="high"></picture>';
  // Offers: the store's own offer records for this partner plus dated partner promos. Ended ones leave the page.
  const ownOffers = offers.filter(o => (L.offerPartner && o.partner === L.offerPartner) || (L.viaItems && o.items.some(id => L.test(byId.get(id)))));
  const promos = (L.promos ?? []).map(p => ({ ...p, st: stateOf(p) }));
  const liveOwn = ownOffers.filter(o => offerStatus(o) !== "ended"), livePromos = promos.filter(p => p.st !== "ended");
  const liveCount = liveOwn.length + livePromos.length + (L.campaigns ?? []).length;
  const ended = [...ownOffers.filter(o => offerStatus(o) === "ended").map(o => ({ title: o.title, end: o.end, img: "/pcx-assets/" + o.art })),
    ...promos.filter(p => p.st === "ended").map(p => ({ title: p.title, end: p.end, img: PA(key, p.img) }))];
  const promoCard = p => '<article class="lp-promo"><img src="' + PA(key, p.img) + '" alt="" width="1800" height="600" loading="lazy"><div><h3>' + esc(p.title) + '</h3><p>' + esc(p.note) + '</p><p class="fine">' + (p.st === "upcoming" ? "Starts " + fmtDate(p.start) : "Valid until " + fmtDate(p.end)) + '</p></div></article>';
  const campaign = c => '<a class="lp-promo" href="' + c.href + '"><img src="' + PA(key, c.img) + '" alt="" width="1800" height="600" loading="lazy"><div><h3>' + esc(c.title) + '</h3><span class="pane-cta">Shop now <span aria-hidden="true">›</span></span></div></a>';
  const offersHtml = liveCount ? '<section class="shelf lp-offers" id="lp-offers"><div class="row-head"><div><h2>Featured promotions</h2></div></div>' +
    (liveOwn.length ? '<div class="offer-tiles">' + liveOwn.map(offerTile).join("") + '</div>' : '') +
    (livePromos.length || L.campaigns?.length ? '<div class="lp-promos">' + livePromos.map(promoCard).join("") + (L.campaigns ?? []).map(campaign).join("") + '</div>' : '') +
    (liveCount ? '' : '<p class="muted">No live promotion right now. The products below are at regular prices.</p>') +
    '</section>' : '';
  const tiles = L.tiles?.length ? '<section class="shelf lp-tiles" id="lp-cats"><h2>Shop by category</h2><div class="lp-tile-grid">' + L.tiles.map(t =>
    '<a class="lp-tile" href="' + t.href + '"><img src="' + PA(key, t.img) + '" alt="" loading="lazy"><span>' + esc(t.label) + '</span></a>').join("") + '</div></section>' : '';
  const featured = L.feature ? arrange(products.filter(L.feature.test).map(p => p.id)) : [];
  const feature = featured.length ? '<section class="shelf lp-feature"><img src="' + PA(key, L.feature.img) + '" alt="' + esc(L.feature.title) + '" loading="lazy"><div><div class="row-head"><div><h2>' + esc(L.feature.title) + '</h2></div><a class="text-link" href="#shop/desktop">See all <span aria-hidden="true">›</span></a></div>' + grid(featured) + '</div></section>' : '';
  const allKinds = [...new Set(list.map(p => p.kind))];
  const big = allKinds.filter(k => list.filter(p => p.kind === k).length > 1 || allKinds.length === 1);
  const groups = big.map(k => [k, kindLabel[k] ?? k, list.filter(p => p.kind === k)]);
  const rest = list.filter(p => !big.includes(p.kind));
  if (rest.length) groups.push(["more", groups.length ? "More from " + L.name : L.name, rest]);
  const shelves = '<div id="lp-shop">' + groups.map(([k, label, items]) => {
    const r = items.filter(p => p.status === "buy").length;
    return '<section class="shelf lp-shelf" id="shelf-' + k + '"><div class="row-head"><div><h2>' + esc(label) + '</h2><p class="muted">' + items.length + (items.length === 1 ? ' model' : ' models') + ' · ' + r + ' ready to ship</p></div>' + (k === "more" ? '' : '<a class="text-link" href="#shop/' + (k === "laptop" ? "laptops" : k) + '">See all <span aria-hidden="true">›</span></a>') + '</div>' +
      grid(items) + '</section>';
  }).join("") + '<p class="lp-none muted" hidden>Nothing ready to ship here today. Switch off “Ready to ship only” to see order-basis items, or <a href="#help">ask Sales</a>.</p></div>';
  const art = (L.story ?? []).filter(b => b.art), told = (L.story ?? []).filter(b => !b.art);
  const story = L.story?.length ? '<section class="lp-story' + (L.dark ? ' dark' : '') + '" id="lp-about"><h2' + (art.length ? '' : ' class="sr-only"') + '>About ' + esc(L.name) + '</h2>' +
    (art.length ? '<div class="lp-gallery">' + art.map(b => '<figure><img src="' + PA(key, b.img) + '" alt="" loading="lazy"></figure>').join("") + '</div>' : '') + told.map((b, i) => b.wide
    ? '<article class="lp-wide"><img src="' + PA(key, b.img) + '" alt="" loading="lazy"><div><h3>' + esc(b.title) + '</h3><p>' + esc(b.text) + '</p></div></article>'
    : '<article class="lp-split' + (i % 2 ? ' flip' : '') + '"><img src="' + PA(key, b.img) + '" alt="" loading="lazy"><div><h3>' + esc(b.title) + '</h3><p>' + esc(b.text) + '</p></div></article>').join("") + '</section>' : '';
  const members = L.members ? '<section class="shelf lp-members"><h2>Taiwan Excellence brands at PC Express</h2><div class="lp-member-list">' + L.members.map(b => '<a href="#search/' + encodeURIComponent(b) + '">' + esc(b) + '</a>').join("") + '</div></section>' : '';
  const jump = [["lp-offers", "Promotions", offersHtml], ["lp-cats", "Categories", tiles], ["lp-shop", "Products", true], ["lp-about", "About", story]].filter(([, , on]) => on);
  return '<div class="lp' + (L.dark ? ' is-dark' : '') + '" data-partner="' + key + '" style="--brand:' + color + '">' + breadcrumb(L.name) +
    '<section class="lp-hero' + (L.compose ? ' compose' : '') + '"' + (L.heroRatio ? ' style="--ratio:' + L.heroRatio + '"' : '') + '>' + heroArt + '</section>' +
    '<div class="lp-bar"><div class="lp-id">' + (L.logo ? '<img class="lp-logo" src="' + PA(key, L.logo) + '" alt="" width="160" height="60">' : '<span class="lp-mark">' + (wordmark(key) ?? '<b class="wm">' + esc(L.name) + '</b>') + '</span>') + '<div><h1>' + esc(L.name) + '</h1><p>' + esc(L.tagline) + '</p></div></div>' +
    '<label class="lp-toggle"><input type="checkbox" id="lp-ready"> Ready to ship only</label></div>' +
    '<nav class="lp-nav" aria-label="On this page">' + jump.map(([id, label]) => '<button type="button" data-jump="' + id + '">' + label + '</button>').join("") + '</nav>' +
    offersHtml + tiles + feature + shelves + story + members + '</div>';
}

// ---------- Search and filters ----------
const compactFilters = matchMedia("(max-width: 900px)");
compactFilters.addEventListener("change", event => {
  const panel = document.querySelector(".filter-panel");
  if (panel) panel.open = !event.matches;
});
function browse(kind, keyword, preset) {
  const heading = keyword ? "Results for “" + keyword + "”" : categories.find(([id]) => id === kind)?.[1] ?? "All products";
  const pool = products.filter(p => inCategory(p, kind));
  const brands = [...new Set(pool.map(p => p.vendor))].sort();
  const gpu = kind === "gpu" || /rtx|gpu|graphics|radeon|rx\s?\d/i.test(keyword);
  const facet = (name, value, label) => '<label class="check"><input type="checkbox" name="' + name + '" value="' + esc(value) + '"' + (preset?.[name]?.includes(value) ? ' checked' : '') + '> ' + label + ' <span class="count" data-count="' + name + ':' + esc(value) + '"></span></label>';
  const partNavigation = kind === "parts" || partCategories.has(kind)
    ? '<nav class="part-categories" aria-label="PC Parts categories">' + [["All PC Parts", "#shop/parts"], ...partLinks].map(([name, href]) =>
      '<a href="' + href + '"' + (href === "#shop/" + kind ? ' aria-current="page"' : '') + '>' + esc(name) + '</a>').join("") + '</nav>'
    : "";
  const partFilters = (partCategories.get(kind)?.filters ?? []).map(field => {
    const options = [...new Set(pool.map(p => p.specifications?.[field]).filter(Boolean))].sort();
    return '<fieldset><legend>' + esc(field) + '</legend>' + options.map(value => facet("spec-" + field, value, esc(value))).join("") + '</fieldset>';
  }).join("");
  return breadcrumb(keyword ? "Search" : heading) + '<h1>' + esc(heading) + '</h1>' + partNavigation + '<div class="browse-layout"><details class="filter-panel"' + (compactFilters.matches ? '' : ' open') + '><summary>Filters and sort <span id="filter-count"></span></summary><form id="filters" class="filters v2" aria-label="Filter products">' +
    '<div class="filter-head"><h2>Filters</h2><button type="reset" class="link">Clear</button></div>' +
    '<fieldset><legend>Availability</legend>' + Object.keys(STATE).map(s => facet("state", s, STATE[s].label)).join("") + '</fieldset>' +
    '<fieldset><legend>Brand</legend>' + brands.map(b => facet("brand", b, esc(b))).join("") + '</fieldset>' +
    (gpu ? '<fieldset><legend>GPU memory</legend>' + ["6 GB", "8 GB", "16 GB", "32 GB"].map(v => facet("vram", v, v)).join("") + '</fieldset>' +
      '<fieldset><legend>Card length</legend><label>Max length (mm) <input name="maxlen" type="number" min="150" max="400" step="10" placeholder="Any"></label></fieldset>' : '') +
    (kind === "monitor" ? '<fieldset><legend>Resolution</legend>' + facet("res", "Full HD", "Full HD") + facet("res", "QHD", "QHD") + '</fieldset>' +
      '<fieldset><legend>Refresh rate</legend>' + facet("hz", "144", "144 Hz+") + facet("hz", "180", "180 Hz+") + '</fieldset>' : '') +
    partFilters + '<fieldset><legend>Price</legend><label>Up to (₱) <input name="budget" type="number" min="1" max="10000000" placeholder="No limit"></label></fieldset>' +
    '<label>Sort <select name="sort"><option value="">Best match · ready to ship first</option><option value="price">Price: low to high</option><option value="popular">Most ordered (30 days)</option></select></label>' +
    '</form></details><section><div class="result-bar"><p id="result-count" class="result-count" aria-live="polite"></p><div id="active-filters" class="active-filters"></div></div><div id="exact"></div><div id="results"></div></section></div>';
}
function matches(p, values, skip) {
  const has = (k, v) => !values.getAll(k).length || skip === k || values.getAll(k).includes(v);
  const sp = specs[p.id] ?? {};
  const budget = Number(values.get("budget")), maxlen = Number(values.get("maxlen"));
  const partFilters = new Set([...values.keys()].filter(key => key.startsWith("spec-")));
  return has("state", p.status) && has("brand", p.vendor) &&
    (!values.getAll("vram").length || skip === "vram" || values.getAll("vram").some(v => (sp.vram ?? "").startsWith(v))) &&
    has("res", sp.res) && (!values.getAll("hz").length || skip === "hz" || values.getAll("hz").some(h => (sp.hz ?? 0) >= Number(h))) &&
    (!budget || p.pricePhp <= budget) && (!maxlen || (sp.length && parseInt(sp.length) <= maxlen)) &&
    [...partFilters].every(key => has(key, p.specifications?.[key.slice(5)]));
}
function filterProducts(kind, keyword) {
  const form = document.querySelector("#filters");
  if (!form) return;
  const values = new FormData(form);
  const words = keyword.toLowerCase().replace(/\brtxx\b/g, "rtx").split(/\s+/).filter(Boolean);
  const pool = products.filter(p => inCategory(p, kind) && words.every(w => searchText(p).includes(w)));
  const exact = keyword.length >= 5 ? products.find(p => modelCode(p) && modelCode(p).toLowerCase() === keyword.toLowerCase().trim()) : null;
  const picked = pool.filter(p => matches(p, values));
  const sort = values.get("sort");
  picked.sort(sort === "price" ? (a, b) => a.pricePhp - b.pricePhp : sort === "popular" ? (a, b) => b.paidOrdersLast30Days - a.paidOrdersLast30Days
    : (a, b) => STATE[a.status].rank - STATE[b.status].rank || b.paidOrdersLast30Days - a.paidOrdersLast30Days);
  for (const el of form.querySelectorAll("[data-count]")) {
    const [k, v] = el.dataset.count.split(":");
    const n = pool.filter(p => matches(p, values, k)).filter(p => k === "state" ? p.status === v : k === "brand" ? p.vendor === v :
      k === "vram" ? (specs[p.id]?.vram ?? "").startsWith(v) : k === "res" ? specs[p.id]?.res === v :
      k.startsWith("spec-") ? p.specifications?.[k.slice(5)] === v : (specs[p.id]?.hz ?? 0) >= Number(v)).length;
    el.textContent = "(" + n + ")";
    el.closest("label").classList.toggle("zero", n === 0);
  }
  document.querySelector("#result-count").textContent = picked.length + (picked.length === 1 ? " product" : " products");
  const activeFilters = [...values.entries()].filter(([k, v]) => v && k !== "sort");
  document.querySelector("#filter-count").textContent = activeFilters.length ? "(" + activeFilters.length + " active)" : "";
  document.querySelector("#active-filters").innerHTML = activeFilters.map(([k, v]) =>
    '<span>' + esc(k === "state" ? STATE[v].label : k === "budget" ? "Up to ₱" + v : k === "maxlen" ? "≤ " + v + " mm" : v) + '</span>').join("");
  document.querySelector("#exact").innerHTML = exact ? '<div class="exact-match"><p class="kicker">Exact model match · shown even when not in stock</p>' + grid([exact]) + '</div>' : "";
  document.querySelector("#results").innerHTML = picked.length ? grid(picked) : '<div class="empty"><h2>No exact matches</h2><p>Remove a filter, or ask Sales to source this model for you.</p><button type="button" class="primary" data-action="source" data-id="desktop-in">Ask Sales to source it</button></div>';
}

// ---------- Product page ----------
// Configuration examples for the demo catalog. Values may vary by retail SKU.
const demoSpecifications = {
  "laptop-lenovo": {
    Processor: "AMD Ryzen 7 250", Graphics: "GeForce RTX 5060 · 8 GB GDDR7", RAM: "16 GB DDR5-5600",
    Storage: "512 GB M.2 NVMe SSD", Display: "15.6″ Full HD · 144 Hz", "Operating system": "Windows 11 Home",
    Connectivity: "Wi-Fi, Bluetooth and Ethernet", Ports: "USB, HDMI and audio", Keyboard: "RGB backlit",
  },
  "laptop-a16": {
    Processor: "AMD Ryzen 7", Graphics: "GeForce RTX 5050 · 8 GB GDDR7", RAM: "16 GB DDR5",
    Storage: "512 GB NVMe SSD", Display: "16″ WUXGA · 165 Hz", "Operating system": "Windows 11 Home",
    Connectivity: "Wi-Fi and Bluetooth", Ports: "USB-A, USB-C, HDMI and audio", Keyboard: "Backlit",
  },
  "laptop-msi": {
    Processor: "Intel Core i7 HX", Graphics: "GeForce RTX 5070 · 8 GB GDDR7", RAM: "16 GB DDR5",
    Storage: "1 TB NVMe SSD", Display: "15.6″ QHD · 165 Hz", "Operating system": "Windows 11 Home",
    Connectivity: "Wi-Fi, Bluetooth and Ethernet", Ports: "USB-A, USB-C, HDMI and audio", Keyboard: "RGB backlit",
  },
  "desktop-ms": {
    Processor: "Intel Core i5", Graphics: "GeForce RTX 3050", RAM: "16 GB DDR4", Storage: "1 TB NVMe SSD",
    "Operating system": "Windows 11 Home", Networking: "Gigabit Ethernet", "Case type": "Mid tower",
  },
  "desktop-in": {
    Processor: "Intel Core i5", Graphics: "GeForce RTX 3050", RAM: "16 GB DDR4", Storage: "512 GB NVMe SSD",
    "Operating system": "Windows 11 Home", Networking: "Gigabit Ethernet", "Case type": "Mid tower",
  },
  "audio-usb": { Connection: "USB-A wired", Audio: "Stereo", "Wearing style": "On-ear", Microphone: "Noise-reducing boom mic", Controls: "Inline volume and mute" },
  "audio-stereo": { Connection: "3.5 mm wired", Audio: "Stereo", "Wearing style": "Over-ear", Microphone: "Swivel-to-mute boom mic", Controls: "On-ear volume" },
  "audio-wireless": { Connection: "Bluetooth", Audio: "Stereo", "Wearing style": "On-ear", Microphone: "Dual beamforming microphones", Charging: "USB-C" },
  "audio-studio": { Connection: "2.4 GHz wireless", Audio: "Stereo", "Wearing style": "Over-ear", Microphone: "Boom mic", Charging: "USB-C" },
  mouse: { Connection: "2.4 GHz USB receiver", Sensor: "Optical", Resolution: "1,000 DPI", Buttons: "3", Power: "AA battery" },
  "mouse-m185": { Connection: "2.4 GHz USB receiver", Sensor: "Optical", Resolution: "1,000 DPI", Buttons: "3", Power: "AA battery" },
  "mouse-g102": { Connection: "USB-A wired", Sensor: "Optical", Resolution: "Up to 8,000 DPI", Buttons: "6", Lighting: "LIGHTSYNC RGB" },
  keyboard: { Connection: "USB-A wired", Layout: "Full-size with number pad", Switches: "Membrane", Lighting: "RGB", Controls: "Volume knob" },
  "keyboard-k120": { Connection: "USB-A wired", Layout: "Full-size with number pad", Switches: "Membrane", Lighting: "None", Design: "Low-profile keys" },
  "keyboard-g213": { Connection: "USB-A wired", Layout: "Full-size with number pad", Switches: "Membrane", Lighting: "LIGHTSYNC RGB", Controls: "Dedicated media keys" },
  "psu-650": { Wattage: "650 W", Efficiency: "80 PLUS Bronze", "Form factor": "ATX", Cabling: "Fixed cables", "Fan size": "120 mm", Connectors: "24-pin ATX, EPS, PCIe 6+2-pin and SATA" },
  "psu-850": { Wattage: "850 W", Efficiency: "80 PLUS Gold", "Form factor": "ATX 3.1", Cabling: "Fully modular", "Fan size": "120 mm", Connectors: "24-pin ATX, EPS, PCIe 16-pin, PCIe 6+2-pin and SATA" },
  "monitor-fhd": { Inputs: "HDMI and VGA", "Stand adjustment": "Tilt", "Aspect ratio": "16:9" },
  "monitor-ek251q": { Inputs: "HDMI and VGA", "Stand adjustment": "Tilt", "Aspect ratio": "16:9" },
  "monitor-qhd": { Inputs: "DisplayPort and HDMI", "Stand adjustment": "Tilt", "Aspect ratio": "16:9" },
};
function specRows(p, variant = "") {
  const s = specs[p.id];
  let rows = Object.entries(p.specifications ?? demoSpecifications[p.id] ?? {});
  if (s?.chip) {
    rows = [["GPU", s.chip], ["Video memory", s.vram], ["Memory bus", s.bus], ["Card length", s.length],
      ["Power connector", s.power], ["Recommended PSU", s.psu], ["Display outputs", "DisplayPort and HDMI"]];
  } else if (s?.size) {
    rows = [["Screen size", s.size], ["Resolution", s.res], ["Refresh rate", s.hz + " Hz"], ["Panel", s.panel], ...rows];
  }
  if (p.id === "desktop-in") rows.push(["Package", variant === "complete" ? "Desktop, monitor, keyboard and mouse" : "Desktop tower"]);
  const model = modelCode(p);
  return [...rows, ["Brand", p.vendor], ...(model ? [["Model code", model]] : [])];
}
function details(p, variant = "") {
  const hasVariants = p.id === "desktop-in";
  const s = hasVariants && variant === "complete" ? "restock" : p.status;
  const price = hasVariants && variant === "complete" ? { ...p, pricePhp: p.pricePhp + 4605 } : p;
  const next = {
    buy: "Sales confirms stock and your total before you pay.",
    quote: "Sales confirms the price and lead time before payment.",
    price: "Ask Sales for today’s price and availability.",
    check: "Ask Sales to check online and branch stock.",
    restock: "Get an alert when this configuration is back.",
  }[s];
  const compatible = p.specifications ? (p.accessoryIds ?? []).filter(id => byId.get(id)?.status === "buy" && !basket.has(id)) : [];
  const rows = recs("product", p.id)
    .map(row => ({ ...row, items: row.items.filter(item => !compatible.includes(item.productId)) }))
    .filter(row => row.items.length)
    .sort((a, b) => s !== "buy" ? /similar/i.test(b.title) - /similar/i.test(a.title) : 0);
  if (compatible.length) rows.unshift({
    id: "compatible-parts",
    title: "Compatible parts",
    items: compatible.map(productId => ({ productId, reason: "" })),
  });
  const offersHere = liveOffersFor(p.id);
  const model = modelCode(p);
  const brand = p.vendor === "PCX" ? wordmark("pcx-desktop") : esc(p.vendor);
  return breadcrumb(p.category) + '<section class="offer-layout v2">' +
    '<header class="product-heading"><h1>' + esc(p.name) + '</h1>' +
    '<p class="product-model">' + brand + (model && !p.name.includes(model) ? ' · ' + esc(model) : '') + '</p></header>' +
    '<div class="detail-art">' + image(p, true) + '</div><div class="offer-panel buy-box">' +
    '<div class="product-price">' + priceLine(price, s) + '<p class="product-stock"><span class="' + availClass(p, s) + '">' + availText(p, s) + '</span>' +
    (p.paidOrdersLast30Days ? '<span>' + p.paidOrdersLast30Days + ' sold</span>' : '') + '</p></div>' +
    offersHere.map(o => '<a class="product-offer" href="#offer/' + o.id + '"><span><strong>' + esc(o.cardBenefit) + '</strong><small>' + esc(o.partner) + ' offer · Ends ' + fmtDate(o.end) + '</small></span>' + chevron(1) + '</a>').join("") +
    (hasVariants ? '<label>Package <select id="variant-select"><option value="desktop">Desktop only · order basis</option><option value="complete"' + (variant === "complete" ? ' selected' : '') + '>Complete set · out of stock</option></select></label>' : '') +
    '<div class="button-row">' + actionButton(p, s, hasVariants ? (variant || "desktop") : "") + compareButton(p) + wishButton(p) + '</div>' +
    '<p class="next-step">' + next + '</p>' +
    (s === "buy" ? '<dl class="product-fulfillment"><div><dt>Delivery</dt><dd>Metro Manila 1–3 business days<small>Provincial 3–7 business days</small></dd></div>' +
      '<div><dt>Store pickup</dt><dd>PC Express Online Paterno<small>After Sales confirms your order</small></dd></div></dl>' : '') +
    '<details class="product-policies"><summary>Payment and warranty</summary><dl><div><dt>Payment</dt><dd>iPay88, BDO link or bank transfer after Sales confirms your order.</dd></div>' +
    '<div><dt>Warranty</dt><dd>Official PC Express warranty.</dd></div></dl></details></div></section>' +
    '<section class="shelf product-specs"><h2>Key specifications</h2><dl class="spec-list">' + specRows(p, variant).map(([n, v]) => '<div><dt>' + esc(n) + '</dt><dd>' + esc(v) + '</dd></div>').join("") + '</dl>' +
    '<p class="muted small">Includes sample specs for the demo.</p></section>' +
    rows.map(pl => recRow(pl, { title: /similar/i.test(pl.title) && s !== "buy" ? "Ready to ship instead" : undefined })).join("");
}
function mobileBarFor(p, variant) {
  if (!p) { mobileBar.hidden = true; return; }
  const s = p.id === "desktop-in" && variant === "complete" ? "restock" : p.status;
  mobileBar.hidden = false;
  mobileBar.innerHTML = '<div>' + chip(s, p) + '<strong>' + money(p.pricePhp + (s === "restock" && p.id === "desktop-in" ? 4605 : 0)) + '</strong></div>' + actionButton(p, s, p.id === "desktop-in" ? (variant || "desktop") : "");
}

// ---------- Compare ----------
function comparePage(sample) {
  const ids = sample ? ["gpu-mid", "gpu-compact", "gpu-unavailable", "gpu-value"] : comparison;
  const list = ids.map(id => byId.get(id));
  if (!list.length) return emptyShoppingPage("Compare", "Compare products", "Select Compare on up to four products to see their specs side by side.", "Browse products", "#shop", "Try a sample comparison", "#compare/sample");
  const specifications = list.map(p => new Map(specRows(p)));
  const labels = [...new Set(specifications.flatMap(fields => [...fields.keys()]))];
  const rows = [["Price", list.map(p => money(p.pricePhp))], ["Availability", list.map(p => chip(p.status, p))],
    ["Offers", list.map(p => liveOffersFor(p.id).map(o => esc(o.partner) + " · " + esc(o.benefit)).join("<br>") || "—")],
    ...labels.map(l => [l, specifications.map(fields => esc(fields.get(l) ?? "—"))])];
  return breadcrumb("Compare") + '<h1>Compare ' + list.length + ' products</h1><div class="compare-tools"><label class="check"><input type="checkbox" id="diff-only"> Show only differences</label><span class="muted">Includes sample specs</span></div>' +
    '<div class="compare-scroll" tabindex="0" role="region" aria-label="Product comparison table"><table class="compare-table v2"><thead><tr><th scope="col">Product</th>' + list.map(p => '<th scope="col"><a href="#product/' + p.id + '">' + image(p) + esc(p.name) + '</a></th>').join("") + '</tr></thead><tbody>' +
    rows.map(([l, cells]) => { const same = cells.every(c => c === cells[0]); return '<tr class="' + (same ? 'same' : 'differs') + '"><th scope="row">' + esc(l) + '</th>' + cells.map(c => '<td>' + c + '</td>').join("") + '</tr>'; }).join("") +
    '<tr><th scope="row">Next step</th>' + list.map(p => '<td>' + actionButton(p) + '</td>').join("") + '</tr></tbody></table></div>';
}

// ---------- Cart ----------
const delivery = {
  metro: { label: "Delivery · Metro Manila", eta: "1–3 business days after payment", fee: 250 },
  luzon: { label: "Delivery · Luzon provinces", eta: "3–5 business days after payment", fee: 450 },
  vismin: { label: "Delivery · Visayas and Mindanao", eta: "5–7 business days after payment", fee: 650 },
  pickup: { label: "Pickup · PC Express Online Paterno", eta: "Ready after Sales confirms (same day for in-stock items)", fee: 0 },
};
let cartChoice = "", stockChanged = false;
function cartPage(sample) {
  if (sample && !basket.size) { basket.set("monitor-fhd", 1); basket.set("laptop-lenovo", 1); }
  const entries = [...basket];
  if (!entries.length) return emptyShoppingPage("Cart", "Your cart is empty", "Add an item to see pickup and delivery options.", "Continue shopping", "#shop?available=1", "Load a sample cart", "#cart/sample");
  const lines = entries.map(([id, n]) => ({ p: byId.get(id), n, changed: stockChanged && id === "monitor-fhd" }));
  const subtotal = lines.filter(l => !l.changed).reduce((a, l) => a + l.p.pricePhp * l.n, 0);
  const fee = cartChoice ? delivery[cartChoice].fee : null;
  const gifts = [...new Set(lines.flatMap(l => liveOffersFor(l.p.id)))];
  return breadcrumb("Cart") + '<h1>Your cart</h1><div class="checkout-layout v2"><div class="cart-items">' + lines.map(({ p, n, changed }) =>
    '<article class="' + (changed ? 'changed' : '') + '"><a href="#product/' + p.id + '">' + image(p) + '</a><div><h2><a href="#product/' + p.id + '">' + esc(p.name) + '</a></h2>' + (changed ? chip("restock", p) : chip(p.status, p)) +
    '<p>' + money(p.pricePhp) + ' · Qty ' + n + '</p>' + (changed ? '<p class="warn">Sold out since you added it. <button type="button" class="link" data-action="swap" data-id="monitor-ek251q">Swap to ACER 24.5″ EK251Q (₱4,400, in stock)</button> or <button type="button" class="link" data-action="restock" data-id="' + p.id + '" data-variant="">get an alert</button>.</p>' : '') +
    liveOffersFor(p.id).map(o => '<p class="offer-inline">' + esc(o.partner) + ' offer applied: ' + esc(o.benefit) + '</p>').join("") +
    '</div><button type="button" class="secondary" data-action="remove" data-id="' + p.id + '">Remove</button></article>').join("") +
    '<p class="muted small"><button type="button" class="link" data-action="simulate-stock">' + (stockChanged ? "Reset stock simulation" : "Simulate: an item sells out while it is in the cart") + '</button></p>' +
    recs("cart").map(addonList).join("") + '</div>' +
    '<aside class="order-summary v2"><h2>Order summary</h2><fieldset class="ship-options"><legend>How do you want it?</legend>' + Object.entries(delivery).map(([k, d]) =>
      '<label class="ship"><input type="radio" name="ship" value="' + k + '"' + (cartChoice === k ? ' checked' : '') + '><span><strong>' + d.label + '</strong><small>' + d.eta + '</small></span><b>' + (d.fee ? money(d.fee) : "Free") + '</b></label>').join("") + '</fieldset>' +
    '<p class="subtotal">Subtotal <strong>' + money(subtotal) + '</strong></p><p class="subtotal">Shipping <strong>' + (fee === null ? "Choose an option" : fee ? money(fee) : "Free") + '</strong></p>' +
    '<p class="subtotal total">Estimated total <strong>' + money(subtotal + (fee ?? 0)) + '</strong></p>' +
    (gifts.length ? '<p class="offer-inline">Included: ' + gifts.map(o => esc(o.benefit)).join("; ") + '</p>' : '') +
    '<button type="button" class="primary wide" data-action="checkout"' + (cartChoice ? '' : ' disabled') + '>Place order for confirmation</button>' +
    '<ol class="after-order"><li><strong>Place order</strong> · no payment yet</li><li><strong>Sales confirms</strong> stock and total, usually within 2 business hours (sample target)</li><li><strong>Pay</strong> by iPay88 or BDO link, or bank transfer</li><li><strong>Ship or pick up</strong> with tracking by SMS and email</li></ol>' +
    '<p class="muted small">Sample fees and timing. Production reads Shopify shipping rates and the Sales confirmation target.</p></aside></div>';
}

// ---------- Placement and alert operations view ----------
function ops() {
  const rows = placements.map(pl => {
    const delivered = pl.delivered + sessionViews[pl.key];
    const pct = Math.min(100, Math.round(100 * delivered / pl.committed));
    return '<tr><th scope="row">' + esc(pl.partner) + '</th><td>' + esc(pl.slot) + '</td><td>' + pl.committed.toLocaleString() + '</td><td>' + delivered.toLocaleString() + ' <small>(+' + sessionViews[pl.key] + ' this session)</small></td>' +
      '<td><div class="meter"><span style="width:' + pct + '%"></span></div>' + pct + '% · ' + (pct >= 75 ? "on track" : "behind: raise rotation") + '</td></tr>';
  }).join("");
  const counts = { ...alertSeeds };
  for (const k of alerts.keys()) counts[k.replace(/\/$/, "")] = (counts[k.replace(/\/$/, "")] ?? 0) + 1;
  const alertRows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const [id, v] = k.split("/"); const p = byId.get(id);
    return '<tr><th scope="row">' + esc(p.name.slice(0, 64)) + (v ? ' · ' + esc(v) : '') + '</th><td>' + n + '</td><td>' + (n > 20 ? "Prioritise reorder; email the waitlist when stock lands" : "Send alert on restock") + '</td></tr>';
  }).join("");
  return breadcrumb("Operations view") + '<h1>Placement and alert view</h1><p class="lede">Internal sample view: the rules the storefront follows, so Marketing, E-commerce and Sales can check them.</p>' +
    '<section class="shelf"><h2>Funded placements</h2><p class="muted">Slot order and partner exposure follow each agreement. Inside a slot, ready-to-ship items fill the first positions. A contracted hero SKU stays pinned first. No eligible SKU is removed.</p>' +
    '<div class="compare-scroll"><table class="ops-table"><thead><tr><th>Partner</th><th>Contracted slot</th><th>Weekly impressions committed</th><th>Delivered (sample)</th><th>Pacing</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
    '<section class="shelf"><h2>Homepage partner stage</h2><p class="muted">All 11 partners show on first load in the brand wall. The banner rotates every 6 seconds in the order of the Brands menu, so exposure is shared evenly. Counts are this session.</p><div class="compare-scroll"><table class="ops-table"><thead><tr><th>Partner</th><th>Banner views this session</th></tr></thead><tbody>' +
    stagePartners.map(([k, n]) => '<tr><th scope="row">' + esc(n) + '</th><td>' + heroViews[k] + '</td></tr>').join("") + '</tbody></table></div></section>' +
    '<section class="shelf"><h2>Offer schedule</h2><label>Preview the storefront on <select id="demo-date"><option value="2026-11-13"' + (demoDate === "2026-11-13" ? " selected" : "") + '>Nov 13, 2026 (today)</option><option value="2026-12-05"' + (demoDate === "2026-12-05" ? " selected" : "") + '>Dec 5, 2026</option><option value="2026-12-20"' + (demoDate === "2026-12-20" ? " selected" : "") + '>Dec 20, 2026</option></select></label>' +
    '<div class="compare-scroll"><table class="ops-table"><thead><tr><th>Offer</th><th>Dates</th><th>Status on this date</th><th>Eligible SKUs</th></tr></thead><tbody>' + offers.map(o =>
      '<tr><th scope="row"><a href="#offer/' + o.id + '">' + esc(o.title) + '</a></th><td>' + fmtDate(o.start) + ' – ' + fmtDate(o.end) + '</td><td><span class="pill ' + offerStatus(o) + '">' + offerStatus(o) + '</span></td><td>' + o.items.length + '</td></tr>').join("") + '</tbody></table></div></section>' +
    '<section class="shelf"><h2>Restock demand</h2><p class="muted">Today the live Notify Me form posts to the Shopify contact inbox. Here each signup is a structured alert by SKU and variant, sent automatically on restock and visible to Purchasing as demand.</p>' +
    '<div class="compare-scroll"><table class="ops-table"><thead><tr><th>Product / variant</th><th>Waiting shoppers</th><th>Suggested action</th></tr></thead><tbody>' + alertRows + '</tbody></table></div></section>' +
    '<section class="shelf"><h2>Quote requests this session</h2>' + (quotes.length ? '<ul>' + quotes.map(q => '<li>' + esc(q)).join("") + '</ul>' : '<p class="muted">None yet. Try “Request a quote” on an order-basis item.</p>') + '</section>';
}

function help() {
  const questions = [
    ["How do I place an order?", "Add the item to your cart, choose delivery or pickup and place your order. Sales confirms stock and your total before you pay."],
    ["Can I pick up my order?", "Choose PC Express Online Paterno in your cart and wait for Sales to confirm when it’s ready."],
    ["What does “by order” mean?", "Request a quote on the product page. Sales will confirm the current price and estimated lead time.", "#product/desktop-in", "See an order-basis product"],
    ["What if the price changes?", "Use Get today’s price on the product page to ask Sales for the current price and availability.", "#product/gpu-work", "See an example"],
    ["Can I get an alert when an item is back?", "Select Notify me on the product page to save an alert for that item. You can also browse in-stock alternatives.", "#product/gpu-unavailable", "See how stock alerts work"],
  ];
  return breadcrumb("How ordering works") + '<section class="order-faq"><h1>How ordering works</h1><div class="faq-list">' +
    questions.map(([question, answer, href, label]) =>
      '<details><summary>' + esc(question) + chevron(1) + '</summary><div><p>' + esc(answer) + '</p>' +
      (href ? '<a class="text-link" href="' + href + '">' + esc(label) + '</a>' : '') + '</div></details>'
    ).join("") + '</div></section>';
}
const reviewItems = [
  ["1 · Partner offers lead to products", "The offer tile, product links and cart use the same terms. Ended offers retire on their end date.", "#offer/asus-reward", "#offers"],
  ["2 · Funded rows keep their slots, buyable items first", "Partner rows stay in contracted positions. Inside each row, ready-to-ship items lead and a contracted hero SKU stays pinned. Pacing is visible.", "#home", "#ops"],
  ["3 · Clear product states that keep items listed", "Five states with the right action. Order-basis items keep their last listed price and lead time instead of hiding the price.", "#shop/gpu", "#product/desktop-in"],
  ["4 · Notify Me becomes a real alert and a demand signal", "Exact-variant alerts with alternatives, instead of an email to the contact inbox.", "#product/gpu-unavailable", "#ops"],
  ["5 · SKU-specific quotes", "Quantity, configuration and preferred channel, with a reference number and response target.", "#product/desktop-in", "#help"],
  ["6 · Search and filters", "Availability, brand and spec filters with counts, ready-to-ship-first ranking, and an exact model match that stays visible.", "#search/rtx", "#search/G5050-8GC"],
  ["7 · Compare with real hardware fields", "Up to four items, a compare tray, GPU rows, a differences toggle and the next step per item.", "#compare/sample", "#shop/gpu"],
  ["8 · Mobile shopping", "Categories above the hero, a shorter hero, and a sticky price and action bar on product pages.", "#home", "#product/gpu-unavailable"],
  ["9 · Cart sets expectations", "Delivery and pickup options with timing and fees, the Sales confirmation steps, offers applied, and sold-out handling.", "#cart/sample", "#help"],
  ["10 · Picks that follow the shopper, and stock counts", "Homepage picks, product-page rows and cart add-ons are ranked from what the shopper views, searches and adds, and only include items that can be bought online. Cards show units left.", "#product/gpu-mid", "#cart/sample"],
];
function review() {
  return breadcrumb("What’s improved") + '<h1>What’s improved</h1><p class="lede">Each change keeps every partner placement and every listed product, and makes it easier to buy online.</p><div class="review-list">' +
    reviewItems.map(([n, d, a, b]) => '<article><h2>' + esc(n) + '</h2><p>' + esc(d) + '</p><p><a href="' + a + '">Try it</a> · <a href="' + b + '">Related view</a></p></article>').join("") + '</div>';
}
const emptyIcons = {
  Wishlist: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  Cart: '<path d="M3 4h2l2.5 11h10L20 7H6"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
  Compare: '<path d="M7 4v14m0 0-3-3m3 3 3-3m7 5V6m0 0-3 3m3-3 3 3"/>',
};
function emptyShoppingPage(page, heading, message, label, href, sampleLabel, sampleHref) {
  return breadcrumb(page) + '<section class="shopping-empty"><svg viewBox="0 0 24 24" width="42" height="42" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + emptyIcons[page] + '</svg>' +
    '<h1>' + heading + '</h1><p>' + message + '</p><div class="shopping-empty-actions"><a class="primary" href="' + href + '">' + label + '</a>' +
    (sampleHref ? '<a class="text-link" href="' + sampleHref + '">' + sampleLabel + '</a>' : '') + '</div></section>';
}
function wishlistPage() {
  const list = memory.wish.map(id => byId.get(id)).filter(Boolean);
  if (!list.length) return emptyShoppingPage("Wishlist", "Your wishlist is empty", "Use the heart on a product page to save it for later.", "Browse products", "#shop");
  return breadcrumb("Wishlist") + '<h1>Your wishlist</h1><p class="muted">' +
    list.length + (list.length === 1 ? ' item' : ' items') + ' saved in this browser.</p>' + grid(list);
}
const missing = () => '<h1>Page unavailable</h1><p><a href="#home">Return home</a></p>';

const shelfTracks = ".partner-row > .shop-grid, .picks > .shop-grid";
function updateShelfArrows(track) {
  const arrows = track.parentElement.querySelector(".shelf-arrows");
  const remaining = track.scrollWidth - track.clientWidth;
  arrows.hidden = remaining <= 1;
  arrows.firstElementChild.setAttribute("aria-disabled", String(track.scrollLeft <= 1));
  arrows.lastElementChild.setAttribute("aria-disabled", String(track.scrollLeft >= remaining - 1));
}
const shelfSizes = new ResizeObserver(entries => {
  for (const { target } of entries) updateShelfArrows(target);
});
main.addEventListener("scroll", event => {
  if (event.target.matches(shelfTracks)) updateShelfArrows(event.target);
}, { capture: true, passive: true });
main.addEventListener("click", event => {
  const arrow = event.target.closest("[data-shelf-step]");
  if (!arrow || arrow.getAttribute("aria-disabled") === "true") return;
  const track = arrow.closest(".shelf").querySelector(".shop-grid");
  const [first, second] = track.children;
  const step = second.offsetLeft - first.offsetLeft;
  const page = Math.max(1, Math.round(track.clientWidth / step));
  track.scrollBy({
    left: Number(arrow.dataset.shelfStep) * step * page,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
});

// ---------- Router ----------
function route() {
  const [path, qs] = location.hash.slice(1).split("?");
  let parts;
  try { parts = path.split("/").map(decodeURIComponent); } catch { parts = ["missing"]; }
  return { parts, params: new URLSearchParams(qs ?? "") };
}
function render({ scroll = false } = {}) {
  shelfSizes.disconnect();
  stopStage(); document.querySelector("#stage-slot").innerHTML = "";
  const { parts: [page, key, option], params } = route();
  const product = byId.get(key);
  mobileBarFor(null);
  switch (page) {
    case "": case "home": document.querySelector("#stage-slot").innerHTML = stage(); main.innerHTML = home(); showPartner(0); break;
    case "shop": case "search": {
      const kind = page === "shop" ? key : undefined, word = page === "search" ? key ?? "" : "";
      query.value = word;
      if (word) remember("search", null, word);
      main.innerHTML = browse(kind, word, params.get("available") ? { state: ["buy"] } : null);
      const f = document.querySelector("#filters"), update = () => filterProducts(kind, word);
      f.addEventListener("input", update);
      f.addEventListener("reset", () => setTimeout(() => { if (f.isConnected) update(); }, 0));
      update();
      break;
    }
    case "product": if (product) remember("product_viewed", product.id); main.innerHTML = product ? details(product, option) : missing(); mobileBarFor(product, option); break;
    case "offers": main.innerHTML = offersPage(); break;
    case "offer": main.innerHTML = offerPage(key); break;
    case "campaign": location.replace("#offer/laptop-bundle"); return;
    case "availability": location.replace("#shop"); return;
    case "partner": main.innerHTML = partnerPage(key, option); break;
    case "compare": main.innerHTML = comparePage(key === "sample"); break;
    case "cart": main.innerHTML = cartPage(key === "sample"); break;
    case "ops": main.innerHTML = ops(); break;
    case "review": main.innerHTML = review(); break;
    case "help": main.innerHTML = help(); break;
    case "brands": main.innerHTML = brandsPage(); break;
    case "wishlist": main.innerHTML = wishlistPage(); break;
    default: main.innerHTML = missing();
  }
  syncChrome(page);
  for (const track of main.querySelectorAll(shelfTracks)) {
    updateShelfArrows(track);
    shelfSizes.observe(track);
  }
  if (scroll) {
    if (option === "items" || key === "items") document.querySelector("#eligible-models")?.scrollIntoView();
    else if (page === "offer" && key && location.hash.endsWith("/items")) document.querySelector("#eligible-models")?.scrollIntoView();
    else if (page === "partner" && option) document.querySelector("#shelf-" + CSS.escape(option))?.scrollIntoView();
    else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  }
}

// ---------- Dialogs: quote, price, branch check, restock ----------
function openAction(kind, p, variant = "") {
  if (kind === "checkout") {
    const r = "PCX-" + (++ref);
    dialog.innerHTML = '<h2 id="dialog-title">Order ' + r + ' placed for confirmation</h2><p>' + esc(delivery[cartChoice].label) + '.</p><ol class="after-order"><li class="done">Order received · no payment taken</li><li>A Sales rep confirms stock and the total, then sends a payment link</li><li>Pay within 24 hours to keep the reservation</li></ol><p class="muted">Sample only. Nothing was sent or charged.</p><form method="dialog"><button class="primary">Done</button></form>';
    dialog.showModal(); return;
  }
  const sel = document.querySelector("#variant-select")?.selectedOptions[0]?.textContent;
  const item = esc(p.name) + (sel ? " · " + esc(sel) : "");
  const title = { quote: "Request a quote", price: "Get today’s price", check: "Check branch stock", restock: "Notify me when it’s back", source: "Ask Sales to source a model" }[kind];
  const contact = '<label>Reply by <select name="channel"><option>Viber</option><option>Facebook Messenger</option><option>Email</option><option>Phone call</option></select></label><label>Email or mobile <input name="contact" required maxlength="160" placeholder="example@example.com"></label>';
  const body = kind === "restock"
    ? '<label>Email <input name="contact" type="email" required maxlength="160" placeholder="example@example.com"></label><label class="check"><input type="checkbox" name="similar" checked> Also tell me about a ready-to-ship alternative</label>'
    : kind === "source" ? '<label>Model or part number <input name="model" required maxlength="80" placeholder="e.g. G5060-8V2CW"></label>' + contact
    : '<div class="two"><label>Quantity <input name="qty" type="number" min="1" max="50" value="1" required></label><label>Deliver to <select name="area"><option>Metro Manila</option><option>Luzon</option><option>Visayas / Mindanao</option><option>Pickup at Online Paterno</option></select></label></div>' +
      (kind === "quote" ? '<label>Configuration notes (optional) <input name="notes" maxlength="160" placeholder="e.g. 32 GB RAM, Windows 11 Pro"></label>' : '') + contact;
  dialog.innerHTML = '<h2 id="dialog-title">' + title + '</h2><p class="dialog-item">' + item + '</p>' + (kind !== "restock" && kind !== "source" ? '<p class="muted">Last listed ' + money(p.pricePhp) + '. Sales confirms the current price, allocation and lead time. No payment until you accept.</p>' : '') +
    '<form id="sample-request">' + body + '<div class="button-row"><button class="primary" type="submit">' + (kind === "restock" ? "Save alert" : "Send request") + '</button><button type="button" class="secondary" data-action="close-dialog">Cancel</button></div><p class="muted small">Sample form. Nothing is sent.</p></form>';
  dialog.querySelector("form").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (kind === "restock") {
      alerts.set(p.id + "/" + variant, true);
      const alt = products.find(x => x.kind === p.kind && x.status === "buy");
      dialog.innerHTML = '<h2 id="dialog-title">Alert saved</h2><p>' + item + '</p><p>We send one message when this exact variant is back. Your request also counts toward reorder demand.</p>' +
        (f.get("similar") && alt ? '<div class="alt-pick">' + image(alt) + '<div><p class="kicker">Ready to ship now</p><a href="#product/' + alt.id + '">' + esc(alt.name) + '</a><p>' + money(alt.pricePhp) + '</p></div></div>' : '') + '<form method="dialog"><button class="primary">Done</button></form>';
    } else {
      const r = "PCX-Q-" + (++ref);
      quotes.push(r + " · " + p.name.slice(0, 50) + " · qty " + (f.get("qty") ?? 1) + " · " + f.get("channel"));
      dialog.innerHTML = '<h2 id="dialog-title">Request ' + r + ' received</h2><p>' + item + (f.get("qty") ? ' · Qty ' + esc(f.get("qty")) : '') + '</p><p>A named Sales rep replies by ' + esc(f.get("channel")) + ' with price, allocation and lead time. Target: within 2 business hours (sample).</p><form method="dialog"><button class="primary">Done</button></form>';
    }
    dialog.querySelector("button").focus();
  });
  dialog.showModal();
}

// ---------- Events ----------
document.addEventListener("click", e => {
  const s = e.target.closest("[data-stage], [data-stage-go]");
  if (s) {
    if (s.dataset.stageGo !== undefined) showPartner(Number(s.dataset.stageGo));
    else if (s.dataset.stage === "pause") { stagePaused = !stagePaused; restartStage(); }
    else showPartner(stageIndex + Number(s.dataset.stage));
    return;
  }
  const j = e.target.closest("[data-jump]");
  if (j) { document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); return; }
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const { action: kind, id, variant } = t.dataset;
  const p = byId.get(id);
  if (kind === "buy" && p?.status === "buy") {
    if ((basket.get(id) ?? 0) >= p.stock) return toast("Only " + p.stock + " in stock online. Ask Sales for a bigger order.");
    basket.set(id, (basket.get(id) ?? 0) + 1); remember("product_added_to_cart", id); syncChrome(); toast("Added to your sample cart.");
    if (route().parts[0] === "cart") render();
  }
  else if (kind === "compare" && p) {
    const i = comparison.indexOf(id);
    if (i >= 0) comparison.splice(i, 1);
    else if (comparison.length < 4) comparison.push(id);
    else return toast("Compare up to four products.");
    for (const b of document.querySelectorAll('[data-action="compare"].secondary')) if (b.dataset.id === id) { b.setAttribute("aria-pressed", String(i < 0)); b.textContent = i < 0 ? "Comparing" : "Compare"; }
    syncChrome(route().parts[0]);
  }
  else if (kind === "wish" && p) {
    const i = memory.wish.indexOf(id);
    if (i >= 0) memory.wish.splice(i, 1); else memory.wish.unshift(id);
    const saved = i < 0;
    t.setAttribute("aria-pressed", String(saved));
    t.setAttribute("aria-label", saved ? "Remove from wishlist" : "Add to wishlist");
    t.querySelector("path").setAttribute("fill", saved ? "currentColor" : "none");
    saveMemory(); syncChrome(route().parts[0]);
    toast(i >= 0 ? "Removed from your wishlist." : "Saved to your wishlist.");
    if (route().parts[0] === "wishlist") render();
  }
  else if (kind === "account") {
    dialog.innerHTML = '<h2 id="dialog-title">Sign in</h2><form id="sample-request"><label>Email <input type="email" name="email" maxlength="160" placeholder="example@example.com"></label><label>Password <input type="password" name="pw" maxlength="80" autocomplete="off"></label>' +
      '<div class="button-row"><button class="primary" type="button" data-action="close-dialog">Sign in</button><button type="button" class="secondary" data-action="close-dialog">Cancel</button></div><p class="muted small">Prototype only. Sign-in isn’t connected and nothing is sent.</p></form>';
    dialog.showModal();
  }
  else if (kind === "remove") { basket.delete(id); render(); }
  else if (kind === "swap") { basket.delete("monitor-fhd"); basket.set(id, 1); stockChanged = false; render(); toast("Swapped to an in-stock monitor."); }
  else if (kind === "simulate-stock") { stockChanged = !stockChanged; render(); }
  else if (kind === "clear-compare") { comparison.length = 0; render(); }
  else if (kind === "close-dialog") dialog.close();
  else if (kind === "checkout" || (p && ["quote", "price", "check", "restock", "source"].includes(kind))) openAction(kind, p, variant);
});
document.addEventListener("change", e => {
  if (e.target.id === "variant-select") { history.replaceState(null, "", "#product/desktop-in/" + e.target.value); render(); document.querySelector("#variant-select")?.focus(); }
  if (e.target.name === "ship") { cartChoice = e.target.value; render(); }
  if (e.target.id === "demo-date") { demoDate = e.target.value; render(); toast("Storefront now previews " + fmtDate(demoDate) + "."); }
  if (e.target.id === "lp-ready") {
    const root = document.querySelector(".lp");
    root.classList.toggle("ready-only", e.target.checked);
    for (const sh of root.querySelectorAll(".lp-shelf")) sh.hidden = e.target.checked && !sh.querySelector('.shop-card[data-state="buy"]');
    root.querySelector(".lp-none").hidden = !e.target.checked || !!root.querySelector('.shop-card[data-state="buy"]');
  }
  if (e.target.id === "diff-only") document.querySelector(".compare-table")?.classList.toggle("diff-only", e.target.checked);
});
dialog.addEventListener("close", () => { for (const b of document.querySelectorAll('[data-action="restock"]')) if (alerts.has(b.dataset.id + "/" + b.dataset.variant)) b.textContent = "Alert saved"; });
search.addEventListener("submit", e => { e.preventDefault(); const q = query.value.trim(); location.hash = q ? "#search/" + encodeURIComponent(q) : "#shop"; });
window.addEventListener("hashchange", () => render({ scroll: true }));
document.querySelector(".skip").addEventListener("click", e => { e.preventDefault(); main.focus(); main.scrollIntoView(); });
document.querySelector("#foot-brands").innerHTML = '<span>Our brand partners</span>' + stagePartners.map(([k, n]) => '<a href="#partner/' + k + '">' + esc(n) + '</a>').join("");

// ---------- Search suggestions (live site shows 5 products on focus; this adds typed matches, stock and recents) ----------
const suggest = document.createElement("div");
suggest.id = "search-suggest"; suggest.className = "suggest"; suggest.hidden = true; suggest.setAttribute("role", "listbox");
search.append(suggest);
query.setAttribute("role", "combobox"); query.setAttribute("aria-controls", "search-suggest"); query.setAttribute("aria-expanded", "false"); query.setAttribute("aria-autocomplete", "list");
const popularTerms = ["RTX 5050", "Gaming laptop", "27 inch monitor", "Wireless mouse", "Mechanical keyboard", "650W power supply"];
const searchText = p => [p.name, p.description, p.category, p.vendor, p.keywords, modelCode(p), ...Object.values(p.specifications ?? {})].join(" ").toLowerCase();
function suggestMatches(q) {
  const words = q.toLowerCase().replace(/\brtxx\b/g, "rtx").split(/\s+/).filter(Boolean);
  return products.filter(p => words.every(w => searchText(p).includes(w)))
    .sort((a, b) => STATE[a.status].rank - STATE[b.status].rank || b.paidOrdersLast30Days - a.paidOrdersLast30Days);
}
const suggestItem = (p, i) => '<a class="sg-item" role="option" id="sg-' + i + '" href="#product/' + p.id + '">' + image(p) +
  '<span><b>' + esc(p.name) + '</b><span class="sg-line"><span class="sg-price">' + money(p.pricePhp) + '</span><span class="' + availClass(p) + '">' + availText(p) + '</span></span></span></a>';
function renderSuggest() {
  const q = query.value.trim();
  let html;
  if (!q) {
    const recent = (memory.searches ?? []).slice(0, 5);
    const top = products.filter(p => p.status === "buy").sort((a, b) => b.paidOrdersLast30Days - a.paidOrdersLast30Days).slice(0, 5);
    html = (recent.length ? '<p class="sg-head">Recent searches</p><div class="sg-terms">' + recent.map(t => '<a href="#search/' + encodeURIComponent(t) + '">' + esc(t) + '</a>').join("") + '</div>' : '') +
      '<p class="sg-head">Popular searches</p><div class="sg-terms">' + popularTerms.map(t => '<a href="#search/' + encodeURIComponent(t) + '">' + esc(t) + '</a>').join("") + '</div>' +
      '<p class="sg-head">Top sellers</p>' + top.map(suggestItem).join("") +
      '<a class="sg-all" href="#shop?available=1">Shop all in-stock items <span aria-hidden="true">→</span></a>';
  } else {
    const found = suggestMatches(q);
    html = found.length
      ? found.slice(0, 5).map(suggestItem).join("") + '<a class="sg-all" href="#search/' + encodeURIComponent(q) + '">See all ' + found.length + ' results for “' + esc(q) + '” <span aria-hidden="true">→</span></a>'
      : '<p class="sg-empty">No matches for “' + esc(q) + '”. Try a brand or model number, or <a href="#help">ask Sales to source it</a>.</p>';
  }
  suggest.innerHTML = html; suggest.hidden = false; query.setAttribute("aria-expanded", "true"); suggestIndex = -1;
}
let suggestIndex = -1;
function closeSuggest() { suggest.hidden = true; query.setAttribute("aria-expanded", "false"); query.removeAttribute("aria-activedescendant"); }
const compactSearch = matchMedia("(max-width: 760px)");
function setSearchPlaceholder() {
  query.placeholder = compactSearch.matches ? "Search products" : "Search products, brands or model numbers";
}
compactSearch.addEventListener("change", setSearchPlaceholder);
setSearchPlaceholder();

function initSearchShortcuts() {
  const shortcuts = document.querySelector(".search-shortcuts");
  const viewport = shortcuts.querySelector(".shortcut-window");
  const track = viewport.querySelector(".shortcut-track");
  const group = track.firstElementChild;

  for (const link of group.querySelectorAll("a")) {
    const key = link.hash.split("/")[1];
    const mark = wordmark(key === "business" ? key : directoryOverrides[key]?.logo ?? key);
    if (mark) {
      link.setAttribute("aria-label", link.textContent);
      link.innerHTML = mark;
    }
  }

  // A second copy fills the viewport as the first slides out, so the loop has no gap.
  const repeat = group.cloneNode(true);
  repeat.setAttribute("aria-hidden", "true");
  repeat.querySelectorAll("a").forEach(link => { link.tabIndex = -1; });
  track.append(repeat);

  function selectCurrentShortcut() {
    const { parts: [page, key] } = route();
    const active = page === "partner" ? "#partner/" + key : "";
    for (const link of track.querySelectorAll("a")) {
      if (link.hash === active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }
  selectCurrentShortcut();
  window.addEventListener("hashchange", selectCurrentShortcut);

  group.addEventListener("focusin", ({ target }) => {
    if (!target.matches("a:focus-visible")) return;
    closeSuggest();
    const animation = track.getAnimations()[0];
    if (!animation) return;
    const bounds = viewport.getBoundingClientRect();
    const link = target.getBoundingClientRect();
    if (link.left >= bounds.left && link.right <= bounds.right) return;
    const strip = group.getBoundingClientRect();
    const centered = link.left - strip.left + (link.width - bounds.width) / 2;
    animation.currentTime = Math.max(0, centered) / strip.width * animation.effect.getTiming().duration;
  });

  shortcuts.classList.add("is-ticker");
}

initSearchShortcuts();
query.addEventListener("focus", renderSuggest);
query.addEventListener("input", renderSuggest);
query.addEventListener("keydown", e => {
  const opts = [...suggest.querySelectorAll(".sg-item, .sg-all")];
  if (e.key === "Escape") { e.preventDefault(); closeSuggest(); return; }
  if (suggest.hidden || !opts.length || !["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
  if (e.key === "Enter") { if (suggestIndex >= 0) { e.preventDefault(); opts[suggestIndex].click(); } return; }
  e.preventDefault();
  suggestIndex = (suggestIndex + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
  opts.forEach((o, i) => o.classList.toggle("is-active", i === suggestIndex));
  if (opts[suggestIndex].id) query.setAttribute("aria-activedescendant", opts[suggestIndex].id);
});
document.addEventListener("pointerdown", e => { if (!search.contains(e.target)) closeSuggest(); });
suggest.addEventListener("click", e => { if (e.target.closest("a")) { closeSuggest(); query.blur(); } });

// ---------- Brands menu: every partner page stays one click from the main nav ----------
const brandMenu = document.querySelector("#brand-menu"), brandBtn = document.querySelector('[aria-controls="brand-menu"]');
const rasterBrandLogos = new Set(["adata", "galax", "zotac", "viewsonic", "d-link"]);
const brandTile = (name, href, logo) => '<a href="' + href + '" class="bm-item" aria-label="' + esc(name) + '">' + logo + '<span>' + esc(name) + '</span></a>';
brandMenu.innerHTML = '<div class="frame"><div class="bm-grid">' +
  brandDirectory.map(({ name, logo, href }) => brandTile(name, href, wordmark(logo))).join("") +
  otherBrands.map(name => {
    const slug = name.toLowerCase();
    const extension = rasterBrandLogos.has(slug) ? "png" : "svg";
    const logo = '<span class="logo logo-' + slug + '"><img src="/partner-assets/logos/' + slug + '.' + extension + '" alt="" loading="lazy"></span>';
    return brandTile(name, "#search/" + encodeURIComponent(name), logo);
  }).join("") + '</div></div>';
// ---------- All Products menu (same groups as the live site) ----------
const allMenu = document.querySelector("#all-menu"), allBtn = document.querySelector(".nav-all .cat-all");
const allGroups = [
  ["PC Components", partLinks],
  ["PC Peripherals & Accessories", [["Monitors", "#shop/monitor"], ["Keyboards", "#shop/keyboard"], ["Mice", "#shop/mouse"], ["Headsets", "#shop/headset"]]],
  ["Gaming Devices & Accessories", [["Gaming laptops", "#search/gaming laptop"], ["Gaming headsets", "#search/gaming"], ["Gaming mice", "#search/g102"], ["Gaming keyboards", "#search/g213"]]],
  ["Desktop PCs", "#shop/desktop"], ["Laptops", "#shop/laptops"], ["Power Station", "#search/power station"],
  ["Business Solutions", "#partner/business"], ["Software", "#search/software"], ["All Products", "#shop"],
  ["Pricelists", "#help"], ["Laptop Sale!", "#offer/laptop-bundle"],
];
allMenu.innerHTML = '<ul>' + allGroups.map(([label, to], i) => Array.isArray(to)
  ? '<li class="has-sub"><button type="button" class="am-row" data-sub="' + i + '">' + esc(label) + '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><ul class="am-sub">' +
    to.map(([l, h]) => '<li><a href="' + h + '">' + esc(l) + '</a></li>').join("") + '</ul></li>'
  : '<li><a class="am-row" href="' + to + '">' + esc(label) + '</a></li>').join("") + '</ul>';
const partsMenu = document.querySelector("#parts-menu"), partsBtn = document.querySelector('[aria-controls="parts-menu"]');
partsMenu.innerHTML = '<ul>' + [...partLinks, ["View all PC parts", "#shop/parts"]].map(([name, href]) =>
  '<li><a class="am-row" href="' + href + '">' + esc(name) + '</a></li>').join("") + '</ul>';

const navMenus = [[allBtn, allMenu], [partsBtn, partsMenu], [brandBtn, brandMenu]];
function setNavMenu(button, menu, open) {
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (!open && menu === allMenu) menu.querySelectorAll(".has-sub.open").forEach(group => group.classList.remove("open"));
}
for (const [button, menu] of navMenus) {
  button.addEventListener("click", () => {
    const open = menu.hidden;
    for (const [trigger, panel] of navMenus) setNavMenu(trigger, panel, open && panel === menu);
  });
  menu.addEventListener("click", event => { if (event.target.closest("a")) setNavMenu(button, menu, false); });
}
document.addEventListener("pointerdown", event => {
  for (const [button, menu] of navMenus) {
    if (!menu.hidden && !button.parentElement.contains(event.target)) setNavMenu(button, menu, false);
  }
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const open = navMenus.find(([, menu]) => !menu.hidden);
  if (open) {
    const [button, menu] = open;
    setNavMenu(button, menu, false);
    button.focus();
  }
});
allMenu.addEventListener("click", e => {
  const sub = e.target.closest("[data-sub]");
  if (sub) { const li = sub.parentElement; const open = !li.classList.contains("open"); allMenu.querySelectorAll(".has-sub").forEach(x => x.classList.remove("open")); li.classList.toggle("open", open); return; }
});
render();
