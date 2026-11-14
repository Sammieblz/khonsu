---
name: khonsu-frontend-brand
description: Design, implement or review Khonsu frontend screens, navigation, responsive layouts, brand tokens, accessibility and visual polish. Use for Next.js shell, pages, controls, typography, color, motion, empty states or mission-context UI changes in this repository.
---

# Khonsu frontend and brand

1. Read [design-system.md](../../../docs/design-system.md), [architecture.md](../../../docs/architecture.md) and [ownership.md](../../../docs/ownership.md). Follow the canonical Khonsu spelling, design tokens and current frontend ownership.
2. Read the existing component and token files before adding styles. Reuse shared controls, spacing, type and status patterns. Keep global styles and page composition with the shell owner; coordinate any shared-file change first.
3. Build the explorer around the science task: choose a sky region, compare dated observations, inspect context and mark a candidate. Keep mission 3D optional and clearly separate from real image observations.
4. Use the shared API contract and client. Preserve distinct loading, no-data, failed, expired and example states. Do not substitute synthetic imagery or a different preset after a failed live search.
5. Preserve keyboard navigation, visible focus, meaningful labels, touch targets, sufficient contrast and reduced-motion preferences. Keep controls operable without dragging or color recognition alone.
6. Verify narrow and wide layouts, long labels, slow data, missing coverage and direct-link opening. Keep observation metadata readable beside the viewer rather than covering the scientific image.
7. Run the relevant checks in [testing.md](../../../docs/testing.md). Report changed files, visible behavior and any unverified state. Keep unrelated viewer internals and dependencies unchanged unless coordinated.
