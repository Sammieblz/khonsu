export interface CoordinateValues {
  ra_deg: number;
  dec_deg: number;
  fov_arcmin: number;
}

export type CoordinateResult =
  | { ok: true; value: CoordinateValues }
  | { ok: false; message: string };

export function parseCoordinates(ra: string, dec: string, fov: string): CoordinateResult {
  if (!ra.trim() || !dec.trim() || !fov.trim()) {
    return { ok: false, message: "Enter both sky coordinates and a field size." };
  }
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (![ra, dec, fov].every(value => decimal.test(value.trim()))) {
    return { ok: false, message: "Use decimal numbers for coordinates and field size." };
  }
  const raValue = Number(ra);
  const decValue = Number(dec);
  const fovValue = Number(fov);
  if (![raValue, decValue, fovValue].every(Number.isFinite)) {
    return { ok: false, message: "Use finite decimal numbers for coordinates and field size." };
  }
  if (raValue < 0 || raValue >= 360) {
    return { ok: false, message: "Right Ascension must be at least 0 and less than 360 degrees." };
  }
  if (decValue < -90 || decValue > 90) {
    return { ok: false, message: "Declination must be between -90 and +90 degrees." };
  }
  if (fovValue < .5 || fovValue > 60) {
    return { ok: false, message: "For this prototype, choose a field from 0.5 to 60 arcminutes." };
  }
  return { ok: true, value: { ra_deg: raValue, dec_deg: decValue, fov_arcmin: fovValue } };
}
