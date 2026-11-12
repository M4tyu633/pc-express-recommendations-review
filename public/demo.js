const permission = document.querySelector("#personalization");
const reset = document.querySelector("#reset");
const cartCount = document.querySelector("#cart-count");
const activity = document.querySelector("#activity");
const heading = document.querySelector("#recommendation-heading");
const recommendations = document.querySelector("#recommended-products");
const emptyMessage = document.querySelector("#empty-recommendations");
const catalogList = document.querySelector("#catalog");

const initialCards = [...recommendations.children];
const events = [];
const cart = new Set();
const products = new Map();
const cartButtons = new Map();
const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

let pendingRequest;

function paragraph(text, className) {
  const element = document.createElement("p");
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function productCard(product, detail) {
  const card = document.createElement("li");
  card.dataset.productId = product.id;
  card.append(
    paragraph(product.name, "product-name"),
    paragraph(currency.format(product.pricePhp)),
    paragraph(detail, "product-detail"),
  );
  return card;
}

function showRecommendations(title, cards) {
  heading.textContent = title;
  recommendations.replaceChildren(...cards);
  emptyMessage.hidden = cards.length > 0;
}

async function refreshRecommendations() {
  pendingRequest?.abort();
  const request = new AbortController();
  pendingRequest = request;
  showRecommendations("Bestsellers", initialCards.filter((card) => !cart.has(card.dataset.productId)));

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(1000)]);
  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        personalizationAllowed: permission.checked,
        events,
        cartProductIds: [...cart],
      }),
    });
    if (!response.ok) return;
    const result = await response.json();
    if (signal.aborted) return;

    const cards = [];
    for (const item of result.items) {
      const product = products.get(item.productId);
      if (product?.inStock && !cart.has(product.id)) {
        cards.push(productCard(product, item.reason));
      }
    }
    const title = result.mode === "personalized" ? "Recommended for you" : "Bestsellers";
    showRecommendations(title, cards);
  } catch {
    // The server-rendered bestseller cards remain visible on a failed or slow request.
  }
}

function record(type, productId) {
  if (!permission.checked) return;
  events.push({ id: crypto.randomUUID(), type, productId, occurredAtMs: Date.now() });
  if (events.length > 100) events.shift();
}

function updateCart() {
  cartCount.textContent = `Cart (${cart.size})`;
  for (const [id, button] of cartButtons) {
    const action = cart.has(id) ? "Remove from cart" : "Add to cart";
    button.textContent = action;
    button.setAttribute("aria-label", `${action}: ${products.get(id).name}`);
  }
}

function catalogCard(product) {
  const card = productCard(product, product.inStock ? product.category : "Sold out");
  const actions = document.createElement("div");
  actions.className = "product-actions";

  const view = document.createElement("button");
  view.type = "button";
  view.textContent = "View";
  view.setAttribute("aria-label", `View: ${product.name}`);
  view.addEventListener("click", () => {
    record("product_viewed", product.id);
    activity.textContent = `Viewed ${product.name}.`;
    void refreshRecommendations();
  });

  const toggleCart = document.createElement("button");
  toggleCart.type = "button";
  toggleCart.disabled = !product.inStock;
  toggleCart.addEventListener("click", () => {
    if (cart.delete(product.id)) {
      activity.textContent = `Removed ${product.name} from the cart.`;
    } else {
      cart.add(product.id);
      record("product_added_to_cart", product.id);
      activity.textContent = `Added ${product.name} to the cart.`;
    }
    updateCart();
    void refreshRecommendations();
  });
  cartButtons.set(product.id, toggleCart);
  actions.append(view, toggleCart);
  card.append(actions);
  return card;
}

permission.addEventListener("change", () => {
  if (!permission.checked) events.length = 0;
  activity.textContent = permission.checked
    ? "Personalization on. View a product to see alternatives."
    : "Personalization off. Browsing activity cleared.";
  void refreshRecommendations();
});

reset.addEventListener("click", () => {
  events.length = 0;
  cart.clear();
  permission.checked = false;
  activity.textContent = "Demo reset.";
  updateCart();
  void refreshRecommendations();
});

try {
  const response = await fetch("/api/catalog", { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error("Catalog unavailable");
  for (const product of await response.json()) products.set(product.id, product);
  catalogList.replaceChildren(...[...products.values()].map(catalogCard));
  updateCart();
  permission.checked = false;
  permission.disabled = false;
  reset.disabled = false;
  activity.textContent = "Personalization is off.";
} catch {
  activity.textContent = "The sample catalog could not load. Refresh the page to retry.";
}
