import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { demoAssets } from "./demo-page.ts";
import { recommend } from "./engine.ts";
import { catalog } from "./fixtures.ts";
import { handlePreview } from "./preview-api.ts";
import { previewAssets } from "./preview-page.ts";
import { MAX_BODY_BYTES, parseRankingInput } from "./ranking-input.ts";

const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";

const publicCatalog = catalog.map(({ id, name, category, pricePhp, inStock }) => ({
  id, name, category, pricePhp, inStock,
}));

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function handleRanking(request: IncomingMessage, response: ServerResponse) {
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(response, 415, { error: "Use an application/json request body." });
    return;
  }
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) {
    sendJson(response, 413, { error: "Request body is too large." }, { Connection: "close" });
    return;
  }

  const chunks: Buffer[] = [];
  let bytesRead = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const data: Buffer = chunk;
    bytesRead += data.length;
    if (bytesRead > MAX_BODY_BYTES) {
      sendJson(response, 413, { error: "Request body is too large." }, { Connection: "close" });
      return;
    }
    chunks.push(data);
  }

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const input = parseRankingInput(body);
  if (!input) {
    sendJson(response, 400, { error: "Expected a permission flag, shopper events and cart IDs." });
    return;
  }

  const result = recommend({ ...input, catalog, nowMs: Date.now() });
  sendJson(response, 200, result);
}

async function servePreviewApi(request: IncomingMessage, response: ServerResponse) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = request.method ?? "GET";
  const init = {
    method,
    headers,
    body: method === "POST" ? Readable.toWeb(request) as ReadableStream<Uint8Array> : undefined,
    duplex: "half" as const,
  };
  const result = await handlePreview(new Request(`http://${request.headers.host}/api/preview`, init));
  const responseHeaders = Object.fromEntries(result.headers);
  if (result.status === 413) responseHeaders.Connection = "close";
  response.writeHead(result.status, responseHeaders);
  response.end(await result.text());
}

export function createRecommendationServer() {
  return createServer({ requestTimeout: 10_000 }, async (request, response) => {
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(request.headers.host ?? "")) {
      sendJson(response, 403, { error: "Use the local demo address." });
      return;
    }

    try {
      const asset = previewAssets.get(request.url ?? "") ?? demoAssets.get(request.url ?? "");
      if (asset) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "Use GET." }, { Allow: "GET" });
          return;
        }
        response.writeHead(200, {
          "Content-Type": asset.contentType,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": contentSecurityPolicy,
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        });
        response.end(asset.body);
        return;
      }

      switch (request.url) {
        case "/api/preview":
          await servePreviewApi(request, response);
          return;
        case "/api/catalog":
          if (request.method !== "GET") {
            sendJson(response, 405, { error: "Use GET." }, { Allow: "GET" });
            return;
          }
          sendJson(response, 200, publicCatalog);
          return;
        case "/api/recommendations":
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Use POST." }, { Allow: "POST" });
            return;
          }
          await handleRanking(request, response);
          return;
        default:
          sendJson(response, 404, { error: "Route not found." });
      }
    } catch {
      if (!response.headersSent && !response.destroyed) {
        sendJson(response, 500, { error: "Could not complete the request." });
      }
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PCX_PORT ?? 4173);
  const server = createRecommendationServer();
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address === "object") {
      console.log(`Personalization preview at http://127.0.0.1:${address.port}/preview`);
    }
  });
}
