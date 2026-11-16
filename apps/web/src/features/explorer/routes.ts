import {readSharedSearch, sharedSearchQuery, type CoordinateValues} from './coordinates.ts';

export const PRIMARY_EXAMPLE = 'real-wise-0855';
export function consoleLink(values?:CoordinateValues, observation?:string|null) {
  return '/console/'+(values?sharedSearchQuery(values,observation):'');
}
export function exampleLink(id:string, observation?:string|null, embed=false) {
  const params=new URLSearchParams({example:id});
  if(observation)params.set('obs',observation);
  if(embed)params.set('embed','1');
  return '/console/?'+params;
}
export function readConsoleRoute(query:string) {
  if(query.length>2048)return {kind:'invalid' as const,message:'This sky link is too long.'};
  const params=new URLSearchParams(query),example=params.get('example');
  if(example!==null){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(example))return {kind:'invalid' as const,message:'This saved example identifier is invalid.'};
    if(params.has('ra_deg')||params.has('dec_deg'))return {kind:'invalid' as const,message:'Choose a saved example or coordinates in this link, not both.'};
    return {kind:'example' as const,id:example,observation:params.get('obs')};
  }
  return readSharedSearch(query);
}
export function isConsoleLink(query:string){const p=new URLSearchParams(query);return ['ra_deg','dec_deg','example','embed'].some(key=>p.has(key));}
