export interface RasterPoint { x: number; y: number; }
export interface DisplayRect { left: number; top: number; width: number; height: number; }
export interface ViewTransform { zoom: number; x: number; y: number; }
export const FIT: ViewTransform = { zoom: 1, x: 0, y: 0 };
export function boundedView(view: ViewTransform, width: number, height: number): ViewTransform {
  const zoom = Math.max(1, Math.min(8, view.zoom));
  const boundX = width * (zoom - 1) / 2, boundY = height * (zoom - 1) / 2;
  return { zoom, x: Math.max(-boundX, Math.min(boundX, view.x)), y: Math.max(-boundY, Math.min(boundY, view.y)) };
}
export function zoomAt(view: ViewTransform, factor: number, x: number, y: number, width: number, height: number): ViewTransform {
  const zoom = Math.max(1, Math.min(8, view.zoom * factor)), ratio = zoom / view.zoom;
  return boundedView({ zoom, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio }, width, height);
}

// Backing-store pixels per science-grid pixel. An integer multiple keeps every
// grid pixel a crisp, equal block instead of letting the browser resample it.
export const DISPLAY_TARGET_PX = 1024;

export function displayScale(rasterWidth: number, rasterHeight: number): number {
  const largest = Math.max(rasterWidth, rasterHeight);
  if (!Number.isFinite(largest) || largest <= 0) return 1;
  return Math.max(1, Math.ceil(DISPLAY_TARGET_PX / largest));
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
