import { MAX_RASTER_BYTES } from '../../lib/api/generated-limits.ts';
export { MAX_RASTER_BYTES } from '../../lib/api/generated-limits.ts';
export interface DisplayOptions { low:number; high:number; a:number; gamma:number; curve:'asinh'|'linear'; mask:'quiet'|'hatch'; sampling?:'smooth'|'pixels'; detail?:number; }
export interface DisplaySize { width:number; height:number; }
export interface Raster { width:number; height:number; values:Float32Array; valid:Uint8Array; }
export const MAX_RASTER_SIDE=Math.floor(Math.sqrt(MAX_RASTER_BYTES/5));
export const MAX_DISPLAY_SIDE=2160;
export function displaySize(width:number,height:number):DisplaySize {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('Display dimensions are invalid.');
  const factor=Math.min(1,MAX_DISPLAY_SIDE/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*factor)),height:Math.max(1,Math.round(height*factor))};
}
export function decodeRaster(buffer:ArrayBuffer,width:number,height:number):Raster {
  const count=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_RASTER_SIDE||height>MAX_RASTER_SIDE||buffer.byteLength!==count*5||buffer.byteLength>MAX_RASTER_BYTES)throw Error('Prepared raster dimensions or byte count are invalid.');
  const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
  const values=littleEndian?new Float32Array(buffer,0,count):new Float32Array(count),valid=new Uint8Array(buffer,count*4),view=new DataView(buffer);
  for(let i=0;i<count;i++){if(!littleEndian)values[i]=view.getFloat32(i*4,true);if(!Number.isFinite(values[i])||(valid[i]!==0&&valid[i]!==1))throw Error('Prepared raster contains invalid values or masks.');}
  return {width,height,values,valid};
}
export function validateDisplay(options:DisplayOptions,size:DisplaySize){
  if(![options.low,options.high,options.a,options.gamma].every(Number.isFinite)||options.high<=options.low||options.a<=0||options.gamma<=0)throw Error('Display limits are invalid.');
  if(!Number.isFinite(options.detail??0)||(options.detail??0)<0||(options.detail??0)>.5)throw Error('Detail amount is outside the experiment limit.');
  if(!Number.isInteger(size.width)||!Number.isInteger(size.height)||size.width<1||size.height<1||size.width>MAX_DISPLAY_SIDE||size.height>MAX_DISPLAY_SIDE)throw Error('Display dimensions exceed the bound.');
}

// Visual high-frequency emphasis only. Never overwrite prepared intensities.
// The 5x5 binomial blur, soft threshold and cap are identical to the GPU pass.
export function detailValues(raster:Raster,options:DisplayOptions):Float32Array {
  const amount=options.detail??0;
  if(amount===0)return raster.values;
  const result=new Float32Array(raster.values),weights=[1,4,6,4,1];
  const {width,height,values,valid}=raster,span=options.high-options.low;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x;if(!valid[index])continue;
    let smooth=0,safe=true;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const i=Math.max(0,Math.min(height-1,y+dy))*width+Math.max(0,Math.min(width-1,x+dx));
      if(!valid[i])safe=false;
      smooth+=values[i]!*weights[dy+2]!*weights[dx+2]!/256;
    }
    if(!safe)continue;
    const residual=values[index]!-smooth;
    const correction=Math.sign(residual)*Math.max(Math.abs(residual)-.025*span,0);
    result[index]=values[index]!+amount*Math.max(-.08*span,Math.min(.08*span,correction));
  }
  return result;
}

export function renderPixels(raster:Raster,options:DisplayOptions,size:DisplaySize=raster):Uint8ClampedArray {
  const {low,high,a,gamma,curve,mask}=options;
  validateDisplay(options,size);
  const values=detailValues(raster,options),pixels=new Uint8ClampedArray(size.width*size.height*4),denominator=Math.asinh(1/a);
  const at=(x:number,y:number)=>Math.max(0,Math.min(raster.height-1,y))*raster.width+Math.max(0,Math.min(raster.width-1,x));
  for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
    const sx=(x+.5)*raster.width/size.width-.5,sy=(y+.5)*raster.height/size.height-.5;
    const nx=Math.floor((2*x+1)*raster.width/(2*size.width)),ny=Math.floor((2*y+1)*raster.height/(2*size.height)),index=at(nx,ny),offset=(y*size.width+x)*4;
    if(!raster.valid[index]){const hatch=mask==='hatch'&&(nx+ny)%8<2;pixels[offset]=hatch?70:39;pixels[offset+1]=hatch?82:49;pixels[offset+2]=hatch?99:64;}
    else {
      let intensity=values[index]!;
      if(options.sampling==='smooth'){
        const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
        let total=0,weight=0;
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
          const i=at(x0+dx,y0+dy),w=(dx?fx:1-fx)*(dy?fy:1-fy)*raster.valid[i]!;
          total+=w*values[i]!;weight+=w;
        }
        if(weight>0)intensity=total/weight;
      }
      let value=Math.max(0,Math.min(1,(intensity-low)/(high-low)));if(curve==='asinh')value=Math.asinh(value/a)/denominator;
      const gray=Math.round(255*Math.pow(value,1/gamma));pixels[offset]=gray;pixels[offset+1]=gray;pixels[offset+2]=gray;
    }
    pixels[offset+3]=255;
  }
  return pixels;
}
