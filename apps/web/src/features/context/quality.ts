import type { Raster } from '../viewer/display.ts';

export function pixelQuality(raster: Raster | undefined, x: number, y: number, estimatesShown: boolean) {
  if (!raster || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= raster.width || y >= raster.height) {
    return {title: 'Quality unavailable', detail: 'The original sample mask is not loaded. A displayed PNG cannot establish whether this pixel is measured.', kind: 'unknown'};
  }
  const index = y*raster.width+x;
  if (raster.valid[index] === 1) return {title: 'Accepted observation sample', detail: 'Passes the recorded strict quality mask. This is a resampled measurement; it is not a confirmed object.', kind: 'strict-valid'};
  if (raster.warning?.[index] === 1) return {title: 'Flagged observation sample', detail: 'A measured value has a quality warning. It is excluded from strict marking and is visible only when warning samples are enabled.', kind: 'warning-only'};
  if (raster.estimated?.[index] === 1) return {title: estimatesShown ? 'Visually estimated area' : 'Missing sample with an estimate available', detail: 'Clean View can fill this gap using surrounding pixels. The fill is not a telescope measurement and is excluded from candidate measurement validity.', kind: 'estimated'};
  return {title: 'No usable observation sample', detail: 'Missing, excluded or outside usable coverage. No display estimate is available here. Dark color does not mean an empty sky.', kind: 'unavailable'};
}

/** Overlay annotations only. Never overwrite a measurement or mask array. */
export function qualityOverlay(raster: Raster): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(raster.width*raster.height*4);
  for (let i=0;i<raster.valid.length;i++) {
    if (raster.valid[i]) continue;
    const color = raster.warning?.[i] ? [243,188,96,120] : raster.estimated?.[i] ? [121,199,232,140] : [199,158,230,140];
    pixels.set(color,i*4);
  }
  return pixels;
}
