export interface RasterPoint { x: number; y: number; }
export interface DisplayRect { left: number; top: number; width: number; height: number; }
export interface ViewTransform { zoom: number; x: number; y: number; }
export const FIT: ViewTransform = { zoom: 1, x: 0, y: 0 };

export interface ImageGeometry {stageWidth:number;stageHeight:number;rasterWidth:number;rasterHeight:number;}
export function fittedImage(g:ImageGeometry):DisplayRect {
  const scale=Math.min(Math.max(1,g.stageWidth)/Math.max(1,g.rasterWidth),Math.max(1,g.stageHeight)/Math.max(1,g.rasterHeight));
  const width=g.rasterWidth*scale,height=g.rasterHeight*scale;
  return {left:(g.stageWidth-width)/2,top:(g.stageHeight-height)/2,width,height};
}
export function boundedImageView(view:ViewTransform,g:ImageGeometry):ViewTransform {
  const image=fittedImage(g),zoom=Math.max(1,Math.min(8,view.zoom));
  const bx=Math.max(0,(image.width*zoom-g.stageWidth)/2),by=Math.max(0,(image.height*zoom-g.stageHeight)/2);
  return {zoom,x:Math.max(-bx,Math.min(bx,view.x)),y:Math.max(-by,Math.min(by,view.y))};
}
export function fillImage(g:ImageGeometry):ViewTransform {const image=fittedImage(g);return boundedImageView({zoom:Math.max(g.stageWidth/image.width,g.stageHeight/image.height),x:0,y:0},g);}
export function zoomImageAt(view:ViewTransform,factor:number,x:number,y:number,g:ImageGeometry):ViewTransform {
  const zoom=Math.max(1,Math.min(8,view.zoom*factor)),ratio=zoom/view.zoom;
  return boundedImageView({zoom,x:x-(x-view.x)*ratio,y:y-(y-view.y)*ratio},g);
}
export function visibleImageField(view:ViewTransform,g:ImageGeometry){
  const image=fittedImage(g),safe=boundedImageView(view,g),width=image.width*safe.zoom,height=image.height*safe.zoom;
  return {left:Math.max(0,.5-(g.stageWidth/2+safe.x)/width),top:Math.max(0,.5-(g.stageHeight/2+safe.y)/height),width:Math.min(1,g.stageWidth/width),height:Math.min(1,g.stageHeight/height)};
}
export function centerImageField(view:ViewTransform,x:number,y:number,g:ImageGeometry){const image=fittedImage(g);return boundedImageView({zoom:view.zoom,x:(.5-x)*image.width*view.zoom,y:(.5-y)*image.height*view.zoom},g);}

export function nativeSampling(fovArcmin: number, nativeScale: unknown): number | null {
  return typeof nativeScale === 'number' && Number.isFinite(nativeScale) && nativeScale > 0
    ? fovArcmin * 60 / nativeScale : null;
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
