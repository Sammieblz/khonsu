import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedOrigins, boundedPostRequest, corsResponse,
  GatewayRequestError, isApiPath, validateRequest,
} from "../src/http.ts";

const origins = allowedOrigins("https://khonsu.pages.dev,http://localhost:3000");

test("configuration rejects placeholder, wildcard and path origins", () => {
  for (const value of ["", "https://replace-me.invalid", "https://*.pages.dev", "https://khonsu.pages.dev/path"]) {
    assert.throws(() => allowedOrigins(value));
  }
});

test("gateway route and method boundary does not expose unrelated endpoints", () => {
  assert.equal(isApiPath("/health"), true);
  assert.equal(isApiPath("/v1/sequences/job/manifest"), true);
  for (const path of ["/docs", "/openapi.json", "/v10/presets", "/healthcheck"]) {
    assert.equal(isApiPath(path), false);
  }
  assert.throws(() => validateRequest(new Request("https://api.example/v1/presets", { method: "DELETE" }), origins),
    (error: unknown) => error instanceof GatewayRequestError && error.status === 405);
  assert.throws(() => validateRequest(new Request("https://api.example/health", { method: "POST" }), origins),
    (error: unknown) => error instanceof GatewayRequestError && error.status === 405);
});

test("preflight permits exact configured origins and JSON headers only", () => {
  validateRequest(new Request("https://api.example/v1/sequences", {
    method: "OPTIONS", headers: {
      Origin: "https://khonsu.pages.dev", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  }), origins);
  assert.throws(() => validateRequest(new Request("https://api.example/v1/sequences", {
    headers: { Origin: "https://unknown.example" },
  }), origins), (error: unknown) => error instanceof GatewayRequestError && error.status === 403);
  assert.throws(() => validateRequest(new Request("https://api.example/v1/sequences", {
    method: "OPTIONS", headers: {
      Origin: "https://khonsu.pages.dev", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization",
    },
  }), origins), (error: unknown) => error instanceof GatewayRequestError && error.status === 400);
});

test("body bound applies even without Content-Length", async () => {
  const request = new Request("https://api.example/v1/sequences", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(16 * 1024 + 1),
  });
  validateRequest(request, origins);
  await assert.rejects(() => boundedPostRequest(request),
    (error: unknown) => error instanceof GatewayRequestError && error.status === 413);
});

test("forwarding preserves a JSON request without replaying it", async () => {
  const body = '{"ra_deg":133.7,"dec_deg":-7.2}';
  const request = new Request("https://api.example/v1/sequences", {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  const forwarded = await boundedPostRequest(request);
  assert.equal(forwarded.method, "POST");
  assert.equal(await forwarded.text(), body);
});

test("CORS never preserves a wildcard response or credential permission", () => {
  const request = new Request("https://api.example/v1/presets", { headers: { Origin: "https://khonsu.pages.dev" } });
  const response = corsResponse(new Response("ok", { headers: {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true",
  } }), request, origins);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://khonsu.pages.dev");
  assert.equal(response.headers.has("Access-Control-Allow-Credentials"), false);
});
