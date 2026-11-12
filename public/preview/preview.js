import { escapeHtml, formatPrice, productArt, productCard, renderPlacements } from "./cards.js";
import { initCarousel } from "./pcx-carousel.js";

const controls = document.querySelectorAll("button[disabled], input[disabled]");
const consent = document.querySelector("#allow-personalization");
const reset = document.querySelector("#reset-session");
const status = document.querySelector("#preview-status");
const searchForm = document.querySelector("#search-form");
const searchBox = document.querySelector("#search-query");
const catalogSection = document.querySelector("#sample-catalog");
const catalogGrid = document.querySelector("#catalog-grid");
const budgetForm = document.querySelector("#budget-form");
const budgetInput = document.querySelector("#budget-php");
const shoppingContext = document.querySelector("#shopping-context");
const compareButton = document.querySelector('[data-action="compare"]');
const demoCart = document.querySelector("#demo-cart");
const pageContext = document.querySelector("#page-context");
const slots = document.querySelector("#placements");
const demoSection = document.querySelector("#personalization-demo");
const guide = document.querySelector("#pcx-demo-guide");
const guideButtons = document.querySelectorAll(".pcx-guide-open");
const guideClose = document.querySelector("#pcx-guide-close");
const guideResult = document.querySelector("#pcx-guide-result");
const cartCount = document.querySelector("#cart-count");
const nav = document.querySelector(".nav");
const replayButtons = document.querySelectorAll('[data-action="replay"]');
const homeContent = document.querySelector("#home-content");
initCarousel(document.querySelector("[data-carousel]"));

const events = [];
const cart = new Set();
const catalog = new Map();
const prefixes = { home: "home", product: "pdp", search: "srp", cart: "cart" };
let surface = "home";
let selectedProduct = "gpu-mid";
let query = "graphics cards";
let anonymousRows = [];
let pendingRequest;
let homeCartKey;
let visibleRows;
let guideTrigger;
let sampleEvent;
let shoppingQuery;
let budgetPhp;
let comparing = false;

function activeBudget() {
  return comparing ? undefined : budgetPhp;
}

function updateShoppingContext() {
  const sample = catalog.get(sampleEvent?.productId);
  const parts = [];
  if (comparing) parts.push("Comparing with the default Bestsellers");
  else {
    if (sample) parts.push(`Sample shopper · ${sample.category}`);
    else if (shoppingQuery && consent.checked) parts.push(`You searched for “${shoppingQuery}”`);
    if (budgetPhp) parts.push(`Up to ${formatPrice(budgetPhp)} per item`);
  }
  shoppingContext.textContent = parts.join(" · ") || "Try a shopper example or browse products to build your own picks.";
  compareButton.disabled = !sampleEvent && !events.length && !shoppingQuery && !budgetPhp;
  compareButton.textContent = comparing ? "Show my picks" : "Compare with Bestsellers";
  compareButton.setAttribute("aria-pressed", String(comparing));
  for (const button of replayButtons) {
    button.setAttribute("aria-pressed", String(!comparing && button.dataset.id === sampleEvent?.productId));
  }
}

function openGuide(trigger, revealResults = false) {
  guideTrigger = trigger;
  if (revealResults) demoSection.scrollIntoView({ block: "start" });
  if (guide.matches(":popover-open")) return;
  guide.showPopover();
  for (const button of guideButtons) button.setAttribute("aria-expanded", "true");
  guideClose.focus({ preventScroll: true });
}

function closeGuide() {
  guide.hidePopover();
  for (const button of guideButtons) button.setAttribute("aria-expanded", "false");
  guideTrigger?.focus({ preventScroll: true });
}

for (const button of guideButtons) button.addEventListener("click", () => openGuide(button));
guideClose.addEventListener("click", closeGuide);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && guide.matches(":popover-open")) {
    event.preventDefault();
    closeGuide();
  }
});
document.querySelector('.announcement-bar a[href="#personalization-demo"]').addEventListener("click", event => {
  if (!catalog.size) return;
  event.preventDefault();
  openGuide(event.currentTarget, true);
});

function showContext(searchMatches = null) {
  catalogSection.hidden = surface !== "home";
  if (homeContent) homeContent.hidden = surface !== "home";
  cartCount.textContent = String(cart.size);
  demoCart.hidden = !cart.size || surface === "cart";
  demoCart.textContent = `View sample cart (${cart.size})`;
  for (const button of nav.querySelectorAll("button")) {
    if (button.dataset.surface === surface) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  switch (surface) {
    case "home": {
      pageContext.replaceChildren();
      const cartKey = [...cart].join(",");
      if (homeCartKey !== cartKey) {
        catalogGrid.innerHTML = [...catalog.values()].map(product =>
          productCard(product, product.description, cart, true)
        ).join("");
        homeCartKey = cartKey;
      }
      break;
    }
    case "product": {
      const product = catalog.get(selectedProduct);
      if (!product) break;
      const action = cart.has(product.id) ? "Remove from cart" : "Add to cart";
      pageContext.innerHTML = `<section class="context detail-view" aria-label="Product detail">
        ${productArt(product)}
        <div>
          <h2>${escapeHtml(product.name)}</h2>
          <p class="muted">${escapeHtml(product.description)}</p>
          <p class="t4s-product-price">${formatPrice(product.pricePhp)}</p>
          <button data-action="cart" data-id="${escapeHtml(product.id)}" ${product.inStock ? "" : "disabled"}>
            ${product.inStock ? action : "Sold out"}
          </button>
        </div>
      </section>`;
      break;
    }
    case "search": {
      const matches = (searchMatches ?? []).flatMap(id => {
        const product = catalog.get(id);
        return product ? [productCard(product, product.description, cart, true)] : [];
      });
      const content = matches.length
        ? `<div class="product-grid">${matches.join("")}</div>`
        : `<p class="empty">${searchMatches === null ? "Loading sample results…" : "No matching sample products."}</p>`;
      pageContext.innerHTML = `<section class="context"><h2>Results for “${escapeHtml(query)}”</h2>${content}</section>`;
      break;
    }
    case "cart": {
      const subtotal = [...cart].reduce((total, id) => total + catalog.get(id).pricePhp, 0);
      const items = [...cart].map(id => {
        const product = catalog.get(id);
        return productCard(product, product.description, cart, true);
      });
      const content = items.length ? `<div class="product-grid">${items.join("")}</div>` : '<p class="empty">Your sample cart is empty.</p>';
      pageContext.innerHTML = `<section class="context"><h2>Your sample cart</h2>${content}${
        items.length ? `<p class="pcx-cart-subtotal">Subtotal <strong>${formatPrice(subtotal)}</strong></p>` : ""
      }</section>`;
      break;
    }
  }
}

function fallbackRows() {
  const budget = activeBudget();
  const affordable = item => !budget || catalog.get(item.productId).pricePhp <= budget;
  if (surface === "home") return anonymousRows.map(row => ({ ...row, items: row.items.filter(affordable) }));
  const excluded = new Set(cart);
  if (surface === "product") excluded.add(selectedProduct);
  const items = [];
  for (const item of anonymousRows.flatMap(row => row.items)) {
    if (excluded.has(item.productId) || (surface !== "cart" && !affordable(item))) continue;
    items.push(item);
    excluded.add(item.productId);
    if (items.length === 4) break;
  }
  return [{ id: `${prefixes[surface]}_recommendations_1`, title: "Popular picks", items }];
}

function renderRows(rows, animate = false) {
  const markup = renderPlacements(surface, rows, catalog, cart, true);
  if (visibleRows?.markup !== markup) {
    slots.classList.toggle("pcx-fresh", animate);
    slots.innerHTML = markup;
  }
  visibleRows = { markup, surface, budget: activeBudget(), cartKey: [...cart].join(",") };
  const title = slots.querySelector("h2")?.textContent;
  guideResult.textContent = title ? `Showing ${title}` : "No suggestions for this page";
}

async function refresh(message) {
  pendingRequest?.abort();
  const request = new AbortController();
  pendingRequest = request;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2800)]);
  status.textContent = message;
  showContext();
  updateShoppingContext();
  const sameHome = surface === "home" && visibleRows?.surface === "home" &&
    visibleRows.cartKey === [...cart].join(",") && visibleRows.budget === activeBudget();
  const allowed = !comparing && (consent.checked || Boolean(sampleEvent));
  const history = allowed ? [
    ...(sampleEvent ? [sampleEvent] : []), ...(consent.checked ? events : []),
  ].slice(-100) : [];
  if (!allowed || !sameHome) renderRows(fallbackRows());
  try {
    const response = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        surface, productId: surface === "product" ? selectedProduct : undefined,
        query: surface === "search" ? query : undefined, personalizationAllowed: allowed,
        shoppingQuery: allowed && consent.checked ? shoppingQuery : undefined,
        budgetPhp: activeBudget(), events: history, cartProductIds: [...cart],
      }),
    });
    if (!response.ok) throw new Error("Preview API unavailable");
    const data = await response.json();
    if (signal.aborted || pendingRequest !== request) return;
    if (surface === "search") showContext(data.searchMatches);
    renderRows(data.placements, true);
    if (surface === "home" && activeBudget() && allowed
      && !data.placements.some(row => row.id === "home_recommendations_1")) {
      status.textContent = "No matching products at this budget. Try a higher max price or another category.";
    }
  } catch {
    if (request.signal.aborted || pendingRequest !== request) return;
    if (surface === "search") showContext([]);
    renderRows(fallbackRows());
    status.textContent = "Suggestions are unavailable. Showing popular picks.";
  }
}

function record(type, productId) {
  if (!consent.checked) return;
  events.push({ id: crypto.randomUUID(), type, productId, occurredAtMs: Date.now() });
  if (events.length > 100) events.shift();
}

function view(id) {
  const product = catalog.get(id);
  if (!product) return;
  selectedProduct = id;
  surface = "product";
  comparing = false;
  record("product_viewed", id);
  void refresh(`Viewing ${product.name}.`);
}

document.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled || !catalog.size) return;
  const { action, id, surface: destination } = button.dataset;
  if (action === "navigate") {
    if (destination === "product") {
      view(selectedProduct);
      return;
    }
    surface = destination;
    if (surface === "search") searchBox.value = query;
    void refresh(surface === "home" && consent.checked
      ? "Suggestions adapt to what you view and add in this session."
      : "Showing recommendations for this page.");
    if (surface === "cart") demoSection.scrollIntoView({ block: "start" });
  } else if (action === "category") {
    query = button.dataset.query;
    if (consent.checked) shoppingQuery = query;
    comparing = false;
    searchBox.value = query;
    surface = "search";
    button.closest("details")?.removeAttribute("open");
    void refresh(`Searching for ${query}.`);
  } else if (action === "browse") {
    surface = "home";
    void refresh("Showing the demo storefront.");
    document.getElementById(button.dataset.target)?.scrollIntoView({ block: "start" });
  } else if (action === "view") {
    view(id);
  } else if (action === "replay" && catalog.has(id)) {
    events.length = 0;
    shoppingQuery = undefined;
    cart.clear();
    comparing = false;
    budgetPhp = Number(button.dataset.budget);
    budgetInput.value = String(budgetPhp);
    sampleEvent = { id: "sample-" + id, type: "product_viewed", productId: id, occurredAtMs: Date.now() - 1000 };
    surface = "home";
    void refresh("Sample shopper viewed " + catalog.get(id).description + ".");
    demoSection.scrollIntoView({ block: "start" });
  } else if (action === "compare") {
    comparing = !comparing;
    surface = "home";
    void refresh(comparing ? "These are the default picks for the same storefront." : "Showing picks for this shopper.");
  } else if (action === "cart") {
    const product = catalog.get(id);
    if (!product?.inStock) return;
    if (cart.delete(id)) {
      void refresh(`Removed ${product.name} from the cart.`);
      return;
    }
    if (cart.size === 50) {
      status.textContent = "The sample cart is full.";
      return;
    }
    cart.add(id);
    record("product_added_to_cart", id);
    void refresh(`Added ${product.name} to the cart.`);
  }
});

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!catalog.size) return;
  query = searchBox.value.trim();
  if (!query) {
    status.textContent = "Enter a product or category to search.";
    searchBox.focus();
    return;
  }
  surface = "search";
  if (consent.checked) shoppingQuery = query;
  comparing = false;
  void refresh(`Searching for ${query}.`);
});

budgetForm.addEventListener("submit", event => {
  event.preventDefault();
  budgetPhp = budgetInput.value ? budgetInput.valueAsNumber : undefined;
  comparing = false;
  void refresh(budgetPhp ? `Price limit set to ${formatPrice(budgetPhp)} per item.` : "Price limit removed.");
});

consent.addEventListener("change", () => {
  sampleEvent = undefined;
  comparing = false;
  if (!consent.checked) {
    events.length = 0;
    shoppingQuery = undefined;
    budgetPhp = undefined;
    budgetInput.value = "";
  }
  void refresh(consent.checked
    ? "Personalization is on. Try searching, viewing a product or adding it to your cart."
    : "Personalization is off. Browsing activity was cleared.");
});

reset.addEventListener("click", () => {
  events.length = 0;
  cart.clear();
  consent.checked = false;
  sampleEvent = undefined;
  shoppingQuery = undefined;
  budgetPhp = undefined;
  budgetInput.value = "";
  comparing = false;
  searchBox.value = "";
  query = "graphics cards";
  selectedProduct = "gpu-mid";
  surface = "home";
  void refresh("Sample session reset.");
});

function initialize() {
  try {
    const data = JSON.parse(document.getElementById("pcx-preview-bootstrap").textContent);
    for (const product of data.catalog) catalog.set(product.id, product);
    anonymousRows = data.placements;
    consent.checked = false;
    for (const control of controls) control.disabled = false;
    showContext();
    updateShoppingContext();
    renderRows(anonymousRows);
    status.textContent = "Choose a product or allow personalization to try a shopper session.";
    openGuide(document.querySelector(".pcx-guide-launcher"));
  } catch {
    status.textContent = "The sample catalog is unavailable. Popular picks are shown below.";
  }
}

void initialize();
