// Converts a pixel on a sequence's common output grid to ICRS sky coordinates.
//
// Processing writes a gnomonic (TAN) celestial WCS for every grid (see
// apps/api/app/processing/alignment.py). This implements only that projection,
// following FITS WCS Papers I and II, and refuses any header it cannot convert
// exactly (distortion terms, other projections, other frames or units). A
// refused conversion leaves the mark pixel-only instead of inventing RA and Dec.

export type WcsHeader = Record<string, string | number>;

export interface SkyGrid {
  width_px: number;
  height_px: number;
  wcs_header?: WcsHeader | null;
  raster_to_wcs?: "identity" | "flip-y" | null;
}

export type SkyConversion =
  | { ok: true; ra_deg: number; dec_deg: number }
  | { ok: false; reason: string };

export const SKY_METHOD = "ICRS from the sequence's common TAN grid WCS (FITS WCS Paper II)";

const RAD = Math.PI / 180;

function numberCard(header: WcsHeader, key: string, fallback?: number): number | null {
  const raw = header[key];
  if (raw === undefined) return fallback ?? null;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

// Rows are counted from the top in the browser raster. FITS pixel numbers are
// one-based, and a flip-y grid counts rows from the bottom.
export function rasterToSky(grid: SkyGrid, x: number, y: number): SkyConversion {
  const header = grid.wcs_header;
  if (!header || !grid.raster_to_wcs) return { ok: false, reason: "This sequence has no celestial WCS." };
  if (grid.raster_to_wcs !== "identity" && grid.raster_to_wcs !== "flip-y") {
    return { ok: false, reason: "The grid's raster orientation is not supported." };
  }
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= grid.width_px || y >= grid.height_px) {
    return { ok: false, reason: "The selected pixel is outside the image grid." };
  }
  if (header.CTYPE1 !== "RA---TAN" || header.CTYPE2 !== "DEC--TAN") {
    return { ok: false, reason: "Only the TAN projection used by Khonsu processing can be converted." };
  }
  if ((header.RADESYS ?? "ICRS") !== "ICRS" || (header.CUNIT1 ?? "deg") !== "deg" || (header.CUNIT2 ?? "deg") !== "deg") {
    return { ok: false, reason: "The WCS is not ICRS in degrees." };
  }
  if (header.WCSAXES !== undefined && Number(header.WCSAXES) !== 2) {
    return { ok: false, reason: "The WCS is not two-dimensional." };
  }
  if (Object.keys(header).some(key => /^(PV\d+_\d+|A_|B_|AP_|BP_)/.test(key))) {
    return { ok: false, reason: "The WCS has distortion or projection terms this conversion does not apply." };
  }

  const crpix1 = numberCard(header, "CRPIX1"), crpix2 = numberCard(header, "CRPIX2");
  const ra0 = numberCard(header, "CRVAL1"), dec0 = numberCard(header, "CRVAL2");
  if (crpix1 === null || crpix2 === null || ra0 === null || dec0 === null || dec0 < -90 || dec0 > 90) {
    return { ok: false, reason: "The WCS reference cards are missing or invalid." };
  }

  let m11: number | null, m12: number | null, m21: number | null, m22: number | null;
  if (["CD1_1", "CD1_2", "CD2_1", "CD2_2"].some(key => key in header)) {
    m11 = numberCard(header, "CD1_1", 0); m12 = numberCard(header, "CD1_2", 0);
    m21 = numberCard(header, "CD2_1", 0); m22 = numberCard(header, "CD2_2", 0);
  } else {
    const cdelt1 = numberCard(header, "CDELT1"), cdelt2 = numberCard(header, "CDELT2");
    const pc11 = numberCard(header, "PC1_1", 1), pc12 = numberCard(header, "PC1_2", 0);
    const pc21 = numberCard(header, "PC2_1", 0), pc22 = numberCard(header, "PC2_2", 1);
    if (cdelt1 === null || cdelt2 === null || pc11 === null || pc12 === null || pc21 === null || pc22 === null) {
      return { ok: false, reason: "The WCS scale cards are missing or invalid." };
    }
    m11 = cdelt1 * pc11; m12 = cdelt1 * pc12; m21 = cdelt2 * pc21; m22 = cdelt2 * pc22;
  }
  if (m11 === null || m12 === null || m21 === null || m22 === null || m11 * m22 - m12 * m21 === 0) {
    return { ok: false, reason: "The WCS transform is invalid or singular." };
  }
  // Zenithal projections default LONPOLE to 180 unless the reference point is the pole.
  const lonPole = numberCard(header, "LONPOLE", dec0 >= 90 ? 0 : 180);
  if (lonPole === null) return { ok: false, reason: "The WCS LONPOLE card is invalid." };

  const p1 = x + 1;
  const p2 = grid.raster_to_wcs === "flip-y" ? grid.height_px - y : y + 1;
  const d1 = p1 - crpix1, d2 = p2 - crpix2;
  const ix = m11 * d1 + m12 * d2, iy = m21 * d1 + m22 * d2; // intermediate world coordinates, degrees

  // TAN: native spherical coordinates.
  const radius = Math.hypot(ix, iy);
  const phi = Math.atan2(ix, -iy);
  const theta = Math.atan2(180 / Math.PI, radius);

  // Native to celestial, with the native pole at (CRVAL1, CRVAL2) and LONPOLE.
  const decP = dec0 * RAD, dphi = phi - lonPole * RAD;
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinTheta * Math.sin(decP) + cosTheta * Math.cos(decP) * Math.cos(dphi))));
  const dra = Math.atan2(-cosTheta * Math.sin(dphi), sinTheta * Math.cos(decP) - cosTheta * Math.sin(decP) * Math.cos(dphi));
  let ra = (ra0 + dra / RAD) % 360;
  if (ra < 0) ra += 360;
  if (ra >= 360) ra -= 360;
  const decDeg = dec / RAD;
  if (!Number.isFinite(ra) || !Number.isFinite(decDeg)) return { ok: false, reason: "The WCS conversion did not produce a finite position." };
  return { ok: true, ra_deg: ra, dec_deg: decDeg };
}

export function formatSky(raDeg: number, decDeg: number): string {
  const sign = decDeg < 0 ? "-" : "+";
  return `RA ${raDeg.toFixed(5)}°, Dec ${sign}${Math.abs(decDeg).toFixed(5)}° (ICRS)`;
}
