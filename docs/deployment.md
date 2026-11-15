# Deployment and runtime

Status: deployment design and contributor guidance. A configuration file or health response does not mean the application is deployed or its SPHEREx processing is complete. Do not provision paid services, publish secrets or claim a live deployment as part of documentation work.

The API advertises `live_processing_available` according to installed scientific dependencies. The Docker image installs them by default. Live searches create HTTP 202 jobs; poll status, fetch the manifest, and then retrieve PNG frames. The opt-in `/v1/demo/manifest` remains synthetic. Cached-real examples are served only when verified files are actually bundled; the list can be empty. The frontend runs the full live search path against a local or configured backend. No Cloudflare resource has been provisioned; see [hosted path status](#hosted-path-status) for what has been verified and the remaining account prerequisite.

## Supported arrangement

| Part | Local development | Planned Cloudflare deployment |
| --- | --- | --- |
| Next.js and TypeScript frontend | Next.js development server. | Static export on Cloudflare Pages. |
| FastAPI and scientific Python | One Docker container with one application process. | One Cloudflare Container instance running the same image. |
| Optional gateway | Direct browser requests to the local API. | A separate Worker forwards allowed API paths to the container. |
| Jobs and cache | Bounded temporary state owned by that API process. | The same temporary design; state can vanish on sleep, restart or replacement. |

Use one backend instance and one process for the initial version because an in-memory job registry is not shared across workers or replicas. Separate the browser, gateway and Python responsibilities. Keep archive downloads and astronomical processing in Python. Keep the gateway thin.

## Local first

Run `docker compose up --build` from the repository root for the declared local services. The web application uses port 3000 and the API uses port 8000. Follow the executable commands and environment examples in the [repository README](../README.md); verify that the compose services and ports match the current files. Install science dependencies inside the backend image so contributors share compatible versions. Use the API health check to establish process readiness, then verify one real search and completed frame sequence separately.

| Environment variable | Meaning | Initial status |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public API origin compiled into the frontend. | Build-time configuration. |
| `KHONSU_CORS_ORIGINS` | Comma-separated permitted browser origins. | Defaults to `http://localhost:3000,http://127.0.0.1:3000`. |
| `KHONSU_FIXTURE_DIR` | Directory of allowlisted demo fixtures. | Uses repository fixtures locally and `/app/fixtures` in Docker. |
| `KHONSU_CACHE_DIR` | Temporary processing/cache directory. | Defaults under the operating system temp directory. |
| `KHONSU_JOB_TTL_SECONDS` | Completed job retention, measured from completion. | Defaults to 1800 seconds; minimum 60. |
| `KHONSU_QUEUE_LIMIT` | Maximum unfinished worker tasks, including cancelled tasks still unwinding. | Defaults to 8, bounded from 1 to 8; one science worker. |

Keep the API process running while a job is active. Limit queued jobs, active processing, bytes, frame count, field size and execution duration. Clean temporary files after expiry and cancellation. Make cancellation cooperative between processing stages. Do not accept unlimited image processing from a public route.

For a temporary live demonstration, a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) can expose the local API. It stops when the tunnel process stops; its hostname changes on restart, and uptime is not guaranteed. The laptop and API must stay online. Do not mistake this arrangement for unattended hosting. Rebuild a static frontend when its public API endpoint changes, unless a separately designed runtime configuration mechanism has been implemented.

## Frontend static export

Use Next.js static-export configuration and verify that the production build produces `out/`. See the [official Pages guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/) and [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/). Configure the Pages project with these settings:

| Pages setting | Value |
| --- | --- |
| Root directory | `apps/web` |
| Framework preset | Next.js (Static HTML Export) |
| Build command | `npm ci && npm run build` |
| Build output directory | `out` |
| `NEXT_PUBLIC_API_BASE_URL` | The gateway's HTTPS origin, for example `https://khonsu-api.<subdomain>.workers.dev`, with no path |
| `NEXT_TELEMETRY_DISABLED` | `1` |
| Node.js | 24, from `apps/web/.node-version`, matching CI and the web image. Without it the current build image defaults to Node 22. |

Pages sets `CF_PAGES=1` during its builds. `apps/web/next.config.ts` then refuses to build unless `NEXT_PUBLIC_API_BASE_URL` is an HTTPS origin. Without that check, a public build would fall back to `http://localhost:8000` and send every visitor's browser to their own computer. The browser client has a matching guard. If a page served from a non-local host is still configured for a loopback API, or an HTTPS page for an `http` API, it sends no request. It shows "Site not connected to a service" instead.

Add the production Pages origin, for example `https://<project>.pages.dev`, and any custom domain to the gateway's `KHONSU_CORS_ORIGINS`. Preview deployments have their own hostnames and stay blocked unless they are listed too.

Static export has no running Next.js server. Do not depend on Next.js API routes, server actions, request-time server rendering or server-side middleware for the API. Keep data calls in the client API layer. Ensure nested static routes and search-parameter-driven explorer states work when opened directly. Use an image strategy compatible with [Next.js static export](https://nextjs.org/docs/app/guides/static-exports).

Treat every `NEXT_PUBLIC_*` variable as public browser code. Next.js inlines these values at build time. Configure the API origin before the production build, and rebuild when changing it. Never put archive credentials, Cloudflare tokens or other secrets there. Use the repository's checked-in `.env.example` names rather than inventing parallel configuration names. See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

## Python hosting and cost

Cloudflare Containers run a conventional container environment suited to this project's scientific Python dependencies. They require the Workers Paid plan, starting at $5 USD per month, with included allowances and additional usage charges. Worker, Durable Object, container, network and observability usage can contribute to the total. Configure bounded concurrency and inactivity sleep before exposing an endpoint. Consult current [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/) and [instance sizes](https://developers.cloudflare.com/containers/platform/limits/) before selecting memory.

Python Workers are a different runtime: Pyodide compiled to WebAssembly. Package support and memory limits still apply on paid Workers. Do not move Astropy, NumPy, reproject, Pillow or Astroquery into a Python Worker based solely on a successful ordinary Python install. Verify exact packages, versions and behavior first. The documented Worker memory limit is 128 MB on both free and paid plans, and the free plan's CPU allowance is not an appropriate default for this processing pipeline. See [Python packages](https://developers.cloudflare.com/workers/languages/python/packages/) and [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).

## Gateway and origin configuration

Route only the intended API and frame paths through the gateway. Preserve documented request/response schemas, request identifiers and error behavior. Handle the container's cold start with a visible loading state and bounded retry; do not start duplicate processing jobs when a user retries a pending response. Keep browser origins explicitly configured in the FastAPI Cross-Origin Resource Sharing policy when requests cross origins. Use HTTPS for public endpoints.

Keep server secrets in the deployment environment or secret bindings. Log job identifiers, stage, timing and sanitized failures, not credentials. A static frontend needs no server secrets. Do not silently forward arbitrary user-selected hosts, download URLs or gateway paths.

## Temporary job lifecycle

The backend uses temporary state, not durable scientific storage. Keep this limitation visible in API documentation and the UI:

1. Accept a bounded job and return its identity according to the canonical API contract.
2. Expose queued, running, completed, failed, cancelled and expired/reset outcomes as that contract defines them.
3. Publish frame URLs only after their files are ready. Keep job metadata and files consistent.
4. Expire job files and cached inputs according to configured policy. Reclaim space on startup as well as during normal operation.
5. On restart or container replacement, treat missing old jobs as unavailable/expired; let the client explain the reset and start a fresh search. Do not display a completed state for missing frames.

A Docker volume can make local cache survive a process restart, but does not make the in-memory job registry durable. Container sleep and replacement may remove runtime state. Test that path intentionally. Durable storage, multiple replicas and shared queues require a coordinated later design rather than a larger replica count.

## Optional real-example fallback

Ship a small public set of preprocessed real SPHEREx examples only if its provenance and file sizes are reviewed. Keep it usable without a live backend and label it clearly as a cached example. Never silently switch a user's requested coordinates to a different preset or replace failed archive data with synthetic observations. Include a recording and repository link in the submission so later judges can understand the live workflow even when the temporary backend is unavailable.

## Hosted path status

Checked on November 14, 2026 (BYT-32) without any Cloudflare account or paid service:

| Check | Result |
| --- | --- |
| Gateway type check and tests (`npm run check` in `infra/cloudflare`) | Passed, 6 tests |
| Deploy dry run (`npm run bundle`) | Built the API image from `apps/api/Dockerfile` with repository-root context and bundled the Worker (9 KiB); nothing published |
| The same image run with only the environment the Worker passes (`KHONSU_CORS_ORIGINS`) | Healthy as the non-root `khonsu` user with live processing available and both cached examples bundled |
| Static production build served to headless Edge, API origin set at build time | Cached example, a live NEP search (2 real frames) and a container restart mid-search ("Search expired" with Retry) all worked; requests went only to the configured origin |
| Pages build guard (`CF_PAGES=1`) | Fails with no API origin or an `http` origin; succeeds with an `https` origin, which then appears in the bundle with no localhost fallback |
| Unconfigured build opened at a non-local hostname | Zero requests to `localhost:8000`; both panels explain that the site is not connected |

Not verified: the Worker and container together. `wrangler dev` does not support local containers on native Windows. Run it on Linux, macOS or WSL with Docker available to rehearse the gateway end to end.

Remaining prerequisite for a hosted backend: a Cloudflare account on the Workers Paid plan, which the team must choose to purchase. Then follow [the gateway README](../infra/cloudflare/README.md):

1. Set the Pages origin in `KHONSU_CORS_ORIGINS` and run `npm run deploy`.
2. Build Pages with the gateway origin.
3. From the deployed frontend, check `/health`, an allowed and a disallowed origin, the cached example, a live search, a cold start and a restart with an old job.

Record the URL and results only after that run.

## Demonstration fallback

If cloud provisioning is blocked or the hosted backend fails, present from a laptop:

1. Run `docker compose up --build`, then open `http://localhost:3000`. Live searches reach IRSA directly from that machine.
2. If the archive is unavailable, use "Load cached real example". It needs only the local API and stays labelled as previously acquired data.
3. For a remote audience, a Quick Tunnel can expose the local API as described in [Local first](#local-first). Rebuild Pages with the tunnel's HTTPS origin, and start the local API with the Pages origin in `KHONSU_CORS_ORIGINS`. Treat this as a demonstration mode, not hosting.

## Release check

Verify a production frontend build, a backend container start, the public API origin, permitted browser origins, a cold start, a completed real sequence, cancellation/expiry, a restart with an old job identifier, upstream archive failure, and the optional example fallback. Recheck current host pricing and limits before deploying. Follow [integration.md](integration.md) and [testing.md](testing.md) for the team's merge and acceptance checks.

The cache has a one GiB budget with a conservative 512 MiB reservation before each worker starts. An expired cache entry is removed only after its worker finishes. Jobs fail with CACHE_FULL when headroom is insufficient rather than silently evicting unexpired evidence. Cancellation remains cooperative; it does not create new queue capacity until the worker task exits.

