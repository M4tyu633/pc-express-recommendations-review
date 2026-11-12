import { escapeHtml, formatPrice, productArt, productCard, renderPlacements } from "./cards.js";

const controls = document.querySelectorAll("button[disabled], input[disabled]");
const consent = document.querySelector("#allow-personalization");
const reset = document.querySelector("#reset-session");
const status = document.querySelector("#preview-status");
const searchForm = document.querySelector("#search-form");
const searchBox = document.querySelector("#search-query");
const catalogSection = document.querySelector("#sample-catalog");
const catalogGrid = document.querySelector("#catalog-grid");
const pageContext = document.querySelector("#page-context");
const slots = document.querySelector("#placements");
const cartCount = document.querySelector("#cart-count");
const nav = document.querySelector(".nav");

const events = [];
const cart = new Set();
const catalog = new Map();
const prefixes = { home: "home", product: "pdp", search: "srp", cart: "cart" };
let surface = "home";
let selectedProduct = "gpu-mid";
let query = "graphics cards";
let anonymousRows = [];
let pendingRequest;

function showContext(searchMatches = null) {
  catalogSection.hidden = surface !== "home";
  cartCount.textContent = String(cart.size);
  for (const button of nav.querySelectorAll("button")) {
    if (button.dataset.surface === surface) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  switch (surface) {
    case "home":
      pageContext.replaceChildren();
      catalogGrid.innerHTML = [...catalog.values()].map(product =>
        productCard(product, product.description, cart, true)
      ).join("");
      break;
    case "product": {
      const product = catalog.get(selectedProduct);
      if (!product) break;
      const action = cart.has(product.id) ? "Remove from cart" : "Add to cart";
      pageContext.innerHTML = `<section class="context detail-view" aria-label="Product detail">
        ${productArt(product.kind)}
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
      const items = [...cart].map(id => {
        const product = catalog.get(id);
        return productCard(product, product.description, cart, true);
      });
      const content = items.length ? `<div class="product-grid">${items.join("")}</div>` : '<p class="empty">Your sample cart is empty.</p>';
      pageContext.innerHTML = `<section class="context"><h2>Your cart</h2>${content}</section>`;
      break;
    }
  }
}

function fallbackRows() {
  const excluded = new Set(cart);
  if (surface === "product") excluded.add(selectedProduct);
  const items = [];
  for (const item of anonymousRows.flatMap(row => row.items)) {
    if (excluded.has(item.productId)) continue;
    items.push(item);
    excluded.add(item.productId);
    if (items.length === 4) break;
  }
  return [{ id: `${prefixes[surface]}_recommendations_1`, title: "Popular picks", items }];
}

async function refresh(message) {
  pendingRequest?.abort();
  const request = new AbortController();
  pendingRequest = request;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(950)]);
  status.textContent = message;
  showContext();
  slots.innerHTML = renderPlacements(surface, fallbackRows(), catalog, cart, true);
  try {
    const response = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        surface, productId: surface === "product" ? selectedProduct : undefined,
        query: surface === "search" ? query : undefined, personalizationAllowed: consent.checked,
        events: consent.checked ? events : [], cartProductIds: [...cart],
      }),
    });
    if (!response.ok) throw new Error("Preview API unavailable");
    const data = await response.json();
    if (signal.aborted || pendingRequest !== request) return;
    if (surface === "search") showContext(data.searchMatches);
    slots.innerHTML = renderPlacements(surface, data.placements, catalog, cart, true);
  } catch {
    if (request.signal.aborted || pendingRequest !== request) return;
    if (surface === "search") showContext([]);
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
  } else if (action === "view") {
    view(id);
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
  void refresh(`Searching for ${query}.`);
});

consent.addEventListener("change", () => {
  if (!consent.checked) events.length = 0;
  void refresh(consent.checked
    ? "Personalization is on. View a product, then return Home to see the change."
    : "Personalization is off. Browsing activity was cleared.");
});

reset.addEventListener("click", () => {
  events.length = 0;
  cart.clear();
  consent.checked = false;
  searchBox.value = "";
  query = "graphics cards";
  selectedProduct = "gpu-mid";
  surface = "home";
  void refresh("Sample session reset.");
});

async function initialize() {
  try {
    const response = await fetch("/api/preview", { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error("Preview API unavailable");
    const data = await response.json();
    for (const product of data.catalog) catalog.set(product.id, product);
    anonymousRows = data.placements;
    consent.checked = false;
    for (const control of controls) control.disabled = false;
    showContext();
    slots.innerHTML = renderPlacements("home", anonymousRows, catalog, cart, true);
    status.textContent = "Choose a product or allow personalization to try a shopper session.";
  } catch {
    status.textContent = "The sample catalog is unavailable. Popular picks are shown below.";
  }
}

void initialize();
