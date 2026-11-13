import {
  buildInterests,
  byPopularity,
  recentEvents,
  scoreInterest,
  type Product,
  type ShopperEvent,
} from "../../engine.ts";

export type Surface = "home" | "product" | "search" | "cart";
export type ProductKind = "gpu" | "headset" | "keyboard" | "mouse" | "monitor" | "power" | "desktop" | "laptop";

export interface PreviewProduct extends Product {
  kind: ProductKind;
  vendor?: string;
  image?: string;
  description: string;
  published: boolean;
  addedAtMs: number;
  keywords?: string;
  accessoryIds?: readonly string[];
  alsoBoughtIds?: readonly string[];
}

export interface PlacementInput {
  surface: Surface;
  productId?: string;
  query?: string;
  shoppingQuery?: string;
  budgetPhp?: number;
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
const MAX_QUERY_TERMS = 8;
const SEARCH_WEIGHT = 1.5;
const INFERRED_PRICE_LIMIT = 1.5;
const peso = new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", maximumFractionDigits: 0,
});
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

  function search(query: string, maxPrice = Infinity) {
    const terms = [...new Set(tokenize(query))].slice(0, MAX_QUERY_TERMS);
    if (!terms.length) return [];
    const postings = terms.map(term => searchIndex.get(term));
    if (postings.some(posting => !posting)) return [];
    const sets = (postings as Set<PreviewProduct>[]).sort((a, b) => a.size - b.size);
    const matches = [];
    for (const product of sets[0]) {
      if (product.pricePhp <= maxPrice && sets.every(set => set.has(product))) matches.push(product);
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

  function relatedProducts(ids: readonly string[] = []) {
    return ids.slice(0, 8)
      .map(id => catalog.get(id))
      .filter((item): item is PreviewProduct => item !== undefined);
  }

  function recommend(input: PlacementInput, nowMs: number): PreviewResult {
    const cartIds = new Set(input.cartProductIds);
    const cart = [...cartIds].map(id => catalog.get(id))
      .filter((item): item is PreviewProduct => item !== undefined);
    const cartCategories = new Set(cart.map(item => item.category));
    const fillsCartGap = (item: PreviewProduct) => !cartCategories.has(item.category);
    const product = input.productId ? catalog.get(input.productId) : undefined;
    const excluded = new Set(cartIds);
    if (input.surface === "product" && product) excluded.add(product.id);

    const events = input.personalizationAllowed ? input.events.filter(event =>
      event.type !== "product_added_to_cart" || cartIds.has(event.productId)
    ) : [];
    const interests = buildInterests(events, catalog, nowMs);
    const budget = input.budgetPhp ?? Infinity;
    const withinBudget = (item: PreviewProduct) => item.pricePhp <= budget;
    const shoppingMatches = input.personalizationAllowed && input.shoppingQuery
      ? search(input.shoppingQuery) : [];
    const shoppingIds = new Set(shoppingMatches.map(item => item.id));
    const searchCategories = new Map<string, number[]>();
    for (const item of shoppingMatches) {
      const prices = searchCategories.get(item.category) ?? [];
      prices.push(item.pricePhp);
      searchCategories.set(item.category, prices);
    }
    // A search informs the session when it points to a clear product category.
    const [searchCategory, prices] = [...searchCategories].sort(([, a], [, b]) => b.length - a.length)[0] ?? [];
    if (searchCategory && prices && prices.length * 2 > shoppingMatches.length) {
      const interest = interests.get(searchCategory);
      const price = interest ? interest.weightedPrice / interest.weight
        : prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
      interests.set(searchCategory, {
        weight: (interest?.weight ?? 0) + SEARCH_WEIGHT,
        weightedPrice: (interest?.weightedPrice ?? 0) + price * SEARCH_WEIGHT,
      });
    }
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
        const queryFit = shoppingIds.has(candidate.id) ? 1.15 : 1;
        return interest ? [{ candidate, score: scoreInterest(candidate, interest) * queryFit }] : [];
      }).sort((a, b) => b.score - a.score || byPopularity(a.candidate, b.candidate))
        .map(({ candidate }) => candidate);
    }

    function addPairings(
      slot: number,
      title: string,
      sources: readonly PreviewProduct[],
      reason: (items: PreviewProduct[]) => string,
      reserved?: ReadonlySet<string>,
    ) {
      const pairedWith = new Map<PreviewProduct, PreviewProduct[]>();
      for (const item of sources) {
        for (const accessory of new Set(relatedProducts(item.accessoryIds))) {
          if (!accessory.inStock || !withinBudget(accessory) || !fillsCartGap(accessory) || accessory === item
            || excluded.has(accessory.id) || reserved?.has(accessory.id)) continue;
          const matches = pairedWith.get(accessory) ?? [];
          matches.push(item);
          pairedWith.set(accessory, matches);
        }
      }

      // Use each slot to cover as many cart items as possible before offering a second add-on for the same item.
      const candidates = [...pairedWith];
      const covered = new Set<PreviewProduct>();
      const picks: PreviewProduct[] = [];
      while (picks.length < ROW_SIZE && candidates.length) {
        let bestIndex = 0;
        let bestCoverage = -1;
        for (const [index, [, matches]] of candidates.entries()) {
          const coverage = matches.filter(item => !covered.has(item)).length;
          if (coverage <= bestCoverage) continue;
          bestIndex = index;
          bestCoverage = coverage;
        }
        const [[accessory, matches]] = candidates.splice(bestIndex, 1);
        picks.push(accessory);
        for (const item of matches) covered.add(item);
      }
      return add(slot, title, picks, candidate => reason(pairedWith.get(candidate)!));
    }

    function cartAddOns(slot: number, reserved?: ReadonlySet<string>) {
      return addPairings(slot, "Add-ons for your cart", cart.toSorted(byPopularity), ([item, ...others]) => {
        const related = others.length === 1 ? ` and the ${others[0].description}`
          : others.length > 1 ? ` and ${others.length} other items` : "";
        return `Suggested with the ${item.description}${related} in your cart`;
      }, reserved);
    }

    const budgetBestsellers = Number.isFinite(budget)
      ? bestsellers.filter(withinBudget) : bestsellers;
    const defaults = (reserved?: ReadonlySet<string>, candidates = budgetBestsellers) => add(1, "Bestsellers", candidates, () =>
      Number.isFinite(budget) ? "Popular and within your budget" : "Popular and available", reserved);
    const intent = (candidate: PreviewProduct) => {
      const why = shoppingIds.has(candidate.id) ? "Matches your recent search"
        : recent.some(item => item.id === candidate.id) ? "You viewed this item"
        : `Based on your interest in ${candidate.category}`;
      return Number.isFinite(budget) && withinBudget(candidate)
        ? `${why} · Within ${peso.format(budget)}` : why;
    };
    let searchMatches: string[] = [];
    switch (input.surface) {
      case "home": {
        const reserved = Number.isFinite(budget) ? undefined : new Set(recent.map(item => item.id));
        const likely = [...interests].filter(([category]) => !cartCategories.has(category))
          .sort(([, a], [, b]) => b.weight - a.weight)
          .slice(0, MAX_INTEREST_CATEGORIES);
        const rankedCategories = likely.map(([category, interest]) => {
          const typicalPrice = interest.weightedPrice / interest.weight;
          const ceiling = Number.isFinite(budget) ? budget : typicalPrice * INFERRED_PRICE_LIMIT;
          const candidates = nearPrice(byCategory.get(category) ?? [], Math.min(typicalPrice, ceiling))
            .filter(item => item.pricePhp <= ceiling && !excluded.has(item.id) && !reserved?.has(item.id));
          return rankIntent(candidates);
        });
        const balanced = Array.from({ length: ROW_SIZE }, (_, rank) =>
          rankedCategories.flatMap(category => category[rank] ? [category[rank]] : [])).flat();
        const popular = input.personalizationAllowed && cart.length ? budgetBestsellers.filter(fillsCartGap) : budgetBestsellers;
        const hasPicks = add(1, "Recommended for you", balanced, intent, reserved);
        const hasCartAddOns = input.personalizationAllowed && cartAddOns(hasPicks ? 2 : 1, reserved);
        if (!hasPicks && !hasCartAddOns) {
          const paired = !Number.isFinite(budget) && addPairings(
            1, "Recommended for you", [...new Set(recent.filter(fillsCartGap))],
            ([item]) => `Suggested with the ${item.description} you viewed`, reserved,
          );
          if (!paired && (!Number.isFinite(budget) || !likely.length)) defaults(reserved, popular);
        }
        if (!hasCartAddOns) add(2, "Top Sellers", popular, () => "Popular and available", reserved);
        add(3, "Recently viewed", recent.filter(withinBudget), () => "Viewed in this session");
        break;
      }
      case "product": {
        if (!product) {
          defaults();
          break;
        }
        const priceDifference = (candidate: PreviewProduct) => {
          const difference = candidate.pricePhp - product.pricePhp;
          if (!difference) return "Same price as the item you’re viewing";
          return `${peso.format(Math.abs(difference))} ${difference < 0 ? "less" : "more"} than the item you’re viewing`;
        };
        if (add(1, "Customers Also Bought", relatedProducts(product.alsoBoughtIds)
          .filter(candidate => withinBudget(candidate) && fillsCartGap(candidate)),
          () => "Bought together in the sample catalog")) {
          add(2, "Similar products", alternatives(product).filter(withinBudget), priceDifference);
        } else {
          if (!add(1, "Similar products", alternatives(product).filter(withinBudget), priceDifference)) {
            addPairings(1, "Suggested add-ons", [product], () => `Suggested with the ${product.description} you’re viewing`);
          }
        }
        add(3, "Recently viewed", recent.filter(withinBudget), () => "Viewed in this session");
        if (!placements.length && !Number.isFinite(budget)) defaults();
        break;
      }
      case "search": {
        const matches = search(input.query ?? "", budget);
        searchMatches = matches.slice(0, 24).map(item => item.id);
        if (!matches.length) {
          if (!Number.isFinite(budget)) defaults();
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
        cartAddOns(1);
        if (!cart.length) add(3, "Top Sellers", budgetBestsellers, () => "Popular and available");
        break;
      }
    }
    return { placements, searchMatches };
  }

  return { recommend };
}
