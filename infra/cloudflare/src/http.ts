const MAX_BODY_BYTES = 16 * 1024;

export class GatewayRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function allowedOrigins(value: string | undefined): Set<string> {
  const values = (value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!values.length) throw new Error("Set KHONSU_CORS_ORIGINS before serving requests.");
  const origins = new Set<string>();
  for (const value of values) {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      url.origin !== value || url.username || url.password ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.hostname.endsWith(".invalid") || value.includes("*")
    ) throw new Error("Configure exact HTTPS frontend origins, or localhost for development.");
    origins.add(value);
  }
  return origins;
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/v1" || pathname.startsWith("/v1/");
}

export function validateRequest(request: Request, origins: Set<string>): void {
  const url = new URL(request.url);
  if (request.url.length > 8192) {
    throw new GatewayRequestError(414, "URL_TOO_LONG", "The request URL is too long.");
  }
  if (!isApiPath(url.pathname)) {
    throw new GatewayRequestError(404, "ROUTE_NOT_FOUND", "This gateway serves /health and /v1 API paths only.");
  }
  if (!["GET", "POST", "OPTIONS"].includes(request.method) ||
      (request.method === "POST" && url.pathname === "/health")) {
    throw new GatewayRequestError(405, "METHOD_NOT_ALLOWED", "This route does not allow that method.");
  }
  const origin = request.headers.get("Origin");
  if (origin !== null && !origins.has(origin)) {
    throw new GatewayRequestError(403, "ORIGIN_NOT_ALLOWED", "This browser origin is not configured.");
  }
  if (request.method === "OPTIONS") {
    const method = request.headers.get("Access-Control-Request-Method");
    const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
      .split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (!origin || !["GET", "POST"].includes(method ?? "") ||
        (method === "POST" && url.pathname === "/health") ||
        requestedHeaders.some((header) => header !== "content-type")) {
      throw new GatewayRequestError(400, "INVALID_PREFLIGHT", "The preflight method or headers are not allowed.");
    }
  }
  if (request.method === "POST") {
    const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new GatewayRequestError(415, "JSON_REQUIRED", "POST requests must use application/json.");
    }
    const encoding = request.headers.get("Content-Encoding");
    if (encoding && encoding.toLowerCase() !== "identity") {
      throw new GatewayRequestError(415, "ENCODING_NOT_ALLOWED", "Compressed request bodies are not supported.");
    }
    const length = request.headers.get("Content-Length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
      throw new GatewayRequestError(413, "BODY_TOO_LARGE", "The request body exceeds 16 KiB.");
    }
  }
}

export async function boundedPostRequest(request: Request): Promise<Request> {
  if (request.method !== "POST" || !request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new GatewayRequestError(413, "BODY_TOO_LARGE", "The request body exceeds 16 KiB.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new ArrayBuffer(size);
  const body = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: buffer });
}

export function corsResponse(response: Response, request: Request, origins: Set<string>): Response {
  const headers = new Headers(response.headers);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  const vary = headers.get("Vary");
  headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  const origin = request.headers.get("Origin");
  if (origin && origins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ code, message, details: [] }, {
    status,
    headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "5" } : {}) },
  });
}
