# Verified scaffold status

Updated November 14, 2026. [Pull request #23](https://github.com/Sammieblz/khonsu/pull/23) established the foundation on main.

## Verification evidence

All five jobs passed in [Actions run 43576146148](https://github.com/Sammieblz/khonsu/actions/runs/43576146148) for the reviewed scaffold:

| Job | Evidence |
| --- | --- |
| Repository | Required files, local Markdown links, skill metadata and prohibited-punctuation scan |
| API | Runtime request/response and fixture tests, plus live FastAPI contract/type consistency |
| Web | Nine logic tests, TypeScript checking, Next.js 16.4.6 production build and static export |
| Gateway | Six request-boundary tests, generated Wrangler runtime types and TypeScript checking |
| Containers | Both images build, both services become healthy, API and frontend respond |

Six repository-local skills also passed the official skill-creator validator when authored. A fresh-agent scientific workflow check respected the WCS, wavelength, provenance and preliminary-candidate rules.

The OpenAPI snapshot began as an offline bootstrap. CI now verifies its schema and endpoint semantics against the actual FastAPI app and verifies generated TypeScript exactly. A normal `python scripts/export-contracts.py` export should replace bootstrap documentation metadata on the next dependency-enabled contract update. That is separate from the successful semantic check.

## Remaining implementation

The actual SPHEREx retrieval and scientific processing routes remain explicit HTTP 501 placeholders. Target coordinates and coverage are not verified yet. The synthetic development fixture does not satisfy the real-data MVP. Complete the [MVP checklist](mvp.md) through [issues #1 through #22](roadmap.md).

Pan and zoom, direct sky scrubbing, actual irregular epoch spacing, real image sequences, job polling/cancellation/expiry, evidence export, scientific quality checks and the authentic cached fallback remain implementation tasks. No Cloudflare account, paid plan, hosted backend or public frontend was provisioned.

The initial npm manifests build successfully in CI. Robel and Tyrone should review and commit the generated web and gateway package locks in the baseline task before parallel dependency changes, then switch install commands to `npm ci`. Dependency lock artifacts are available in the successful Actions run.

## Planning state

All 22 issues are in [Project 14](https://github.com/users/Sammieblz/projects/14), with priority, effort, Sunday November 15 target date and named Feature owner fields. The scaffold baseline is In review. Independent first tasks #2, #4, #5, #6 and #19 are Ready; dependent work remains in Backlog.

Samuel's five tickets are assigned to `Sammieblz`. Tyrone and Aryan have pending repository invitations, and GitHub rejected assignment to a pending invite. Michael's two invited accounts require confirmation; Robel's GitHub username is unverified. Human ownership remains explicit in every issue and in the board's Feature owner field. Complete account assignments after the correct accounts accept repository access.

The user deadline is Sunday November 15, 2026 at 11:59 PM. Planning uses America/New_York until the event portal's official timezone is verified. Keep the internal 20:00 release buffer.
