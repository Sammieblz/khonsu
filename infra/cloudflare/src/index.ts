import { DurableObject } from "cloudflare:workers";
import {
  allowedOrigins, boundedPostRequest, corsResponse, errorResponse,
  GatewayRequestError, validateRequest,
} from "./http.ts";

export interface Env {
  KHONSU_API: DurableObjectNamespace<KhonsuContainer>;
  KHONSU_CORS_ORIGINS: string;
}

const PORT = 8000;
const STARTUP_TIMEOUT_MS = 30_000;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const SINGLETON = "khonsu-api-singleton";

// Native API reference: https://developers.cloudflare.com/containers/get-started/
export class KhonsuContainer extends DurableObject<Env> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
      this.observeExit();
    }
  }

  async fetch(request: Request): Promise<Response> {
    // Retry readiness only. Never replay a potentially accepted POST.
    this.starting ??= this.ensureReady().finally(() => { this.starting = undefined; });
    await this.starting;
    const container = this.ctx.container;
    if (!container) throw new Error("Container binding is missing.");
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("Host");
    return container.getTcpPort(PORT).fetch(forwarded);
  }

  private async ensureReady(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error("Container binding is missing.");
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "standard-1",
        enableInternet: true,
        env: { KHONSU_CORS_ORIGINS: this.env.KHONSU_CORS_ORIGINS },
      });
    }
    this.observeExit();
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))),
        });
        const ready = response.ok;
        await response.body?.cancel();
        if (ready) return;
      } catch {
        // The process may be starting. No business request has been forwarded.
      }
      const remaining = deadline - Date.now();
      if (remaining > 0) await scheduler.wait(Math.min(200, remaining));
    }
    throw new Error("Container readiness deadline exceeded.");
  }

  private observeExit(): void {
    if (this.monitoring || !this.ctx.container) return;
    this.monitoring = this.ctx.container.monitor()
      .then(() => { console.log("Khonsu container stopped."); })
      .catch(() => { console.error("Khonsu container failed or could not start."); })
      .finally(() => { this.monitoring = undefined; });
    this.ctx.waitUntil(this.monitoring);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let origins: Set<string>;
    try {
      origins = allowedOrigins(env.KHONSU_CORS_ORIGINS);
    } catch {
      return errorResponse(503, "GATEWAY_NOT_CONFIGURED", "Configure the frontend origin before using this gateway.");
    }
    try {
      validateRequest(request, origins);
      if (request.method === "OPTIONS") {
        return corsResponse(new Response(null, { status: 204 }), request, origins);
      }
      const forwarded = await boundedPostRequest(request);
      const response = await env.KHONSU_API.getByName(SINGLETON).fetch(forwarded);
      return corsResponse(response, request, origins);
    } catch (error) {
      if (error instanceof GatewayRequestError) {
        const response = errorResponse(error.status, error.code, error.message);
        if (error.status === 405) {
          response.headers.set("Allow", new URL(request.url).pathname === "/health"
            ? "GET, OPTIONS" : new URL(request.url).pathname === '/v1/notebook' ? 'GET, PUT, OPTIONS' : "GET, POST, OPTIONS");
        }
        return corsResponse(response, request, origins);
      }
      return corsResponse(errorResponse(
        503, "BACKEND_UNAVAILABLE",
        "The backend is starting or unavailable. Retry the status or search explicitly; POST requests are not replayed.",
      ), request, origins);
    }
  },
} satisfies ExportedHandler<Env>;
