# Khonsu artwork and motion

The visual direction follows the supplied Khonsu concept: monumental ivory
type, midnight space, a luminous planetary limb and sharp amber rectangles.
Art stays outside observation pixels.

## Storyboard

1. Find your field: illustrative ICRS grid and the verified WISE 0855 field centre.
2. Move through time: genuine prepared first/last WISE field images with actual
   UTC dates, release, wavelength and observation IDs. No animated interpolation.
3. Follow the evidence: an illustrative record structure explaining coordinates,
   quality and archive references without inventing a candidate.

Desktop scrolling optionally pins these chapters and translates their container.
Mobile, short screens, reduced motion, Simple View and no-JavaScript use vertical
document flow. Primary actions remain ordinary links to the console.

The entry storyboard lasts at most 900 ms: star arcs sweep around the original
guardian, then reveal the console. The observation request starts on the click,
independently of animation. The smaller guardian repeats a restrained arm gesture
only while data or images are loading. Ready, failed and cancelled states stop it.

## Asset register

| Asset | Source and role |
| --- | --- |
| [Planet backdrop](../apps/web/public/art/khonsu-planet.webp) | Built-in imagegen, November 15 local time; original illustrative marketing art, not data. 1672 x 941, WebP 86 encoding. |
| [Guardian](../apps/web/src/features/explorer/Guardian.tsx) | Original code-authored SVG, ivory/amber crescent figure and moving star arc. |
| [Entry sweep](../apps/web/src/features/explorer/SkyEntry.tsx) | Original deterministic stars and curved paths, CSS transform/opacity. |
| [Preview index](../apps/web/src/features/explorer/landing-data.json) | Derived from the committed real WISE bundle and dated target coverage report. Native PNG copies retain exact bytes. |
| [Source bundle](../fixtures/real/real-wise-0855/manifest.json) | Canonical scientific preview provenance, NASA/JPL-Caltech/IPAC. |

The planet was generated with the built-in tool, not the CLI fallback. The
generated PNG is retained in the local image-generation library; the shipped
WebP is saved in this repository. No Marvel video, audio or artwork was copied.

Final generation prompt:

> Create an original premium cinematic space artwork for the KHONSU astronomy website hero, a high-detail realistic 3D-style illustration, widescreen 16:9 landscape at the highest available resolution. NO TEXT, NO LETTERS, NO LOGOS, NO UI. Midnight nearly black deep space #070b12, very fine restrained stars. A huge dark mysterious rocky planet occupies the right 60% of the composition, cropped at the top and right edges, its dramatic curved left limb a luminous icy blue thin atmospheric crescent; extremely fine cratered and striated charcoal surface texture visible only near the rim. Subtle amber sunlight along a very small portion of the outer edge. Faint blue dust and many tiny stars behind it, sophisticated astrophotography-inspired film lighting. Left 45% mostly dark and uncluttered with sparse tiny stars, reserved for large ivory typography to be added by code. Strong negative space in lower left. Planet feels massive and monumental, not a ringed planet, not Earth, no artificial spacecraft, no characters, no copied franchise assets. This is explicitly illustrative marketing art, never an image used as scientific telescope data. Do not put captions on the artwork.

Implementation references: [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
and [GSAP React cleanup](https://gsap.com/resources/React/). The installed animate,
animation-performance and pick-ui-library skills informed motion and primitive
selection. GSAP 3.15.1 and @gsap/react 2.1.2 are the sole landing motion dependencies;
CSS handles the entry and loader. No extra 3D engine, Motion or Remotion runtime.
