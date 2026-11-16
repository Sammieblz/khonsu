import {sharedSearchQuery, type CoordinateValues} from '../explorer/coordinates.ts';

export const WISE_SURVEY='https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1';
export function wiseReferenceUrl(ra:number,dec:number,fovArcmin:number):string {
  const url=new URL('https://aladin.cds.unistra.fr/AladinLite/');
  url.searchParams.set('ra',String(ra));
  url.searchParams.set('dec',String(dec));
  url.searchParams.set('fov',String(fovArcmin/60));
  url.searchParams.set('hips',WISE_SURVEY);
  url.searchParams.set('theme','dark');
  return url.toString();
}
export function compactMode(query:string):boolean {
  return query.length<=2048&&new URLSearchParams(query).get('embed')==='1';
}
export function shareLinks(base:string,values:CoordinateValues,observation?:string|null) {
  const url=new URL(base);
  if(!['https:','http:'].includes(url.protocol))throw Error('Sharing requires an HTTP page address.');
  url.search=sharedSearchQuery(values,observation);url.hash='';
  const link=url.toString();url.searchParams.set('embed','1');
  const embed=url.toString();
  const escaped=embed.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  return {link,embed,code:`<iframe src="${escaped}" title="Khonsu sky observations" width="100%" height="820" loading="lazy" allow="fullscreen" style="border:0"></iframe>`};
}
