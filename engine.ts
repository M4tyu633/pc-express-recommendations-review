export interface Product {
  id: string;
  name: string;
  category: string;
  pricePhp: number;
  inStock: boolean;
  paidOrdersLast30Days: number;
}

export interface ShopperEvent {
  id: string;
  type: "product_viewed" | "product_added_to_cart";
  productId: string;
  occurredAtMs: number;
}

export interface RecommendationRequest {
  catalog: readonly Product[];
  events: readonly ShopperEvent[];
  cartProductIds: readonly string[];
  personalizationAllowed: boolean;
  nowMs: number;
}

export interface RecommendationResult {
  mode: "personalized" | "bestsellers";
  items: { productId: string; name: string; reason: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 14 * DAY_MS;
const RECENCY_HALF_LIFE_MS = 3 * DAY_MS;
const CART_WEIGHT = 3;
const ROW_SIZE = 4;

export function recentEvents(events: readonly ShopperEvent[], nowMs: number) {
  return events.filter(({ occurredAtMs }) => {
    const ageMs = nowMs - occurredAtMs;
    return ageMs >= 0 && ageMs <= HISTORY_WINDOW_MS;
  }).sort((a, b) => b.occurredAtMs - a.occurredAtMs);
}

export function buildInterests(
  events: readonly ShopperEvent[],
  catalog: ReadonlyMap<string, Product>,
  nowMs: number,
) {
  const interests = new Map<string, { weight: number; weightedPrice: number }>();
  const seenIds = new Set<string>();
  const seenProductActions = new Set<string>();
  for (const event of recentEvents(events, nowMs)) {
    const product = catalog.get(event.productId);
    const ageMs = nowMs - event.occurredAtMs;
    const action = event.type + ":" + event.productId;
    if (!product || seenIds.has(event.id) || seenProductActions.has(action)) {
      continue;
    }

    seenIds.add(event.id);
    seenProductActions.add(action);
    const eventWeight = event.type === "product_added_to_cart" ? CART_WEIGHT : 1;
    const weight = eventWeight * 2 ** (-ageMs / RECENCY_HALF_LIFE_MS);
    const current = interests.get(product.category) ?? { weight: 0, weightedPrice: 0 };
    interests.set(product.category, {
      weight: current.weight + weight,
      weightedPrice: current.weightedPrice + weight * product.pricePhp,
    });
  }

  return interests;
}

export function byPopularity(a: Product, b: Product) {
  return b.paidOrdersLast30Days - a.paidOrdersLast30Days || a.id.localeCompare(b.id);
}

export function scoreInterest(product: Product, interest: { weight: number; weightedPrice: number }) {
  const typicalPrice = interest.weightedPrice / interest.weight;
  const relativeDistance = Math.abs(product.pricePhp - typicalPrice) / Math.max(typicalPrice, 1);
  const priceFit = 1 - 0.25 * Math.min(relativeDistance, 1);
  return interest.weight * priceFit;
}

export function recommend(request: RecommendationRequest): RecommendationResult {
  const pricedProducts = request.catalog.filter((product) =>
    Number.isFinite(product.pricePhp) && product.pricePhp > 0
  );
  const catalog = new Map(pricedProducts.map((product) => [product.id, product]));
  const cart = new Set(request.cartProductIds);
  const eligible = [...catalog.values()].filter((product) =>
    product.inStock && !cart.has(product.id)
  );

  if (request.personalizationAllowed) {
    const interests = buildInterests(request.events, catalog, request.nowMs);
    const ranked: { product: Product; score: number }[] = [];
    for (const product of eligible) {
      const interest = interests.get(product.category);
      if (!interest) continue;

      ranked.push({ product, score: scoreInterest(product, interest) });
    }

    ranked.sort((a, b) => b.score - a.score || byPopularity(a.product, b.product));
    if (ranked.length) {
      return {
        mode: "personalized",
        items: ranked.slice(0, ROW_SIZE).map(({ product }) => ({
          productId: product.id,
          name: product.name,
          reason: "Matches recent interest in " + product.category,
        })),
      };
    }
  }

  return {
    mode: "bestsellers",
    items: eligible.sort(byPopularity).slice(0, ROW_SIZE).map((product) => ({
      productId: product.id,
      name: product.name,
      reason: "Default in-stock pick ranked by recent orders",
    })),
  };
}
