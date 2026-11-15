export interface DisplayOptions { low:number; high:number; a:number; gamma:number; curve:'asinh'|'linear'; mask:'quiet'|'hatch'; }
export interface Raster { width:number; height:number; values:Float32Array; valid:Uint8Array; }
export const MAX_RASTER_BYTES=5*1024*1024;
export function decodeRaster(buffer:ArrayBuffer,width:number,height:number):Raster {
  const count=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024||buffer.byteLength!==count*5||buffer.byteLength>MAX_RASTER_BYTES)throw Error('Prepared raster dimensions or byte count are invalid.');
  const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
  const values=littleEndian?new Float32Array(buffer,0,count):new Float32Array(count),valid=new Uint8Array(buffer,count*4),view=new DataView(buffer);
  for(let i=0;i<count;i++){if(!littleEndian)values[i]=view.getFloat32(i*4,true);if(!Number.isFinite(values[i])||(valid[i]!==0&&valid[i]!==1))throw Error('Prepared raster contains invalid values or masks.');}
  return {width,height,values,valid};
}
export function renderPixels(raster:Raster,options:DisplayOptions):Uint8ClampedArray {
  const {low,high,a,gamma,curve,mask}=options;
  if(![low,high,a,gamma].every(Number.isFinite)||high<=low||a<=0||gamma<=0)throw Error('Display limits are invalid.');
  const pixels=new Uint8ClampedArray(raster.values.length*4),denominator=Math.asinh(1/a);
  for(let i=0;i<raster.values.length;i++){
    const offset=i*4;
    if(!raster.valid[i]){const hatch=mask==='hatch'&&(i%raster.width+Math.floor(i/raster.width))%8<2;pixels[offset]=hatch?70:39;pixels[offset+1]=hatch?82:49;pixels[offset+2]=hatch?99:64;}
    else {let value=Math.max(0,Math.min(1,(raster.values[i]!-low)/(high-low)));if(curve==='asinh')value=Math.asinh(value/a)/denominator;const gray=Math.round(255*Math.pow(value,1/gamma));pixels[offset]=gray;pixels[offset+1]=gray;pixels[offset+2]=gray;}
    pixels[offset+3]=255;
  }
  return pixels;
}
