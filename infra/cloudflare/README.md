# Cloudflare gateway and Python container

This is an unprovisioned starter for the same `apps/api/Dockerfile` used locally. It uses the native Durable Object Container API documented on November 9, 2026, without `@cloudflare/containers`. The `durable_object` scheduling policy is currently documented as beta. No Cloudflare resource has been created or paid deployment verified by adding these files.

## Topology and limits

Cloudflare Pages serves the Next.js static export. The browser calls this separate Worker, which forwards permitted API requests to one fixed Durable Object name and its Python container on port 8000. The API image still runs one Uvicorn process. The native policy rejects `max_instances`; singleton routing here comes from a fixed name, never a user-controlled path or query parameter.

Only GET and POST on `/v1` API paths and GET on `/health` are forwarded. CORS preflight is handled without starting a container. Other paths, methods and browser origins are rejected. POST requires JSON and is bounded to 16 KiB even without a Content-Length header. The gateway never retries a forwarded POST, so a transport failure after acceptance must be resolved using a job/status lookup or explicit user action.

`KHONSU_CORS_ORIGINS` is passed into the API process and used for gateway responses. CORS is browser policy, not authentication or a complete abuse/cost control. Requests without Origin, including command-line tools, can access the API. The archive adapter still owns download-host validation, byte limits and job bounds. Outbound container Internet access is enabled for IRSA requests; the gateway is not a general URL proxy.

## Configure locally

Run from `infra/cloudflare` with Node.js 22.13+ and a working Docker engine:

```sh
cp wrangler.jsonc.example wrangler.jsonc
npm ci
```

In PowerShell, replace `cp` with `Copy-Item -LiteralPath wrangler.jsonc.example -Destination wrangler.jsonc` if preferred. Edit `KHONSU_CORS_ORIGINS` before serving requests. The placeholder `https://replace-me.invalid` is deliberately rejected. For local development use `http://localhost:3000,http://127.0.0.1:3000`; for hosting use exact HTTPS frontend origins without a trailing slash, wildcard or path.

The config paths are relative to this directory: `../../apps/api/Dockerfile` selects the existing API Dockerfile, and `../..` provides repository-root build context so its `COPY apps/api/...` and `COPY fixtures/...` instructions work. The deployed image must support `linux/amd64`. Do not make a separate scientific Python Dockerfile here.

```sh
npm run check
npm run dev
```

Wrangler generates runtime and binding types in `worker-configuration.d.ts`; `tsc` checks against those types. This avoids relying on stale manually declared container APIs or an old `@cloudflare/workers-types` package. Exact top-level pins are Wrangler 4.162.0, verified as a November 13 release, and TypeScript 5.9.3, matching the official Containers template. `package-lock.json` is committed; install with `npm ci` and review lockfile diffs with any dependency change. npm 11 may report that the `esbuild` and `workerd` install scripts are not covered by `allowScripts`. With npm 11.19 on Windows, the test and typecheck commands passed and the `esbuild`, `workerd` and `wrangler` binaries ran without those scripts.

`npm test` needs only Node's built-in test runner and TypeScript stripping. Tests cover request, route, CORS and body boundaries. `npm run bundle` is a non-publishing Worker dry run after configuration and dependency installation; it does not prove a container deployment or live archive integration. No dependency install or container lifecycle test is implied by a successful source-only test.

## Lifecycle and deployment review

The Worker starts a `standard-1` instance, currently 4 GiB, and waits at most 30 seconds for a successful `/health` probe. Concurrent requests share readiness work. A `503` with Retry-After means startup or availability failed, not that a science job completed. Initial Cloudflare image provisioning can take longer than one request; retry a safe health request after reviewing deployment status.

The inactivity timeout is ten minutes and is restored after a Durable Object restart. Browser polling ordinarily keeps the object active, but container background computation does not independently guarantee that the Durable Object remains active. Before enabling long jobs, coordinate a bounded keepalive/job-lifetime design with the API owner, or accept and expose job loss after inactivity. Do not claim durable jobs from Durable Object SQLite declarations: this starter does not persist the Python registry or files there. Sleep, restart and replacement may reset temporary state. Profile real workload memory before changing instance size.

Deployment requires the Workers Paid plan, starting at $5 USD per month plus applicable usage. Only after the user chooses to provision that service, configure the intended Cloudflare account and origin, review cost controls, and run `npm run deploy`. Deployment is a paid provisioning action, not a validation command. Do not connect an automatic production deploy to this starter without that decision.

After an authorized deployment, verify Worker and container status, `/health`, allowed/disallowed origins, synthetic demo labeling, live endpoints' truthful unimplemented responses, cold start, restart/reset and the eventual real science flow. Set the frontend's `NEXT_PUBLIC_API_BASE_URL` to the gateway HTTPS origin before building Pages. Public Next.js environment values are frozen at build time; rebuild when this origin changes. This starter does not complete SPHEREx retrieval or processing.

## Primary references

- [Native API starter](https://developers.cloudflare.com/containers/get-started/)
- [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
- [Current Wrangler configuration, including named-image build contexts](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Containers deployment behavior](https://developers.cloudflare.com/containers/guides/deploy/)
- [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
- [Official starter dependencies](https://github.com/cloudflare/templates/blob/main/containers-template/package.json)
- [Wrangler 4.162.0 release](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.162.0)
- [Repository deployment policy](../../docs/deployment.md)
