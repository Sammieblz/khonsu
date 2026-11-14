import type { SequenceManifest } from "@/features/explorer/interfaces";

export interface SkyPosition { raDeg: number; decDeg: number; coordinateFrame: "ICRS"; }

/** Invert the prepared two-dimensional TAN grid, not the original detector WCS.
 * FITS centers are one-based; browser selections are zero-based pixel centers.
 * Reference: https://docs.astropy.org/en/stable/wcs/
 */
export function pixelToSky(point: { x: number; y: number }, grid: SequenceManifest["grid"]): SkyPosition | null {
  const header = grid.wcs_header;
  if (!header || ![point.x, point.y, grid.width_px, grid.height_px].every(Number.isFinite)) return null;
  if (point.x < 0 || point.y < 0 || point.x >= grid.width_px || point.y >= grid.height_px) return null;
  if (grid.raster_to_wcs !== "identity" && grid.raster_to_wcs !== "flip-y") return null;
  if (header.CTYPE1 !== "RA---TAN" || header.CTYPE2 !== "DEC--TAN") return null;
  if (Object.keys(header).some(key => /^(PV\d_|A_ORDER|B_ORDER|AP_ORDER|BP_ORDER|CPDIS|D2IM)/.test(key))) return null;
  if (header.RADESYS && String(header.RADESYS).toUpperCase() !== "ICRS") return null;
  if (header.RADECSYS && String(header.RADECSYS).toUpperCase() !== "ICRS") return null;
  if (header.EQUINOX !== undefined && !header.RADESYS && !header.RADECSYS) return null;
  if ((header.CUNIT1 && header.CUNIT1 !== "deg") || (header.CUNIT2 && header.CUNIT2 !== "deg")) return null;
  const number = (key: string, fallback = NaN) => {
    const value = header[key];
    return value === undefined ? fallback : typeof value === "number" && Number.isFinite(value) ? value : NaN;
  };
  const longitudePole = number("LONPOLE", 180);
  if (!Number.isFinite(longitudePole) || Math.abs(longitudePole - 180) > 1e-10) return null;
  const ra0 = number("CRVAL1");
  const dec0 = number("CRVAL2");
  const crpix1 = number("CRPIX1");
  const crpix2 = number("CRPIX2");
  if (![ra0, dec0, crpix1, crpix2].every(Number.isFinite) || Math.abs(dec0) > 90) return null;
  let a: number, b: number, c: number, d: number;
  if ("CD1_1" in header || "CD2_2" in header) {
    a = number("CD1_1", 0); b = number("CD1_2", 0);
    c = number("CD2_1", 0); d = number("CD2_2", 0);
  } else {
    if ("CROTA1" in header || "CROTA2" in header) return null;
    const dx = number("CDELT1"), dy = number("CDELT2");
    a = dx * number("PC1_1", 1); b = dx * number("PC1_2", 0);
    c = dy * number("PC2_1", 0); d = dy * number("PC2_2", 1);
  }
  if (![a, b, c, d].every(Number.isFinite) || Math.abs(a * d - b * c) < 1e-20) return null;
  const wcsY = grid.raster_to_wcs === "flip-y" ? grid.height_px - 1 - point.y : point.y;
  const dx = point.x + 1 - crpix1, dy = wcsY + 1 - crpix2;
  const radians = Math.PI / 180;
  const xi = (a * dx + b * dy) * radians;
  const eta = (c * dx + d * dy) * radians;
  const referenceDec = dec0 * radians;
  const denominator = Math.cos(referenceDec) - eta * Math.sin(referenceDec);
  const ra = ra0 + Math.atan2(xi, denominator) / radians;
  const dec = Math.atan2(Math.sin(referenceDec) + eta * Math.cos(referenceDec), Math.hypot(denominator, xi)) / radians;
  if (![ra, dec].every(Number.isFinite)) return null;
  return { raDeg: ((ra % 360) + 360) % 360, decDeg: dec, coordinateFrame: "ICRS" };
}
