import {
  buildInterests,
  byPopularity,
  recentEvents,
  scoreInterest,
  type Product,
  type ShopperEvent,
} from "./engine.ts";

export type Surface = "home" | "product" | "search" | "cart";
export type ProductKind = "gpu" | "headset" | "keyboard" | "mouse" | "monitor" | "power";

export interface PreviewProduct extends Product {
  kind: ProductKind;
  description: string;
  published: boolean;
  addedAtMs: number;
  keywords?: string;
  accessoryIds?: readonly string[];
}

export interface PlacementInput {
  surface: Surface;
  productId?: string;
  query?: string;
  personalizationAllowed: boolean;
  events: readonly ShopperEvent[];
  cartProductIds: readonly string[];
}

export interface Placement {
  id: string;
  title: string;
  items: { productId: string; reason: string }[];
}

export interface PreviewResult {
  placements: Placement[];
  searchMatches: string[];
}

const ROW_SIZE = 4;
const MAX_MATCHES = 160;
const PRICE_WINDOW = 64;
const MAX_INTEREST_CATEGORIES = 3;
const MAX_CART_CATEGORIES = 3;
const MAX_QUERY_TERMS = 8;
const SLOT_PREFIX: Record<Surface, string> = {
  home: "home", product: "pdp", search: "srp", cart: "cart",
};

function tokenize(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function buildSearchIndex(products: readonly PreviewProduct[]) {
  const index = new Map<string, Set<PreviewProduct>>();
  for (const product of products) {
    const words = new Set(tokenize(
      `${product.name} ${product.category} ${product.description} ${product.keywords ?? ""}`,
    ));
    for (const word of words) {
      const posting = index.get(word) ?? new Set<PreviewProduct>();
      posting.add(product);
      index.set(word, posting);
    }
  }
  return index;
}

function nearPrice(products: readonly PreviewProduct[], price: number) {
  let low = 0;
  let high = products.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (products[middle].pricePhp < price) low = middle + 1;
    else high = middle;
  }
  return products.slice(Math.max(0, low - PRICE_WINDOW), low + PRICE_WINDOW);
}

export function createPlacementEngine(source: readonly PreviewProduct[]) {
  const published = source.filter(product =>
    product.published && Number.isFinite(product.pricePhp) && product.pricePhp > 0
  );
  const catalog = new Map(published.map(product => [product.id, product]));
  const bestsellers = [...catalog.values()].filter(product => product.inStock).sort(byPopularity);
  const arrivals = [...bestsellers].sort((a, b) => b.addedAtMs - a.addedAtMs || byPopularity(a, b));
  const byCategory = new Map<string, PreviewProduct[]>();
  for (const product of bestsellers) {
    const category = byCategory.get(product.category) ?? [];
    category.push(product);
    byCategory.set(product.category, category);
  }
  for (const products of byCategory.values()) {
    products.sort((a, b) => a.pricePhp - b.pricePhp || byPopularity(a, b));
  }
  const searchIndex = buildSearchIndex(bestsellers);

  function search(query: string) {
    const terms = [...new Set(tokenize(query))].slice(0, MAX_QUERY_TERMS);
    if (!terms.length) return [];
    const postings = terms.map(term => searchIndex.get(term));
    if (postings.some(posting => !posting)) return [];
    const sets = (postings as Set<PreviewProduct>[]).sort((a, b) => a.size - b.size);
    const matches = [];
    for (const product of sets[0]) {
      if (sets.every(set => set.has(product))) matches.push(product);
      if (matches.length === MAX_MATCHES) break;
    }
    return matches.sort(byPopularity);
  }

  function alternatives(product: PreviewProduct) {
    return nearPrice(byCategory.get(product.category) ?? [], product.pricePhp)
      .sort((a, b) =>
        Math.abs(a.pricePhp - product.pricePhp) - Math.abs(b.pricePhp - product.pricePhp)
          || byPopularity(a, b)
      );
  }

  function complements(product: PreviewProduct) {
    return (product.accessoryIds ?? []).slice(0, 8)
      .map(id => catalog.get(id))
      .filter((item): item is PreviewProduct => item !== undefined);
  }

  function recommend(input: PlacementInput, nowMs: number): PreviewResult {
    const cart = [...new Set(input.cartProductIds)].map(id => catalog.get(id))
      .filter((item): item is PreviewProduct => item !== undefined);
    const product = input.productId ? catalog.get(input.productId) : undefined;
    const excluded = new Set(input.cartProductIds);
    if (input.surface === "product" && product) excluded.add(product.id);

    const events = input.personalizationAllowed ? input.events : [];
    const interests = buildInterests(events, catalog, nowMs);
    const recent = recentEvents(events, nowMs)
      .filter(event => event.type === "product_viewed")
      .map(event => catalog.get(event.productId))
      .filter((item): item is PreviewProduct => item !== undefined);

    const placements: Placement[] = [];
    function add(
      slot: number,
      title: string,
      candidates: readonly PreviewProduct[],
      reason: (candidate: PreviewProduct) => string,
      reserved?: ReadonlySet<string>,
    ) {
      const items: Placement["items"] = [];
      for (const candidate of candidates) {
        if (!candidate.inStock || excluded.has(candidate.id) || reserved?.has(candidate.id)) continue;
        items.push({ productId: candidate.id, reason: reason(candidate) });
        excluded.add(candidate.id);
        if (items.length === ROW_SIZE) break;
      }
      if (items.length) placements.push({ id: `${SLOT_PREFIX[input.surface]}_recommendations_${slot}`, title, items });
      return items.length;
    }

    function rankIntent(candidates: readonly PreviewProduct[]) {
      return candidates.flatMap(candidate => {
        const interest = interests.get(candidate.category);
        return interest ? [{ candidate, score: scoreInterest(candidate, interest) }] : [];
      }).sort((a, b) => b.score - a.score || byPopularity(a.candidate, b.candidate))
        .map(({ candidate }) => candidate);
    }

    const defaults = () => add(1, "Bestsellers", bestsellers, () => "Popular and available");
    const viewed = (slot: number) => add(slot, "Recently viewed", recent, () => "Viewed in this session");
    const intent = (candidate: PreviewProduct) => `Based on your interest in ${candidate.category}`;
    let searchMatches: string[] = [];
    switch (input.surface) {
      case "home": {
        const reserved = new Set(recent.map(item => item.id));
        const likely = [...interests].sort(([, a], [, b]) => b.weight - a.weight)
          .slice(0, MAX_INTEREST_CATEGORIES);
        const candidates = likely.flatMap(([category, interest]) =>
          nearPrice(byCategory.get(category) ?? [], interest.weightedPrice / interest.weight)
        );
        if (!add(1, "Recommended for you", rankIntent(candidates), intent, reserved)) defaults();
        add(2, "Recently added", arrivals, () => "New to the catalog", reserved);
        viewed(3);
        break;
      }
      case "product":
        if (!product) {
          defaults();
          break;
        }
        add(1, "Similar products", alternatives(product), () => "Same category and nearby price");
        add(2, "Complete your setup", complements(product), () => "Curated pairing for this item");
        viewed(3);
        if (!placements.length) defaults();
        break;
      case "search": {
        const matches = search(input.query ?? "");
        searchMatches = matches.slice(0, 24).map(item => item.id);
        if (!matches.length) {
          defaults();
          break;
        }
        const personalized = add(1, "Recommended matches", rankIntent(matches), intent);
        if (!personalized) add(1, "Popular matches", matches, () => "Popular result for this search");
        add(2, "New in these results", [...matches].sort((a, b) => b.addedAtMs - a.addedAtMs),
          () => "Recently added match");
        if (personalized) add(3, "Popular matches", matches, () => "Popular result for this search");
        else add(3, "Recently viewed matches", recent.filter(item => matches.includes(item)),
          () => "Viewed in this session");
        break;
      }
      case "cart": {
        add(1, "Complete your setup", cart.flatMap(complements), () => "Curated pairing with a cart item");
        const anchors = [...new Map(cart.map(item => [item.category, item])).values()]
          .slice(0, MAX_CART_CATEGORIES);
        add(2, "More like your cart items", anchors.flatMap(alternatives), () => "Same category as a cart item");
        viewed(3);
        if (!placements.length) defaults();
        break;
      }
    }
    return { placements, searchMatches };
  }

  return { recommend };
}
