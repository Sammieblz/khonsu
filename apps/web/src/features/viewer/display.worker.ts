import { renderPixels, type Raster, type DisplayOptions, type DisplaySize } from './display';
const workerScope=self as unknown as {postMessage:(message:unknown,transfer?:Transferable[])=>void};
// Display mapping only. The worker receives already aligned and masked arrays.
self.onmessage=(event:MessageEvent<{id:number;raster:Raster;options:DisplayOptions;size:DisplaySize}>)=>{
  try{
    const {id,raster,options,size}=event.data;
    const pixels=renderPixels(raster,options,size);
    if(typeof OffscreenCanvas!=='undefined'){
      const canvas=new OffscreenCanvas(size.width,size.height),context=canvas.getContext('2d');
      if(context){context.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>,size.width,size.height),0,0);const bitmap=canvas.transferToImageBitmap();workerScope.postMessage({id,bitmap},[bitmap]);return;}
    }
    workerScope.postMessage({id,pixels},[pixels.buffer as ArrayBuffer]);
  }catch(error){self.postMessage({id:event.data.id,error:String(error)});}
};
