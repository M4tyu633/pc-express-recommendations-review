import type { RecommendationRequest, ShopperEvent } from "./engine.ts";

export const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENTS = 100;
const MAX_CART_ITEMS = 50;

export type RankingInput = Pick<
  RecommendationRequest, "personalizationAllowed" | "events" | "cartProductIds"
>;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isEvent(value: unknown): value is ShopperEvent {
  return isObject(value)
    && isId(value.id)
    && (value.type === "product_viewed" || value.type === "product_added_to_cart")
    && isId(value.productId)
    && typeof value.occurredAtMs === "number"
    && Number.isSafeInteger(value.occurredAtMs)
    && value.occurredAtMs >= 0;
}

export function parseRankingInput(value: unknown): RankingInput | undefined {
  if (!isObject(value)) return;
  const { personalizationAllowed, events, cartProductIds } = value;
  if (typeof personalizationAllowed !== "boolean"
    || !Array.isArray(events) || events.length > MAX_EVENTS || !events.every(isEvent)
    || !Array.isArray(cartProductIds) || cartProductIds.length > MAX_CART_ITEMS
    || !cartProductIds.every(isId)) {
    return;
  }
  return { personalizationAllowed, events, cartProductIds };
}
