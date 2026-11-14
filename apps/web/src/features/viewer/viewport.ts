export interface RasterPoint { x: number; y: number; }
export interface DisplayRect { left: number; top: number; width: number; height: number; }
export interface ViewportTransform { zoom: number; panX: number; panY: number; }
export const FIT_VIEW: ViewportTransform = { zoom: 1, panX: 0, panY: 0 };
export const MAX_ZOOM = 12;

export function imageGeometry(rect: Pick<DisplayRect, "width" | "height">, width: number, height: number, view: ViewportTransform) {
  const scale = Math.min(rect.width / width, rect.height / height) * view.zoom;
  return {
    scale,
    left: (rect.width - width * scale) / 2 + view.panX,
    top: (rect.height - height * scale) / 2 + view.panY,
    width: width * scale, height: height * scale,
  };
}

export function clampViewport(view: ViewportTransform, rect: Pick<DisplayRect, "width" | "height">, width: number, height: number): ViewportTransform {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, Number.isFinite(view.zoom) ? view.zoom : 1));
  const geometry = imageGeometry(rect, width, height, { zoom, panX: 0, panY: 0 });
  const maxX = Math.max(0, (geometry.width - rect.width) / 2);
  const maxY = Math.max(0, (geometry.height - rect.height) / 2);
  return {
    zoom,
    panX: Math.max(-maxX, Math.min(maxX, Number.isFinite(view.panX) ? view.panX : 0)),
    panY: Math.max(-maxY, Math.min(maxY, Number.isFinite(view.panY) ? view.panY : 0)),
  };
}

export function zoomAtPoint(view: ViewportTransform, zoom: number, point: RasterPoint, rect: Pick<DisplayRect, "width" | "height">, width: number, height: number): ViewportTransform {
  const before = imageGeometry(rect, width, height, view);
  if (!Number.isFinite(before.scale) || before.scale <= 0) return FIT_VIEW;
  const nextZoom = Math.max(1, Math.min(MAX_ZOOM, zoom));
  const ratio = nextZoom / view.zoom;
  const nextLeft = point.x - (point.x - before.left) * ratio;
  const nextTop = point.y - (point.y - before.top) * ratio;
  const nextWidth = before.width * ratio;
  const nextHeight = before.height * ratio;
  return clampViewport({ zoom: nextZoom, panX: nextLeft - (rect.width - nextWidth) / 2, panY: nextTop - (rect.height - nextHeight) / 2 }, rect, width, height);
}

export function rasterPointToDisplay(point: RasterPoint, rect: Pick<DisplayRect, "width" | "height">, width: number, height: number, view: ViewportTransform): RasterPoint {
  const geometry = imageGeometry(rect, width, height, view);
  return { x: geometry.left + (point.x + .5) * geometry.scale, y: geometry.top + (point.y + .5) * geometry.scale };
}

// The rectangle must be the actual displayed canvas, excluding surrounding bars.
// Coordinates use integer pixel centers with a top-left browser origin.
export function clientPointToRaster(
  clientX: number,
  clientY: number,
  rect: DisplayRect,
  rasterWidth: number,
  rasterHeight: number,
  view?: ViewportTransform,
): RasterPoint | null {
  if (rect.width <= 0 || rect.height <= 0 || rasterWidth <= 0 || rasterHeight <= 0) return null;
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
  if (view) {
    const geometry = imageGeometry(rect, rasterWidth, rasterHeight, view);
    if (!Number.isFinite(geometry.scale) || geometry.scale <= 0) return null;
    const x = (clientX - rect.left - geometry.left) / geometry.scale;
    const y = (clientY - rect.top - geometry.top) / geometry.scale;
    if (x < 0 || y < 0 || x >= rasterWidth || y >= rasterHeight) return null;
    return { x: Math.floor(x), y: Math.floor(y) };
  }
  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  if (relativeX < 0 || relativeX >= 1 || relativeY < 0 || relativeY >= 1) return null;
  return {
    x: Math.min(rasterWidth - 1, Math.floor(relativeX * rasterWidth)),
    y: Math.min(rasterHeight - 1, Math.floor(relativeY * rasterHeight)),
  };
}
