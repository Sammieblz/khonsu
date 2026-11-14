# Ownership and collaboration

Ownership means responsibility for delivery and review. It is not exclusive access. New contributors can take a bounded ticket and coordinate with its owner. The roles below retain the requested Michael and Aryan role swap.

| Engineer | Feature responsibility | Primary edit boundary | Reviewer or handoff |
| --- | --- | --- | --- |
| Samuel Ndubuisi | FITS processing, image registration, quality, science validation | `apps/api/app/processing/`, science tests and real fixture processing manifests | Tyrone for input/output contracts |
| Tyrone A. Johnson | IRSA retrieval, API, jobs, contracts, deployment and integration | `apps/api/app/retrieval/`, API routes and schemas, `contracts/`, `scripts/export-contracts.py`, `infra/`, Compose and CI | Samuel for science; Robel for browser contract |
| Robel Mezgebe | Frontend composition, branding, responsive shell and shared controls | `apps/web/src/app/`, `src/components/ui/`, `src/features/explorer/`, global styles and web configuration | Michael and Aryan for feature seams |
| Michael Ameteku | Frame loading, Canvas viewer, epoch selection, playback and blink, pan and zoom | `apps/web/src/features/viewer/` and viewer tests | Robel for composition; Samuel for valid display |
| Aryan Pai | Candidate notes, local persistence, evidence export, guidance, accessibility and acceptance QA | `apps/web/src/features/annotations/`, quality/guidance components and acceptance scenarios | Samuel for evidence; Michael for coordinates |

GitHub identity status on November 14: Samuel is verified as `Sammieblz`. Repository invites identify Tyrone as `Tajohnson245` and Aryan as `AryanP27`, pending acceptance. Two Michael accounts, `ameteku` and `ameteku1`, are invited, so his correct account needs confirmation. Robel's GitHub identity needs confirmation. Space Apps usernames are not proof of GitHub identity. Track named human owners even when the assignee field is unavailable; never assign a guessed account.

## Shared files

- Robel owns JavaScript package changes, lockfile updates, `src/app/page.tsx` composition, design tokens, and shared UI primitives.
- Tyrone owns Python dependency manifests, API schemas, OpenAPI snapshot, generated client declarations, CI, Compose, and deployment configuration.
- Samuel owns the registration algorithm and science parameters. Retrieval downloads files; processing consumes local files and returns artifacts.
- The frontend parent owns active sequence, current frame, tool mode, and A/B selection. Michael emits viewer interaction events. Aryan consumes the same selected frame and WCS metadata to attach annotations.
- A contributor proposing a shared-file edit posts the proposed interface in the issue before implementation, asks the owner for review, and avoids unrelated refactoring. Urgent fixes may proceed in a small PR with the owner tagged once verified.
- Document decisions in `docs/decisions.md` when they change a contract, scope, dependency, or deployment assumption.

## Preventing conflicts

Use one branch per ticket and small pull requests with a single outcome. Pull main before starting, and rebase or merge main before review. Do not keep a multi-day branch rewriting other feature folders. Avoid broad formatting changes, dependency upgrades, or generated-file edits unrelated to your ticket.

Only one contributor regenerates shared contracts at a time. Include Python schemas, OpenAPI snapshot, and TypeScript declarations in the same pull request. Separate feature implementation from dependency changes when possible. Review merge conflicts semantically, especially coordinate units, wavelength metadata, job states, and generated types.

## Kanban policy

Backlog means a ticket is planned or blocked. Ready means its dependencies, inputs, and acceptance criteria are available. In progress means one person is actively working. In review means a PR and verification evidence exist. Done requires merge plus acceptance verification. Keep blocked dependencies linked in the issue body and do not close a science feature with placeholder data.

The existing board has column limits. Use those as prompts to finish and review work rather than starting everything at once. Prioritize P0 tickets and the first end-to-end real-data path. Future contributors should begin with a narrow Ready issue, follow CONTRIBUTING.md, and request review from the responsible feature owner.
