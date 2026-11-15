import { MAX_RASTER_BYTES } from '../../lib/api/generated-limits.ts';
export { MAX_RASTER_BYTES } from '../../lib/api/generated-limits.ts';
export interface DisplayOptions { low:number; high:number; a:number; gamma:number; curve:'asinh'|'linear'; mask:'subtle'|'quiet'|'hatch'; sampling?:'smooth'|'pixels'; detail?:number; includeWarnings?:boolean; cleanView?:boolean; showEstimates?:boolean; }
export interface DisplaySize { width:number; height:number; }
export interface Raster { width:number; height:number; values:Float32Array; valid:Uint8Array; warning?:Uint8Array; estimated?:Uint8Array; estimates?:Float32Array; gapFillFailed?:boolean; }
export const MAX_RASTER_SIDE=Math.floor(Math.sqrt(MAX_RASTER_BYTES/5));
export const HD_DISPLAY_SIDE=2160;
export const MAX_DISPLAY_SIDE=3840;
export const MAX_DISPLAY_PIXELS=3840*2160;
export function displaySize(width:number,height:number,maxSide=HD_DISPLAY_SIDE):DisplaySize {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('Display dimensions are invalid.');
  const factor=Math.min(1,Math.min(MAX_DISPLAY_SIDE,maxSide)/Math.max(width,height),Math.sqrt(MAX_DISPLAY_PIXELS/(width*height)));
  return {width:Math.max(1,Math.floor(width*factor)),height:Math.max(1,Math.floor(height*factor))};
}
export type AutoResolution='checking'|'4k'|'hd';
export function measuredResolution(current:AutoResolution,mode:string,milliseconds:number):AutoResolution {
  if(!mode.startsWith('WebGL')||milliseconds>100)return 'hd';
  if(current==='checking')return milliseconds<=32?'4k':'hd';
  return current;
}
export function decodeRaster(buffer:ArrayBuffer,width:number,height:number,encoding='float32-le-mask8-v1'):Raster {
  const count=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_RASTER_SIDE||height>MAX_RASTER_SIDE||buffer.byteLength!==count*5||buffer.byteLength>MAX_RASTER_BYTES)throw Error('Prepared raster dimensions or byte count are invalid.');
  const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
  if(!['float32-le-mask8-v1','float32-le-quality8-v2','float32-le-estimate8-v1'].includes(encoding))throw Error('Unknown prepared encoding.');
  const values=littleEndian?new Float32Array(buffer,0,count):new Float32Array(count),quality=new Uint8Array(buffer,count*4),view=new DataView(buffer);
  const v2=encoding==='float32-le-quality8-v2',valid=v2?new Uint8Array(count):quality,warning=v2?new Uint8Array(count):undefined;
  for(let i=0;i<count;i++){if(!littleEndian)values[i]=view.getFloat32(i*4,true);if(!Number.isFinite(values[i])||quality[i]!>(v2?2:1))throw Error('Prepared raster contains invalid values or masks.');if(v2){valid[i]=quality[i]===1?1:0;warning![i]=quality[i]===2?1:0;}}
  if(encoding==='float32-le-estimate8-v1')return {width,height,values,valid:new Uint8Array(count),estimated:quality};
  return {width,height,values,valid,warning};
}
export function attachGapFill(original:Raster,fill:Raster,fraction:number):Raster {
  if(original.width!==fill.width||original.height!==fill.height||!fill.estimated)throw Error('Gap-fill grid is invalid.');
  let count=0;
  for(let i=0;i<original.valid.length;i++){
    if(fill.estimated[i]){if(original.valid[i])throw Error('An estimate overlaps a measured pixel.');count++;}
    else if(fill.values[i]!==0)throw Error('Non-estimated values must be empty.');
  }
  if(!Number.isFinite(fraction)||fraction<=0||fraction>.1||Math.abs(count/original.valid.length-fraction)>1e-12)throw Error('Estimated fraction is invalid.');
  return {...original,estimated:fill.estimated,estimates:fill.values};
}
export function validateDisplay(options:DisplayOptions,size:DisplaySize){
  if(![options.low,options.high,options.a,options.gamma].every(Number.isFinite)||options.high<=options.low||options.a<=0||options.gamma<=0)throw Error('Display limits are invalid.');
  if(!Number.isFinite(options.detail??0)||(options.detail??0)<0||(options.detail??0)>.5)throw Error('Detail amount is outside the experiment limit.');
  if(!Number.isInteger(size.width)||!Number.isInteger(size.height)||size.width<1||size.height<1||size.width>MAX_DISPLAY_SIDE||size.height>MAX_DISPLAY_SIDE||size.width*size.height>MAX_DISPLAY_PIXELS)throw Error('Display dimensions exceed the bound.');
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
    const warning=!!options.includeWarnings&&raster.warning?.[index]===1;
    const estimated=!!options.cleanView&&!warning&&raster.estimated?.[index]===1&&!!raster.estimates;
    if(!raster.valid[index]&&!warning&&!estimated){const hatch=mask==='hatch'&&(nx+ny)%8<2;pixels[offset]=hatch?70:mask==='subtle'?7:39;pixels[offset+1]=hatch?82:mask==='subtle'?11:49;pixels[offset+2]=hatch?99:mask==='subtle'?18:64;}
    else {
      let intensity=estimated?raster.estimates![index]!:values[index]!;
      if(options.sampling==='smooth'){
        const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
        let total=0,weight=0;
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
          const i=at(x0+dx,y0+dy),fill=estimated&&raster.estimated?.[i]===1,usable=raster.valid[i]===1||(warning&&raster.warning?.[i]===1)||fill,w=(dx?fx:1-fx)*(dy?fy:1-fy)*(usable?1:0);
          total+=w*(fill?raster.estimates![i]!:values[i]!);weight+=w;
        }
        if(weight>0)intensity=total/weight;
      }
      let value=Math.max(0,Math.min(1,(intensity-low)/(high-low)));if(curve==='asinh')value=Math.asinh(value/a)/denominator;
      const gray=Math.round(255*Math.pow(value,1/gamma));pixels[offset]=gray;pixels[offset+1]=gray;pixels[offset+2]=gray;
      if(estimated&&options.showEstimates&&(nx+ny)%4<2){pixels[offset]=243;pixels[offset+1]=188;pixels[offset+2]=96;}
    }
    pixels[offset+3]=255;
  }
  return pixels;
}
