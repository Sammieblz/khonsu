import assert from "node:assert/strict";
import test from "node:test";
import { rasterToSky, type SkyGrid, type WcsHeader } from "../src/features/annotations/sky.ts";

// Reference positions from astropy 7.0.1 (WCS.all_pix2world, origin 0) for the
// headers below. Raster pixels are zero-based with a top-left origin; a flip-y
// grid's FITS row is height - 1 - y. The first two headers are the committed
// cached-real grids in fixtures/real; the rest exercise the pole, RA 0, a
// rotated CD matrix, PC with CDELT, and an identity row order.
const CASES: { name: string; width: number; height: number; transform: "identity" | "flip-y"; header: WcsHeader; points: [number, number, number, number][] }[] = [
  { name: "real-wise-0855", width: 118, height: 118, transform: "flip-y",
    header: {"WCSAXES": 2, "CRPIX1": 59.5, "CRPIX2": 59.5, "CDELT1": -0.00084745762711864, "CDELT2": 0.00084745762711864, "CUNIT1": "deg", "CUNIT2": "deg", "CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CRVAL1": 133.76012139141, "CRVAL2": -7.2421279412123, "LONPOLE": 180.0, "LATPOLE": -7.2421279412123, "MJDREF": 0.0, "RADESYS": "ICRS"},
    points: [[0, 0, 133.81009084177487, -7.192548975670321], [117, 0, 133.71015194104513, -7.192548975670321], [0, 117, 133.8101018317932, -7.291701455581712], [117, 117, 133.7101409510268, -7.291701455581712], [59, 59, 133.75969425462017, -7.242551669826732], [17, 83, 133.7955753397652, -7.262889276539421]] },
  { name: "real-epsilon-indi-b", width: 117, height: 117, transform: "flip-y",
    header: {"WCSAXES": 2, "CRPIX1": 59.0, "CRPIX2": 59.0, "CDELT1": -0.00085470085470085, "CDELT2": 0.00085470085470085, "CUNIT1": "deg", "CUNIT2": "deg", "CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CRVAL1": 331.09861133448, "CRVAL2": -56.800804140278, "LONPOLE": 180.0, "LATPOLE": -56.800804140278, "MJDREF": 0.0, "RADESYS": "ICRS"},
    points: [[0, 0, 331.18902685016747, -56.75119879211732], [116, 0, 331.0081958187925, -56.75119879211732], [0, 116, 331.18926626360746, -56.85034394274879], [116, 116, 331.0079564053525, -56.85034394274879], [58, 58, 331.09861133448, -56.80080414027799], [17, 83, 331.1626467808061, -56.82215527065998]] },
  { name: "near-pole", width: 200, height: 200, transform: "flip-y",
    header: {"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CUNIT1": "deg", "CUNIT2": "deg", "RADESYS": "ICRS", "CRPIX1": 100.5, "CRPIX2": 100.5, "CRVAL1": 10.0, "CRVAL2": 89.9, "CDELT1": -0.005, "CDELT2": 0.005},
    points: [[0, 0, 138.6246293304604, 89.3632367053436], [199, 199, 330.21797900000183, 89.22253135628571], [100, 0, 190.36034670425806, 89.60250464130546], [0, 100, 88.35824842662075, 89.49206319706218], [150, 20, 230.32263484181297, 89.60980230811775]] },
  { name: "ra-wrap", width: 100, height: 100, transform: "flip-y",
    header: {"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CUNIT1": "deg", "CUNIT2": "deg", "RADESYS": "ICRS", "CRPIX1": 50.5, "CRPIX2": 50.5, "CRVAL1": 0.01, "CRVAL2": -30.0, "CDELT1": -0.002, "CDELT2": 0.002},
    points: [[0, 50, 0.12431635353764997, -30.00095061744468], [99, 50, 359.8956836464624, -30.00095061744468], [49, 49, 0.01115468890279753, -29.99899999496197], [0, 0, 0.12420127590461494, -29.90095091495483], [99, 99, 359.8955706451497, -30.098950323817185]] },
  { name: "rotated-cd", width: 64, height: 80, transform: "identity",
    header: {"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CUNIT1": "deg", "CUNIT2": "deg", "RADESYS": "ICRS", "CRPIX1": 30.0, "CRPIX2": 40.0, "CRVAL1": 200.0, "CRVAL2": 45.0, "CD1_1": -0.0008, "CD1_2": 0.0003, "CD2_1": 0.0003, "CD2_2": 0.0008},
    points: [[0, 0, 200.01625213776387, 44.9600988539578], [63, 79, 199.9784881107329, 45.042197973193915], [29, 39, 200.0, 45.0], [10, 70, 200.03465978216352, 45.01909475763107]] },
  { name: "pc-cdelt", width: 25, height: 25, transform: "flip-y",
    header: {"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CUNIT1": "deg", "CUNIT2": "deg", "RADESYS": "ICRS", "CRPIX1": 12.5, "CRPIX2": 12.5, "CRVAL1": 359.99, "CRVAL2": 5.0, "CDELT1": -0.001, "CDELT2": 0.001, "PC1_1": 0.9, "PC1_2": -0.1, "PC2_1": 0.2, "PC2_2": 1.1},
    points: [[0, 0, 0.0016445135449885129, 5.011449896876896], [24, 24, 359.97755282712524, 4.989849882952612], [12, 12, 359.98959847166645, 5.000649999877805], [3, 20, 359.99692625161265, 4.990049963823315]] },
];

function separationArcsec(ra1: number, dec1: number, ra2: number, dec2: number): number {
  let dra = Math.abs(ra1 - ra2);
  if (dra > 180) dra = 360 - dra;
  return Math.hypot(dra * Math.cos(dec2 * Math.PI / 180), dec1 - dec2) * 3600;
}

test("grid pixels convert to the same ICRS position astropy computes", () => {
  for (const item of CASES) {
    const grid: SkyGrid = { width_px: item.width, height_px: item.height, wcs_header: item.header, raster_to_wcs: item.transform };
    for (const [x, y, ra, dec] of item.points) {
      const result = rasterToSky(grid, x, y);
      assert.ok(result.ok, `${item.name} ${x},${y}`);
      assert.ok(result.ra_deg >= 0 && result.ra_deg < 360, `${item.name} RA range`);
      assert.ok(separationArcsec(result.ra_deg, result.dec_deg, ra, dec) < 1e-6, `${item.name} ${x},${y}`);
    }
  }
});

const real = CASES[0]!;
const realGrid: SkyGrid = { width_px: real.width, height_px: real.height, wcs_header: real.header, raster_to_wcs: "flip-y" };

test("a grid without a convertible WCS gives a reason instead of a position", () => {
  const refused: [string, SkyGrid][] = [
    ["no WCS", { width_px: 10, height_px: 10, wcs_header: null, raster_to_wcs: null }],
    ["other projection", { ...realGrid, wcs_header: { ...real.header, CTYPE1: "RA---SIN", CTYPE2: "DEC--SIN" } }],
    ["distortion", { ...realGrid, wcs_header: { ...real.header, CTYPE1: "RA---TAN-SIP", A_ORDER: 2 } }],
    ["projection terms", { ...realGrid, wcs_header: { ...real.header, PV2_1: 0.1 } }],
    ["other frame", { ...realGrid, wcs_header: { ...real.header, RADESYS: "FK5" } }],
    ["other unit", { ...realGrid, wcs_header: { ...real.header, CUNIT1: "arcsec" } }],
    ["singular", { ...realGrid, wcs_header: { ...real.header, CDELT2: 0 } }],
    ["non-numeric", { ...realGrid, wcs_header: { ...real.header, CRVAL1: "east" } }],
    ["missing reference", { ...realGrid, wcs_header: { ...real.header, CRPIX1: undefined as unknown as number } }],
  ];
  for (const [name, grid] of refused) {
    const result = rasterToSky(grid, 5, 5);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.ok(result.reason.length > 10, name);
  }
});

test("pixels outside the grid or between pixel centers are refused", () => {
  for (const [x, y] of [[-1, 0], [0, -1], [118, 0], [0, 118], [1.5, 2], [Number.NaN, 0]]) {
    assert.equal(rasterToSky(realGrid, x!, y!).ok, false, `${x},${y}`);
  }
});
