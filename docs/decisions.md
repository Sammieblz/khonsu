# Decisions

| Date | Decision | Reason and consequence |
| --- | --- | --- |
| 2026-11-14 | Next.js App Router with static export on Cloudflare Pages | Matches team preference, avoids a Vite setup, and keeps the frontend independent from Python hosting |
| 2026-11-14 | FastAPI in one normal CPython Docker image | Scientific libraries need the native Python ecosystem; the same image serves local and Cloudflare Containers paths |
| 2026-11-14 | Local Docker first; Cloudflare Containers documented | Zero cloud cost locally; Containers requires a paid Workers plan and usage budgeting |
| 2026-11-14 | No Render, database, auth, Redis or Celery for MVP | Complete the observation-to-evidence path within the weekend |
| 2026-11-14 | Original Khonsu identity and real-epoch sky swipe | Preserve the cinematic idea while keeping data, coordinates and scientific claims truthful |
| 2026-11-14 | Michael owns viewer; Aryan owns discovery and quality | Retains the explicitly requested role swap |
| 2026-11-14 | Public Python schema generates client contract | Reduce integration drift and shared-file conflicts |

Append a short dated entry when a decision changes. Include the issue or pull request and the concrete tradeoff. Do not overwrite scientific limitations with presentation claims.
