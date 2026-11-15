import { renderPixels, type Raster, type DisplayOptions } from './display';
const workerScope=self as unknown as {postMessage:(message:unknown,transfer?:Transferable[])=>void};
// Display mapping only. The worker receives already aligned and masked arrays.
self.onmessage=(event:MessageEvent<{id:number;raster:Raster;options:DisplayOptions}>)=>{
  try{
    const {id,raster,options}=event.data;
    const pixels=renderPixels(raster,options);
    if(typeof OffscreenCanvas!=='undefined'){
      const canvas=new OffscreenCanvas(raster.width,raster.height),context=canvas.getContext('2d');
      if(context){context.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>,raster.width,raster.height),0,0);const bitmap=canvas.transferToImageBitmap();workerScope.postMessage({id,bitmap},[bitmap]);return;}
    }
    workerScope.postMessage({id,pixels},[pixels.buffer as ArrayBuffer]);
  }catch(error){self.postMessage({id:event.data.id,error:String(error)});}
};
