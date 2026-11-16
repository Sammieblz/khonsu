# Pages with a local Docker API

This is the user-selected deployment path for `api.khonsulive.earth` (#80).
Pages serves the static frontend. A named Cloudflare Tunnel connects the public
API hostname to the existing local Python container. It does not provision a
Worker or Cloudflare Container and does not require Workers Paid. The computer,
Internet connection, Docker Desktop and tunnel must remain running. Sleep or
shutdown makes the API unavailable.

## One-time Cloudflare setup

1. In Cloudflare, open **Networking > Tunnels** and create a named tunnel such as
   `khonsu-local-api`. Older dashboard navigation may place this under Zero Trust.
2. Obtain its connector token. Save only the token in the local file
   `.secrets/cloudflare-tunnel-token`, using UTF-8 without a BOM. The directory is
   ignored by Git. Never paste the token into an issue, public frontend variable
   or a command committed to the repository. This is a tunnel connector token,
   not an account API token.
3. Add a published application route for `api.khonsulive.earth`. Choose HTTP and
   service URL **`http://api:8000`**. The connector runs in the Compose network,
   where `api` resolves to the backend. `localhost:8000` is appropriate only for
   a connector installed directly on Windows; it is wrong inside this container.
4. If the hostname already has an A, AAAA or CNAME record, inspect and replace
   only its old API record when connecting the route. The tunnel record points
   to `<tunnel-id>.cfargotunnel.com`. Do not change the frontend's root or `www`
   records. Keep Cloudflare's normal TLS validation; do not fix an old 525 by
   disabling TLS validation or selecting Flexible SSL.

See [Cloudflare's tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
and [token-file support](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/#token-file).

## Start the backend and connector

Run from the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Path .secrets -Force
notepad .secrets/cloudflare-tunnel-token
docker compose -f compose.yaml -f compose.tunnel.yaml config --quiet
docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build api cloudflared
docker compose -f compose.yaml -f compose.tunnel.yaml ps
docker compose -f compose.yaml -f compose.tunnel.yaml logs --tail 30 cloudflared
```

The pinned connector reads the token from a mounted Compose secret. Its command
and environment do not contain the token. Local Docker administrators can still
read the file; Compose secrets here are file mounts, not an encrypted vault.
The connector has no published host ports. The API remains bound to loopback
port 8000; no inbound router forwarding is needed. Both containers restart after
Docker restarts unless explicitly stopped. Docker Desktop itself must be running.

The overlay reuses the API image, one science worker, existing resource bounds
and `notebook-data` volume. Recreating the API expires temporary science jobs but
does not delete notebooks. Never use `docker compose down -v` for routine updates.
This direct API path does not run the optional Worker's request filters; FastAPI
validation, notebook body limits and science queue/download bounds still apply.
CORS is a browser policy, not authentication or comprehensive abuse prevention.

## Connect Pages

Set the production Pages build environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.khonsulive.earth
```

Rebuild/redeploy Pages after changing it. Existing JavaScript bundles retain the
old address until rebuilt. Keep the existing `apps/web` root, `npm ci && npm run
build` command and `out` output directory. This integration changes no frontend
API contract.

The overlay permits `https://khonsulive.earth`, `https://www.khonsulive.earth` and
the two local development origins. If using a `pages.dev` hostname, add its exact
origin to `KHONSU_TUNNEL_CORS_ORIGINS` in the root `.env`, keeping the other needed
origins, then rerun the Compose command. Do not use a wildcard. The ordinary
local Compose file continues to use `KHONSU_CORS_ORIGINS`.

## Verify before announcing the public URL

```powershell
python scripts/verify-tunnel.py --cancel-job
python scripts/verify-tunnel.py --base-url https://api.khonsulive.earth --cancel-job
docker compose -f compose.yaml -f compose.tunnel.yaml exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://cloudflared:2000/ready', timeout=5).status)"
```

The smoke check verifies health with scientific dependencies, exact allowed and
denied-origin behavior, POST and notebook PUT preflight, five presets, a real
cached PNG, input validation, JSON cancellation and an isolated private notebook
read. `--cancel-job` creates and immediately cancels one bounded archive request.
It does not claim a completed live science sequence. Omit that flag for a check
that does not start archive work. Connector readiness alone does not prove DNS
or the Pages configuration is correct.

On the public console, load the cached WISE 0855 example, step dates, save a test
note and reload. Then run one small coordinate search to completion and verify
its dated frames. Check browser Network requests use the public API origin and
that no CORS errors occur. A 525 usually indicates the hostname still reaches
an old TLS origin; 502 suggests a wrong service URL or stopped API; a tunnel
connection error suggests the connector is offline. Inspect status and logs
before changing configuration.

## Stop or return to local-only operation

```powershell
docker compose -f compose.yaml -f compose.tunnel.yaml stop cloudflared
docker compose up -d --no-deps api
```

This stops public API forwarding and restores the ordinary local API settings.
It keeps the notebook volume. Do not delete unrelated DNS records or containers.

## Acceptance record

Before account setup, local `/health` passed but the existing public API returned
HTTP 525. No Cloudflare login or connector token was available to this session.
The local API passed the smoke check for the root, www and localhost origins,
including one actual job creation and JSON cancellation. The pinned
`cloudflare/cloudflared:2026.11.0` image ran, and both Compose configurations
validated. A temporary Quick Tunnel on the same Docker network passed the full
HTTPS smoke check and connector readiness returned 200. This establishes the
Docker-to-Cloudflare transport, not the named domain or a finished live sequence.

The named-domain check still requires the account-owned route and connector
token. No successful `api.khonsulive.earth` deployment or Pages rebuild is claimed.
Merging this configuration does not establish public uptime.
