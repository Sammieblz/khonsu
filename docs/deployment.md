# Deployment and runtime

Status: deployment design and contributor guidance. A configuration file or health response does not mean the application is deployed or its SPHEREx processing is complete. Do not provision paid services, publish secrets or claim a live deployment as part of documentation work.

The initial API scaffold advertises `live_processing_available=false`. Live processing endpoints return an explicit `501` response. The opt-in `/v1/demo/manifest` route serves synthetic demo assets, not SPHEREx measurements. Job execution, processing cache and a real-example fallback remain implementation work; the lifecycle below specifies their intended behavior.

## Supported arrangement

| Part | Local development | Planned Cloudflare deployment |
| --- | --- | --- |
| Next.js and TypeScript frontend | Next.js development server. | Static export on Cloudflare Pages. |
| FastAPI and scientific Python | One Docker container with one application process. | One Cloudflare Container instance running the same image. |
| Optional gateway | Direct browser requests to the local API. | A separate Worker forwards allowed API paths to the container. |
| Jobs and cache | Bounded temporary state owned by that API process. | The same temporary design; state can vanish on sleep, restart or replacement. |

Use one backend instance and one process for the initial version because an in-memory job registry is not shared across workers or replicas. Separate the browser, gateway and Python responsibilities. Keep archive downloads and astronomical processing in Python. Keep the gateway thin.

## Local first

Run `docker compose up --build` from the repository root for the declared local services. The web application uses port 3000 and the API uses port 8000. Follow the executable commands and environment examples in the [repository README](../README.md); verify that the compose services and ports match the current files. Install science dependencies inside the backend image so contributors share compatible versions. Use the API health check to establish process readiness, then verify one real search and completed frame sequence separately once live processing exists.

| Environment variable | Meaning | Initial status |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public API origin compiled into the frontend. | Build-time configuration. |
| `KHONSU_CORS_ORIGINS` | Comma-separated permitted browser origins. | Defaults to `http://localhost:3000,http://127.0.0.1:3000`. |
| `KHONSU_FIXTURE_DIR` | Directory of allowlisted demo fixtures. | Uses repository fixtures locally and `/app/fixtures` in Docker. |
| `KHONSU_CACHE_DIR` | Future bounded processing/cache directory. | Reserved; no processing cache is implemented. |
| `KHONSU_JOB_TTL_SECONDS` | Future temporary job retention. | Reserved; not operational. |
| `KHONSU_MAX_ACTIVE_JOBS` | Future active processing limit. | Reserved; not operational. |

Keep the API process running while a job is active. Limit queued jobs, active processing, bytes, frame count, field size and execution duration. Clean temporary files after expiry and cancellation. Make cancellation cooperative between processing stages. Do not accept unlimited image processing from a public route.

For a temporary live demonstration, a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) can expose the local API. It stops when the tunnel process stops; its hostname changes on restart, and uptime is not guaranteed. The laptop and API must stay online. Do not mistake this arrangement for unattended hosting. Rebuild a static frontend when its public API endpoint changes, unless a separately designed runtime configuration mechanism has been implemented.

## Frontend static export

Use Next.js static-export configuration and verify that the production build produces `out/`. In Cloudflare Pages, use the web application's actual repository root, its declared build script and `out` as the output directory. See the [official Pages guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/).

Static export has no running Next.js server. Do not depend on Next.js API routes, server actions, request-time server rendering or server-side middleware for the API. Keep data calls in the client API layer. Ensure nested static routes and search-parameter-driven explorer states work when opened directly. Use an image strategy compatible with [Next.js static export](https://nextjs.org/docs/app/guides/static-exports).

Treat every `NEXT_PUBLIC_*` variable as public browser code. Next.js inlines these values at build time. Configure the API origin before the production build, and rebuild when changing it. Never put archive credentials, Cloudflare tokens or other secrets there. Use the repository's checked-in `.env.example` names rather than inventing parallel configuration names. See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

## Python hosting and cost

Cloudflare Containers run a conventional container environment suited to this project's scientific Python dependencies. They require the Workers Paid plan, starting at $5 USD per month, with included allowances and additional usage charges. Worker, Durable Object, container, network and observability usage can contribute to the total. Configure bounded concurrency and inactivity sleep before exposing an endpoint. Consult current [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/) and [instance sizes](https://developers.cloudflare.com/containers/platform/limits/) before selecting memory.

Python Workers are a different runtime: Pyodide compiled to WebAssembly. Package support and memory limits still apply on paid Workers. Do not move Astropy, NumPy, reproject, Pillow or Astroquery into a Python Worker based solely on a successful ordinary Python install. Verify exact packages, versions and behavior first. The documented Worker memory limit is 128 MB on both free and paid plans, and the free plan's CPU allowance is not an appropriate default for this processing pipeline. See [Python packages](https://developers.cloudflare.com/workers/languages/python/packages/) and [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).

## Gateway and origin configuration

Route only the intended API and frame paths through the gateway. Preserve documented request/response schemas, request identifiers and error behavior. Handle the container's cold start with a visible loading state and bounded retry; do not start duplicate processing jobs when a user retries a pending response. Keep browser origins explicitly configured in the FastAPI Cross-Origin Resource Sharing policy when requests cross origins. Use HTTPS for public endpoints.

Keep server secrets in the deployment environment or secret bindings. Log job identifiers, stage, timing and sanitized failures, not credentials. A static frontend needs no server secrets. Do not silently forward arbitrary user-selected hosts, download URLs or gateway paths.

## Planned temporary job lifecycle

Implement temporary jobs and cache before enabling live processing. The planned first runtime uses temporary state, not durable scientific storage. Keep this limitation visible in API documentation and the UI:

1. Accept a bounded job and return its identity according to the canonical API contract.
2. Expose queued, running, completed, failed, cancelled and expired/reset outcomes as that contract defines them.
3. Publish frame URLs only after their files are ready. Keep job metadata and files consistent.
4. Expire job files and cached inputs according to configured policy. Reclaim space on startup as well as during normal operation.
5. On restart or container replacement, treat missing old jobs as unavailable/expired; let the client explain the reset and start a fresh search. Do not display a completed state for missing frames.

A Docker volume can make local cache survive a process restart, but does not make the in-memory job registry durable. Container sleep and replacement may remove runtime state. Test that path intentionally. Durable storage, multiple replicas and shared queues require a coordinated later design rather than a larger replica count.

## Optional real-example fallback

Ship a small public set of preprocessed real SPHEREx examples only if its provenance and file sizes are reviewed. Keep it usable without a live backend and label it clearly as a cached example. Never silently switch a user's requested coordinates to a different preset or replace failed archive data with synthetic observations. Include a recording and repository link in the submission so later judges can understand the live workflow even when the temporary backend is unavailable.

## Release check

Verify a production frontend build, a backend container start, the public API origin, permitted browser origins, a cold start, a completed real sequence, cancellation/expiry, a restart with an old job identifier, upstream archive failure, and the optional example fallback. Recheck current host pricing and limits before deploying. Follow [integration.md](integration.md) and [testing.md](testing.md) for the team's merge and acceptance checks.
