export interface RasterPoint { x: number; y: number; }
export interface DisplayRect { left: number; top: number; width: number; height: number; }
export interface ViewTransform { zoom: number; x: number; y: number; }
export const FIT: ViewTransform = { zoom: 1, x: 0, y: 0 };

/** Fractions of the full field visible through the viewport, independent of DPR. */
export function visibleField(view: ViewTransform, width: number, height: number) {
  const safe = boundedView(view, width, height);
  return { left: .5 - (.5 + safe.x / Math.max(1, width)) / safe.zoom,
    top: .5 - (.5 + safe.y / Math.max(1, height)) / safe.zoom,
    width: 1 / safe.zoom, height: 1 / safe.zoom };
}

export function centerField(view: ViewTransform, x: number, y: number, width: number, height: number): ViewTransform {
  return boundedView({zoom: view.zoom, x: (.5 - x) * width * view.zoom, y: (.5 - y) * height * view.zoom}, width, height);
}

export function nativeSampling(fovArcmin: number, nativeScale: unknown): number | null {
  return typeof nativeScale === 'number' && Number.isFinite(nativeScale) && nativeScale > 0
    ? fovArcmin * 60 / nativeScale : null;
}
export function boundedView(view: ViewTransform, width: number, height: number): ViewTransform {
  const zoom = Math.max(1, Math.min(8, view.zoom));
  const boundX = width * (zoom - 1) / 2, boundY = height * (zoom - 1) / 2;
  return { zoom, x: Math.max(-boundX, Math.min(boundX, view.x)), y: Math.max(-boundY, Math.min(boundY, view.y)) };
}
export function zoomAt(view: ViewTransform, factor: number, x: number, y: number, width: number, height: number): ViewTransform {
  const zoom = Math.max(1, Math.min(8, view.zoom * factor)), ratio = zoom / view.zoom;
  return boundedView({ zoom, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio }, width, height);
}

// The rectangle must be the actual displayed canvas, excluding surrounding bars.
// Coordinates use integer pixel centers with a top-left browser origin.
export function clientPointToRaster(
  clientX: number,
  clientY: number,
  rect: DisplayRect,
  rasterWidth: number,
  rasterHeight: number,
): RasterPoint | null {
  if (rect.width <= 0 || rect.height <= 0 || rasterWidth <= 0 || rasterHeight <= 0) return null;
  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  if (relativeX < 0 || relativeX >= 1 || relativeY < 0 || relativeY >= 1) return null;
  return {
    x: Math.min(rasterWidth - 1, Math.floor(relativeX * rasterWidth)),
    y: Math.min(rasterHeight - 1, Math.floor(relativeY * rasterHeight)),
  };
}
