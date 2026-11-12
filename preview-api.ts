import { createPlacementEngine, type PlacementInput, type Surface } from "./placement-engine.ts";
import { previewCatalog } from "./preview-catalog.ts";
import { isId, isObject, MAX_BODY_BYTES, parseRankingInput } from "./ranking-input.ts";

const surfaces = new Set<Surface>(["home", "product", "search", "cart"]);
const engine = createPlacementEngine(previewCatalog);
const publicCatalog = previewCatalog.filter(product => product.published).map(product => ({
  id: product.id,
  name: product.name,
  vendor: product.vendor,
  image: product.image,
  category: product.category,
  kind: product.kind,
  description: product.description,
  pricePhp: product.pricePhp,
  inStock: product.inStock,
}));

export function initialPlacements() {
  return engine.recommend({
    surface: "home", cartProductIds: [], events: [], personalizationAllowed: false,
  }, Date.now()).placements;
}

function parsePlacementInput(value: unknown): PlacementInput | undefined {
  const ranking = parseRankingInput(value);
  if (!ranking || !isObject(value)) return;
  const { surface, productId, query } = value;
  if (typeof surface !== "string" || !surfaces.has(surface as Surface)
    || (productId !== undefined && !isId(productId))
    || (query !== undefined && (typeof query !== "string" || query.length > 80))) return;
  return { ...ranking, surface: surface as Surface, productId, query };
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

async function readInput(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new RangeError("Request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Expected a request body.");
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new RangeError("Request body is too large.");
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(body + decoder.decode());
}

export async function handlePreview(request: Request) {
  if (request.method === "GET") {
    return json({ catalog: publicCatalog, placements: initialPlacements() }, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=300",
    });
  }
  if (request.method !== "POST") return json({ error: "Use GET or POST." }, 405, { Allow: "GET, POST" });
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Use the demo's own origin." }, 403);
  }
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") return json({ error: "Use an application/json request body." }, 415);
  let value;
  try {
    value = await readInput(request);
  } catch (error) {
    return error instanceof RangeError
      ? json({ error: "Request body is too large." }, 413)
      : json({ error: "Request body must be valid JSON." }, 400);
  }
  const input = parsePlacementInput(value);
  if (!input) return json({ error: "Invalid recommendation request." }, 400);
  return json(engine.recommend(input, Date.now()));
}
