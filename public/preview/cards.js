const currency = new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", maximumFractionDigits: 0,
});

const prefixes = { home: "home", product: "pdp", search: "srp", cart: "cart" };

export function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function formatPrice(price) {
  return currency.format(price);
}

export function productArt(product) {
  if (!product.image) return "";
  return `<div class="t4s-product-img product-art"><img src="/pcx-assets/${encodeURIComponent(product.image)}"
    alt="${escapeHtml(product.name)}" width="480" height="480"></div>`;
}

export function productCard(product, detail, cart = new Set(), actions = false) {
  const id = escapeHtml(product.id);
  const name = escapeHtml(product.name);
  const inCart = cart.has(product.id);
  const cartLabel = inCart ? "Remove" : "Add to cart";
  const template = typeof document !== "undefined" && document.getElementById("pcx-card-" + product.id);
  if (template) {
    const card = template.content.firstElementChild.cloneNode(true);
    const reason = card.querySelector(".product-detail");
    reason.textContent = detail;
    reason.hidden = !detail;
    const button = card.querySelector('[data-action="cart"]');
    button.textContent = cartLabel;
    button.setAttribute("aria-label", `${cartLabel}: ${product.name}`);
    return card.outerHTML;
  }
  return `<article class="t4s-product" data-product-id="${id}">
    <div class="t4s-product-wrapper">
      <div class="t4s-product-inner">
        ${productArt(product)}
        ${product.inStock ? "" : '<span class="stock-label">Sold out</span>'}
      </div>
      <div class="t4s-product-info">
        <div class="t4s-product-info__inner">
          <h3 class="t4s-product-title">${actions
            ? `<button class="product-link" data-action="view" data-id="${id}">${name}</button>`
            : name}</h3>
          <p class="t4s-product-price">${formatPrice(product.pricePhp)}</p>
          <p class="product-detail">${escapeHtml(detail)}</p>
          ${actions ? `<button class="card-action" data-action="cart" data-id="${id}"
            aria-label="${cartLabel}: ${name}" ${product.inStock ? "" : "disabled"}>${cartLabel}</button>` : ""}
        </div>
      </div>
    </div>
  </article>`;
}

export function renderPlacements(surface, placements, catalog, cart = new Set(), actions = false, renderCard = productCard) {
  const rows = new Map(placements.map(row => [row.id, row]));
  return [1, 2, 3].map(slot => {
    const id = `${prefixes[surface]}_recommendations_${slot}`;
    const row = rows.get(id);
    if (!row) return `<section id="${id}" hidden></section>`;
    const cards = row.items.flatMap(item => {
      const product = catalog.get(item.productId);
      return product?.inStock && !cart.has(product.id) ? [renderCard(product, item.reason, cart, actions)] : [];
    });
    if (!cards.length) return `<section id="${id}" hidden></section>`;
    const personalized = surface === "home" && row.title === "Recommended for you";
    return `<section id="${id}" class="placement" aria-labelledby="${id}_heading">
      <div class="pcx-placement-heading">
        <h2 id="${id}_heading">${escapeHtml(personalized ? "Recommended For You" : row.title)}</h2>
        ${personalized ? '<span class="pcx-personalized-label">Personalized for this session</span>' : ""}
      </div>
      <div class="product-grid">${cards.join("")}</div>
    </section>`;
  }).join("");
}
