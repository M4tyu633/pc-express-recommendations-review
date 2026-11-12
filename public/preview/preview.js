import { escapeHtml, formatPrice, productArt, productCard, renderPlacements } from "./cards.js";
import { initCarousel } from "./pcx-carousel.js";
import { createPlacementEngine } from "./ranking/placement-engine.js";

const controls = document.querySelectorAll("button[disabled], input[disabled]");
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
const homePicks = document.querySelector("#home-picks");
const demoCart = document.querySelector("#demo-cart");
const pageContext = document.querySelector("#page-context");
const slots = document.querySelector("#placements");
const demoSection = document.querySelector("#personalization-demo");
const guide = document.querySelector("#pcx-demo-guide");
const guideButtons = document.querySelectorAll(".pcx-guide-open");
const guideClose = document.querySelector("#pcx-guide-close");
const cartCount = document.querySelector("#cart-count");
const nav = document.querySelector(".nav");
const replayButtons = document.querySelectorAll('[data-action="replay"]');
const homeContent = document.querySelector("#home-content");
initCarousel(document.querySelector("[data-carousel]"));

const events = [];
const cart = new Set();
const catalog = new Map();
let recommendationEngine;
let surface = "home";
let selectedProduct = "gpu-mid";
let query = "graphics cards";
let homeCartKey;
let lastMarkup;
let guideTrigger;
let guideOpen = false;
let eventCount = 0;
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
    else if (shoppingQuery) parts.push(`You searched for “${shoppingQuery}”`);
    else if (events.length) parts.push("Based on your browsing in this visit");
    if (budgetPhp) parts.push(`Up to ${formatPrice(budgetPhp)} per item`);
  }
  shoppingContext.textContent = parts.join(" · ") || "Your picks update as you shop.";
  compareButton.disabled = !sampleEvent && !events.length && !shoppingQuery && !budgetPhp;
  compareButton.hidden = surface !== "home";
  homePicks.hidden = surface === "home" || compareButton.disabled;
  compareButton.textContent = comparing ? "Show my picks" : "Compare with Bestsellers";
  compareButton.setAttribute("aria-pressed", String(comparing));
  for (const button of replayButtons) {
    button.setAttribute("aria-pressed", String(!comparing && button.dataset.id === sampleEvent?.productId));
  }
}

function openGuide(trigger, revealResults = false) {
  guideTrigger = trigger;
  if (revealResults) demoSection.scrollIntoView({ block: "start" });
  if (guideOpen) return;
  guide.hidden = false;
  guide.showPopover?.();
  guideOpen = true;
  for (const button of guideButtons) button.setAttribute("aria-expanded", "true");
  if (trigger) guideClose.focus({ preventScroll: true });
  guide.scrollTop = 0;
}

function closeGuide(restoreFocus = true) {
  if (!guideOpen) return;
  guide.hidePopover?.();
  guide.hidden = true;
  guideOpen = false;
  for (const button of guideButtons) button.setAttribute("aria-expanded", "false");
  if (restoreFocus) (guideTrigger ?? document.querySelector(".pcx-guide-launcher"))?.focus({ preventScroll: true });
}

for (const button of guideButtons) button.addEventListener("click", () => openGuide(button));
guideClose.addEventListener("click", () => closeGuide());
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && guideOpen) {
    event.preventDefault();
    closeGuide();
  }
});
document.querySelector('.announcement-bar a[href="#personalization-demo"]').addEventListener("click", event => {
  if (!catalog.size) return;
  event.preventDefault();
  openGuide(event.currentTarget, true);
});

function showContext(searchMatches) {
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
      const matches = searchMatches.flatMap(id => {
        const product = catalog.get(id);
        return product ? [productCard(product, product.description, cart, true)] : [];
      });
      const content = matches.length
        ? `<div class="product-grid">${matches.join("")}</div>`
        : '<p class="empty">No matching sample products.</p>';
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

function renderRows(rows, animate = false) {
  const markup = renderPlacements(surface, rows, catalog, cart, true);
  if (lastMarkup !== markup) {
    slots.classList.toggle("pcx-fresh", animate);
    slots.innerHTML = markup;
    lastMarkup = markup;
  }
}

function refresh(message, animate = true) {
  const history = sampleEvent ? [sampleEvent, ...events].slice(-100) : events;
  const { placements, searchMatches } = recommendationEngine.recommend({
    surface,
    productId: surface === "product" ? selectedProduct : undefined,
    query: surface === "search" ? query : undefined,
    personalizationAllowed: !comparing,
    shoppingQuery,
    budgetPhp: activeBudget(),
    events: history,
    cartProductIds: [...cart],
  }, Date.now());
  showContext(searchMatches);
  updateShoppingContext();
  renderRows(placements, animate);
  const homeRow = placements.find(row => row.id === "home_recommendations_1");
  status.textContent = surface === "home" && activeBudget() && !homeRow
    ? "No matching products at this budget. Try a higher max price or another category."
    : message;
}

function record(type, productId) {
  events.push({ id: "session-" + (++eventCount), type, productId, occurredAtMs: Date.now() });
  if (events.length > 100) events.shift();
}

function view(id) {
  const product = catalog.get(id);
  if (!product) return;
  selectedProduct = id;
  surface = "product";
  comparing = false;
  record("product_viewed", id);
  closeGuide(false);
  refresh(`Viewing ${product.name}.`);
  demoSection.scrollIntoView({ block: "start" });
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
    refresh("");
    if (surface !== "home" || events.length || shoppingQuery) demoSection.scrollIntoView({ block: "start" });
  } else if (action === "category") {
    query = button.dataset.query;
    shoppingQuery = query;
    comparing = false;
    searchBox.value = query;
    surface = "search";
    button.closest("details")?.removeAttribute("open");
    closeGuide(false);
    refresh("");
    demoSection.scrollIntoView({ block: "start" });
  } else if (action === "browse") {
    surface = "home";
    closeGuide(false);
    refresh("");
    document.getElementById(button.dataset.target)?.scrollIntoView({ block: "start" });
    if (button.dataset.target === "sample-catalog") document.querySelector("#catalog-heading").focus({ preventScroll: true });
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
    closeGuide(false);
    refresh("Sample shopper viewed " + catalog.get(id).description + ".");
    demoSection.scrollIntoView({ block: "start" });
  } else if (action === "compare") {
    comparing = !comparing;
    surface = "home";
    refresh("");
  } else if (action === "cart") {
    const product = catalog.get(id);
    if (!product?.inStock) return;
    comparing = false;
    closeGuide(false);
    if (cart.delete(id)) {
      refresh(`Removed ${product.name} from the cart.`);
      return;
    }
    if (cart.size === 50) {
      status.textContent = "The sample cart is full.";
      return;
    }
    cart.add(id);
    record("product_added_to_cart", id);
    refresh(`Added ${product.name} to the cart.`);
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
  shoppingQuery = query;
  comparing = false;
  closeGuide(false);
  refresh("");
  demoSection.scrollIntoView({ block: "start" });
});

budgetForm.addEventListener("submit", event => {
  event.preventDefault();
  budgetPhp = budgetInput.value ? budgetInput.valueAsNumber : undefined;
  comparing = false;
  refresh(budgetPhp ? `Price limit set to ${formatPrice(budgetPhp)} per item.` : "Price limit removed.");
});

reset.addEventListener("click", () => {
  events.length = 0;
  cart.clear();
  sampleEvent = undefined;
  shoppingQuery = undefined;
  budgetPhp = undefined;
  budgetInput.value = "";
  comparing = false;
  searchBox.value = "";
  query = "graphics cards";
  selectedProduct = "gpu-mid";
  surface = "home";
  closeGuide(false);
  refresh("Demo reset.");
  demoSection.scrollIntoView({ block: "start" });
});

function initialize() {
  try {
    const data = JSON.parse(document.getElementById("pcx-preview-bootstrap").textContent);
    for (const product of data.catalog) catalog.set(product.id, product);
    recommendationEngine = createPlacementEngine(data.catalog);
    if (!guide.showPopover) guide.removeAttribute("popover");
    for (const control of controls) control.disabled = false;
    refresh("", false);
    openGuide();
  } catch {
    status.textContent = "The sample catalog is unavailable. Popular picks are shown below.";
  }
}

void initialize();
