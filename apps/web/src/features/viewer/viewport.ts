export interface RasterPoint { x: number; y: number; }
export interface DisplayRect { left: number; top: number; width: number; height: number; }

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
