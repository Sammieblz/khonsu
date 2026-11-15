"use client";
import { useEffect, useRef, useState } from 'react';
import type { ObservationFrame } from '@/features/explorer/interfaces';
import { resolveAssetUrl } from '@/lib/api/client';
import { attachGapFill, attachRefinement, decodeRaster, MAX_RASTER_BYTES, type Raster } from './display';
import { frameCacheWindow } from './time';
async function readAsset(meta:ObservationFrame['raster'],width:number,height:number,signal:AbortSignal):Promise<Raster>{
  if(!meta||!['float32-le-mask8-v1','float32-le-quality8-v2','float32-le-estimate8-v1','float32-le-refined8-v1'].includes(meta.encoding??'float32-le-mask8-v1')||meta.size_bytes!==width*height*5||meta.size_bytes>MAX_RASTER_BYTES||!/^\/v1\/(sequences|examples)\/[a-zA-Z0-9_-]+\/frames\/[a-zA-Z0-9_-]+\.bin$/.test(meta.url))throw Error('Prepared asset metadata is invalid.');
  const response=await fetch(resolveAssetUrl(meta.url),{signal});
  if(!response.ok||!response.body)throw Error('Prepared image is unavailable.');
  const reader=response.body.getReader(),buffer=new Uint8Array(meta.size_bytes);let offset=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;if(offset+value.length>buffer.length)throw Error('Prepared asset exceeds its byte limit.');buffer.set(value,offset);offset+=value.length;}}finally{await reader.cancel();reader.releaseLock();}
  if(offset!==buffer.length)throw Error('Prepared asset is incomplete.');
  const hash=await crypto.subtle.digest('SHA-256',buffer),hex=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hex!==meta.sha256)throw Error('Prepared asset checksum failed.');
  return decodeRaster(buffer.buffer,width,height,meta.encoding);
}
export async function readPrepared(frame:ObservationFrame,width:number,height:number,signal:AbortSignal):Promise<Raster>{
  if(frame.raster&&!['float32-le-mask8-v1','float32-le-quality8-v2'].includes(frame.raster.encoding??'float32-le-mask8-v1'))throw Error('Display copies cannot replace an observation.');
  const original=await readAsset(frame.raster,width,height,signal);
  const optional=async(meta:ObservationFrame['raster'])=>meta?readAsset(meta,width,height,AbortSignal.any([signal,AbortSignal.timeout(15000)])):null;
  const [fill,refined]=await Promise.allSettled([optional(frame.gap_fill),optional(frame.refinement?.raster)]);
  if(signal.aborted)throw Error('Prepared display cancelled.');
  let result=original;
  if(frame.gap_fill)try{
    if(frame.gap_fill.encoding!=='float32-le-estimate8-v1'||fill.status!=='fulfilled'||!fill.value)throw Error('Invalid estimate asset.');
    result=attachGapFill(result,fill.value,frame.estimated_fraction??0);
  }catch{result={...result,gapFillFailed:true};}
  if(frame.refinement)try{
    if(frame.refinement.raster.encoding!=='float32-le-refined8-v1'||frame.refinement.input_raster_sha256!==frame.raster?.sha256||refined.status!=='fulfilled'||!refined.value)throw Error('Invalid refinement asset.');
    result=attachRefinement(result,refined.value);
  }catch{result={...result,refinementFailed:true};}
  return result;
}
export function usePreparedFrames(frames:ObservationFrame[],width:number,height:number,index:number,pinned:number[]){
  const cache=useRef(new Map<string,Raster>()),identity=useRef(frames);
  const [rasters,setRasters]=useState(new Map<string,Raster>()),[failed,setFailed]=useState<string[]>([]);
  const wanted=frameCacheWindow(frames,index,pinned).map(i=>frames[i]!.frame_id).join(',');
  useEffect(()=>{const controller=new AbortController();if(identity.current!==frames){cache.current.clear();identity.current=frames;}const ids=new Set(wanted.split(','));for(const id of cache.current.keys())if(!ids.has(id))cache.current.delete(id);setRasters(new Map(cache.current));setFailed([]);
    for(const frame of frames.filter(frame=>ids.has(frame.frame_id)&&frame.raster))if(!cache.current.has(frame.frame_id))void readPrepared(frame,width,height,controller.signal).then(raster=>{if(!controller.signal.aborted){cache.current.set(frame.frame_id,raster);setRasters(new Map(cache.current));}},()=>{if(!controller.signal.aborted)setFailed(old=>[...old,frame.frame_id]);});
    return()=>controller.abort();
  },[frames,wanted,width,height]);
  return {rasters:identity.current===frames?rasters:new Map<string,Raster>(),failed};
}
