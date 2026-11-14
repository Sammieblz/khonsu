---
name: khonsu-integration-delivery
description: Coordinate, integrate or review Khonsu changes across the five-engineer team, API contracts, shared configuration, dependencies, checks, Docker runtime and release documentation. Use for pull-request preparation, merge conflicts, handoffs, deployment readiness and end-to-end acceptance.
---

# Khonsu integration and delivery

1. Read [ownership.md](../../../docs/ownership.md), [integration.md](../../../docs/integration.md), [mvp.md](../../../docs/mvp.md), [testing.md](../../../docs/testing.md) and [CONTRIBUTING.md](../../../CONTRIBUTING.md). Confirm the requested scope and integration owner.
2. Keep changes inside owned modules. Coordinate edits to page composition, global styles, schemas, generated contracts, lockfiles and deployment configuration before touching those shared seams. Preserve other contributors' work when resolving conflicts.
3. Integrate small vertical slices against agreed interfaces and real examples. Keep generated schemas, clients and fixtures consistent. Route dependency additions through the designated lockfile owner.
4. Check the core path from coordinates to real SPHEREx data, processed frames, timestamped playback, quality and annotations. Distinguish implemented behavior from mocks, placeholders and proposed roadmap items.
5. Follow [deployment.md](../../../docs/deployment.md) for static Pages builds, build-time public configuration, a separate gateway and one Python container process. Test cold start and reset behavior without assuming temporary jobs are durable.
6. Run relevant documented checks once the change is ready. Include scientific correctness checks where processing changed and responsive or accessibility checks where UI changed. Verify no credentials, generated caches, misleading claims or prohibited punctuation entered the diff.
7. Prepare a concrete handoff listing behavior, files, validation and limits. Keep optional features out of the Sunday critical path. Do not provision paid hosting, publish externally, alter permissions or claim deployment unless that action is authorized and its outcome verified.
