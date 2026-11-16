# IRSA outage investigation and recovery (#83)

Checked November 16, 2026. Cloudflare Tunnel and the Khonsu API were healthy, but
IRSA's SIA image-search service returned HTTP 502 Proxy Error. This happened for
our WISE 0855 query, a minimal single-collection query, a north ecliptic pole
query, and IRSA's own documented example. Tests from both Windows and the Docker
backend failed. TAP metadata requests using GET and POST also returned 502,
while the IRSA homepage returned 200. A healthy homepage therefore did not prove
the archive APIs were available.

The [official access guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/)
confirms the SIA endpoint and the DR1/QR3 collection names already used by Khonsu.
The [official cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/)
also documents TAP. Switching to that service would not have restored access
during this check. No speculative alternate adapter or release substitution was
added. Restoring the upstream service is outside this repository's control.

## Changes

The retriever already had bounded retry/backoff for 502 and related transient
errors. Those limits remain unchanged. Exhausted failures now preserve the
archive stage, actual HTTP status and number of attempts in the existing
`ApiError.details` field. Logs contain only those sanitized values. Upstream
response bodies, request URLs and credentials are not exposed. No public schema
or generated type changes are needed.

The console's overlay previously omitted the cached recovery control available
in its older field panel. It now offers **OPEN CACHED REAL OBSERVATIONS** directly,
names the selected saved field and explains that it leaves the live search.
Opening it is a deliberate user action. The existing loader revalidates the
bundle and preserves its title, actual dates and cached-real label. A failed
query never silently receives another field or synthetic stars.

Technical details are collapsed by default. Retry still starts a new live job;
failed jobs are not reused. The buttons retain Khonsu's rectangular amber style
and wrap on narrow screens.

## Verification

- API suite passed in an isolated Python 3.12 container using the checkout as a
  read-only mount. Regression checks cover five failed 502 attempts, sanitized
  diagnostics, propagation through jobs and a new job ID on retry.
- All 111 frontend tests, TypeScript checking and the static export build passed.
- `scripts/verify-archive-recovery.mjs` passed at 1440 and 390 pixels. It injects
  only the failure responses, uses genuine cached assets from the API, verifies
  there is no automatic fallback, checks retry starts another request, then
  explicitly opens the saved field and checks its cached label.
- The browser check verifies visible diagnostics and no horizontal overflow.
  Screenshots were inspected. [Mobile error and recovery action](images/archive-recovery-mobile.png).

For a local static preview, set `KHONSU_TEST_URL` to its origin and configure
the API CORS allowlist accordingly. Set `PLAYWRIGHT_MODULE` and
`CHROMIUM_EXECUTABLE` to local installations when they are not on default paths.
Run `node scripts/verify-archive-recovery.mjs`. Its output defaults to
`.cache/archive-recovery/` and it uses isolated browser storage.

These fixes make the outage actionable. They do not establish that live IRSA
search is restored. The authentic cached example remains usable during it.
