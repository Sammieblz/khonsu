/** The hit area and drawing share the same viewBox, including its end margins. */
export function dialFraction(clientX:number,left:number,width:number):number {
 return width>0?Math.max(0,Math.min(1,((clientX-left)/width*600-16)/568)):0;
}
export function dialPoint(fraction:number,width:number,height:number){
 const p=Math.max(0,Math.min(1,fraction));return {x:(16+568*p)/600*width,y:(56-164*p*(1-p))/70*height};
}
export const DIAL_SPRING={type:'spring' as const,duration:.25,bounce:.2};
