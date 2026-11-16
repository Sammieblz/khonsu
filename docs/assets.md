# Asset and inspiration register

| Item | Role | Usage policy |
| --- | --- | --- |
| Khonsu wordmark and crescent/observation mark | Original project identity | Authored in this repository, MIT code license |
| SPHEREx images | Scientific evidence | Preserve IRSA provenance, acknowledgements and release-specific terms |
| Barlow Condensed, Manrope, IBM Plex Mono | Display, body and science labels | Use official distributions, verify and retain SIL Open Font License files when bundling |
| NASA Eyes | Optional separate mission context | Use official link or permitted embed, retain NASA credit, keep simulation time distinct |
| Moon Knight sky rewind | Interaction inspiration described by the team | No copied footage, audio, character imagery or Marvel marks |
| ORION and SPACED reference screenshots | Composition and atmosphere inspiration | No copied artwork, layout tracing, paid assets or implied license |
| Dribbble SPACED interaction concept | Motion and editorial inspiration | Study behavior; create original assets and implementation |

The supplied TikTok video could not be fully viewed because of its access gate. The team's scene description guides the interaction idea. Do not claim frame-level analysis of inaccessible footage.

References:

- https://dribbble.com/shots/4192060-SPACED-Website-Concept-Interactions
- https://spherex.caltech.edu/
- https://eyes.nasa.gov/apps/solar-system/#/sc_spherex
- https://science.nasa.gov/learn/learn-nasa-science/
- https://www.nasa.gov/nasa-brand-center/images-and-media/
- https://github.com/google/fonts/tree/main/ofl/barlowcondensed
- https://github.com/google/fonts/tree/main/ofl/manrope
- https://github.com/IBM/plex

Before adding a Blender or third-party satellite model, record the exact source, license, author, attribution, optimization and scientific fidelity. No downloadable SPHEREx model has been verified for this scaffold. A new 3D asset pipeline is deferred beyond the MVP.


## Console redesign assets, November 14, 2026

The former `observatory-sky.svg`, retained in Git history, was project-authored vector art:
deterministically positioned illustrative stars, shaded spherical limb and light
rim. It is decorative, not a measured sky, a Planet X image or a reconstruction
of ancient constellations. It uses the repository MIT license. No Marvel asset,
footage or audio is included.

The local `BarlowCondensed-SemiBold.ttf` is an unmodified official Google Fonts
copy, 109,428 bytes. Copyright 2017 The Barlow Project Authors. Its SIL Open
Font License 1.1 is bundled as `apps/web/public/fonts/Barlow-OFL.txt`.
[Official font source](https://github.com/google/fonts/tree/main/ofl/barlowcondensed).
Manrope and IBM Plex Mono retain the existing browser stylesheet and system
fallbacks. The principal display heading works without that remote stylesheet.

The optional mission iframe loads the official
[NASA Eyes SPHEREx view](https://eyes.nasa.gov/apps/solar-system/#/sc_spherex)
only when the user opens Mission. It retains NASA/JPL-Caltech attribution and a
separate simulation-clock label, plus an external-link fallback. No extracted
spacecraft model or Eyes source code is redistributed. The
[SPHEREx site](https://spherex.caltech.edu/) also embeds NASA Eyes.

## November 15 landing and motion assets

The current [art direction and generation record](art-direction.md) identifies
the generated planet backdrop, original SVG guardian and authentic preview
sources. The hero is a 1672 x 941 WebP illustration, 110,966 bytes, generated with
the built-in imagegen tool and encoded for web delivery without upscaling. The
two dated SPHEREx previews are byte-for-byte copies of the reviewed cached PNGs.
Their hashes, real UTC dates, releases and FITS links are recorded in
`apps/web/src/features/explorer/landing-data.json` and checked by lineage tests.
Run `node scripts/sync-landing-preview.mjs` after an intentional cached-fixture
or target-report update. Do not substitute generated artwork for these previews.
