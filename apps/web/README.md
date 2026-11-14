# Khonsu frontend

Next.js App Router, TypeScript, and CSS Modules. The public frontend is a static export for Cloudflare Pages. Python and scientific packages run in the separate backend container.

## Local development

Use Node.js 24. Install the locked dependencies with `npm ci` in this directory, copy `.env.example` to `.env.local`, then run `npm run dev`. Start the backend separately using the repository's Docker Compose instructions.

`NEXT_PUBLIC_API_BASE_URL` defaults to `http://localhost:8000`. This is public, build-time browser configuration. A deployed frontend must be rebuilt with the deployed backend address; `localhost` in a visitor's browser points to that visitor's computer.

## Commands

- `npm run dev`: Next.js development server.
- `npm run typecheck`: strict TypeScript check.
- `npm test`: coordinate, raster-selection, annotation-storage, and time-navigation checks using Node's built-in test runner.
- `npm run build`: production static export to `out/`.

`package-lock.json` is committed. Use `npm ci` for a reproducible install. Change dependencies only through Robel (see `docs/ownership.md`): run `npm install <package>` deliberately, review the lockfile diff and commit both files in one focused pull request. The production static export is built in CI.

## Ownership

- Robel: `src/app/`, `src/components/ui/`, `src/features/explorer/`, styles and frontend dependency files.
- Michael: `src/features/viewer/`.
- Aryan: `src/features/annotations/`.
- Tyrone: `src/lib/api/`, including the generated API definitions supplied by the backend schema exporter.

Coordinate shared interfaces in `src/features/explorer/interfaces.ts` before changing component signatures. Import API shapes from `src/lib/api/generated.d.ts`; do not invent a second copy.

## Honest scaffold behavior

The initial screen displays no astronomy images. It explicitly says the observation pipeline is not connected. Submitting coordinates calls `POST /v1/sequences` and surfaces the backend's current explicit not-implemented error. The reference targets are names from the challenge, not claims of downloaded or validated observations.

Viewer and annotation modules contain initial isolated implementations for the assigned owners to extend. Pan/zoom and sky-drag time controls are reserved and visibly disabled or documented. The job-to-manifest flow, real data, keyboard marking, actual epoch-gap timeline, and comparison modes remain implementation work.

Do not turn the backend's opt-in synthetic fixture into default imagery or label it as SPHEREx data. Keep synthetic disclosure visible if a development fixture is enabled later.

Fonts are requested by a browser stylesheet from Google Fonts, with system fallbacks. Builds do not fetch fonts through `next/font`. Self-host licensed font assets for an offline presentation if desired.
