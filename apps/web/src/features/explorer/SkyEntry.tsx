'use client';
import Link from 'next/link';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useExplorer} from './ExplorerSession';
import {Guardian} from './Guardian';
import {readConsoleRoute} from './routes';
import styles from './motion.module.css';
const Context=createContext<(href:string)=>void>(()=>{});
export function SkyEntry({children}:{children:ReactNode}){
 const s=useExplorer(),path=usePathname(),[active,setActive]=useState(false);
 function stop(){setActive(false);}
 function begin(href:string){if(s.sequence)return;const route=readConsoleRoute(href.split('?')[1]??'');if(route.kind==='example')void s.loadExample(route.id,route.observation);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)setActive(true);}
 useEffect(()=>{if(!active)return;const timer=setTimeout(stop,900),key=(event:KeyboardEvent)=>{if(event.key==='Escape')stop();};const hide=()=>{if(document.hidden)stop();};window.addEventListener('keydown',key);window.addEventListener('popstate',stop);document.addEventListener('visibilitychange',hide);return()=>{clearTimeout(timer);window.removeEventListener('keydown',key);window.removeEventListener('popstate',stop);document.removeEventListener('visibilitychange',hide);};},[active]);
 useEffect(()=>{if(s.presentation.phase==='ready'||s.presentation.phase==='failed'||s.exampleError||s.search.phase==='failed'||s.search.phase==='cancelled')stop();},[s.presentation.phase,s.exampleError,s.search.phase]);
 useEffect(()=>{if(path==='/'&&s.sequence)stop();},[path,s.sequence]);
 return <Context.Provider value={begin}>{children}{active&&<div className={styles.entry} data-sky-entry>
  <div className={styles.entryArt} aria-hidden="true"><div className={styles.entryGlow}/><svg className={styles.starSweep} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><g className={styles.sweepStars}>{Array.from({length:180},(_,i)=><circle key={i} cx={(i*619+73)%1920} cy={(i*i*47+89)%1080} r={i%9===0?2:1} fill={i%8===0?'#edb85e':'#d5e7f7'} opacity={.25+(i%7)/10}/>)}{Array.from({length:16},(_,i)=><path key={i} d={`M${-100+i*140} 1080 Q${170+i*100} ${-300+i*12} ${2100+i*10} ${100+i*53}`} fill="none" stroke={i%3===0?'#edb85e':'#79c7e8'} strokeOpacity=".3"/>)}</g></svg><div className={styles.entryGuardian}><Guardian moving/></div></div>
  <div className={styles.entryCaption}><span>OPENING YOUR OBSERVATORY</span><div><button onClick={stop}>SKIP INTRO</button><button onClick={()=>{s.cancelLoading();stop();}}>CANCEL</button></div><small>Original celestial illustration</small></div>
 </div>}</Context.Provider>;
}
export function ExploreLink({href,children,className}:{href:string;children:ReactNode;className?:string}){const begin=useContext(Context);return <Link href={href} className={className} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)begin(href);}}>{children}</Link>;}
