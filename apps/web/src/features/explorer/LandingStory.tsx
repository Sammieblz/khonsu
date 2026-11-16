'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {useGSAP} from '@gsap/react';
import {observationLabel} from '@/features/viewer/time';
import data from './landing-data.json';
import styles from './landing.module.css';
gsap.registerPlugin(ScrollTrigger,useGSAP);

export function LandingStory({hero}:{hero:RefObject<HTMLElement|null>}){
 const root=useRef<HTMLElement>(null),track=useRef<HTMLDivElement>(null),[simple,setSimple]=useState(false),[interactive,setInteractive]=useState(false);
 useEffect(()=>setInteractive(true),[]);
 useGSAP(()=>{
  if(simple)return;
  const media=gsap.matchMedia();
  media.add('(min-width: 1100px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)',()=>{
   const element=root.current,strip=track.current;if(!element||!strip)return;
   element.dataset.enhanced='true';
   gsap.to(strip,{x:()=>-element.clientWidth*2,ease:'none',scrollTrigger:{id:'khonsu-story',trigger:element,pin:true,start:'top 80px',end:()=>'+='+window.innerHeight*2,scrub:.4,invalidateOnRefresh:true}});
   if(hero.current){const art=hero.current.querySelector('img');gsap.to(art,{y:80,scale:1.025,ease:'none',scrollTrigger:{id:'khonsu-hero',trigger:hero.current,start:'top top',end:'bottom top',scrub:true}});}
   return()=>{delete element.dataset.enhanced;};
  });
  return()=>media.revert();
 },{scope:root,dependencies:[simple],revertOnUpdate:true});
 return <>
  <div className={styles.storyToolbar}><span>THE OBSERVER'S JOURNEY / 01 → 03</span><div>{interactive&&<button aria-pressed={simple} onClick={()=>setSimple(value=>!value)}>{simple?'ENABLE SCROLL STORY':'USE SIMPLE VIEW'}</button>}<a href="#fields">SKIP TO THE FIELDS ↓</a></div></div>
  <section id="story" ref={root} className={styles.story} aria-label="Three steps through the observatory">
   <div ref={track} className={styles.storyTrack}>
    <article className={styles.chapter}><div className={styles.chapterCopy}><span className={styles.eyebrow}>01 / FIND YOUR FIELD</span><h2>A coordinate.<br/>A place to begin.</h2><p>Choose a familiar target or enter right ascension and declination. Set how much sky you want to see.</p><p className={styles.chapterNote}>SPHEREx sees infrared light. These images reveal a different view from the night sky you see with your eyes.</p></div>
     <div className={styles.fieldDiagram} aria-label="Illustrative coordinate field, not telescope data"><svg viewBox="0 0 500 400" aria-hidden="true"><defs><radialGradient id="coordinate-glow"><stop stopColor="#79c7e8" stopOpacity=".15"/><stop offset="1" stopColor="#79c7e8" stopOpacity="0"/></radialGradient></defs><circle cx="250" cy="200" r="180" fill="url(#coordinate-glow)"/>{[80,140,200,260,320].map(v=><path key={v} d={`M70 ${v} H430 M${v+50} 40 V360`} stroke="#aab5c7" strokeOpacity=".2" fill="none"/>)}<circle cx="250" cy="200" r="125" fill="none" stroke="#edb85e" strokeOpacity=".4"/><path d="M210 170v-10h15m50 0h15v10m0 60v10h-15m-50 0h-15v-10M250 185v30m-15-15h30" fill="none" stroke="#edb85e" strokeWidth="2"/><g fill="#f1f0e9">{[[110,75],[181,127],[251,201],[350,95],[392,283],[160,315],[327,327],[299,73],[78,248]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===2?4:1.6}/>)}</g></svg><div className={styles.coordinateReadout}><span>RIGHT ASCENSION<br/><strong>133.76012°</strong></span><span>DECLINATION<br/><strong>−07.24213°</strong></span></div><small>WISE 0855 field centre / illustrative diagram</small></div>
    </article>
    <article className={styles.chapter}><div className={styles.chapterCopy}><span className={styles.eyebrow}>02 / MOVE THROUGH TIME</span><h2>The same sky.<br/>Another moment.</h2><p>Slide between actual observation dates. Pause, rewind, or blink two images to look for something worth investigating.</p><p className={styles.chapterNote}>No invented frames between dates. Different wavelengths, blur and missing data can also create apparent changes.</p></div>
     <div className={styles.realPreviews}>{data.frames.map(frame=><figure key={frame.frame_id}><img src={frame.image_url} alt={`Prepared SPHEREx WISE 0855 field, ${observationLabel(frame.observed_start_utc)}`} width={data.width} height={data.height} loading="lazy"/><figcaption><time dateTime={frame.observed_start_utc}>{observationLabel(frame.observed_start_utc)}</time><span>{frame.release} / {frame.wavelength_um.toFixed(3)} μm</span><span>{frame.observation_id}</span></figcaption></figure>)}<p>REAL SPHEREx FIELD PREVIEWS / NASA · JPL-Caltech · IPAC<br/>Native prepared images. No claim of target detection.</p></div>
    </article>
    <article className={styles.chapter}><div className={styles.chapterCopy}><span className={styles.eyebrow}>03 / FOLLOW THE EVIDENCE</span><h2>Notice something?<br/>Keep the context.</h2><p>Inspect the quality, mark a position and write a note. Export the dates, coordinates and source references behind your question.</p><p className={styles.chapterNote}>Clean View estimates are for viewing. Marks and evidence preserve original measurement validity.</p></div>
     <div className={styles.evidenceDiagram}><span>THE OBSERVER'S RECORD</span><div><span>POSITION</span><strong>Common sky grid</strong></div><div><span>OBSERVATION</span><strong>Actual UTC date</strong></div><div><span>QUALITY</span><strong>Original validity mask</strong></div><div><span>SOURCE</span><strong>Release + archive reference</strong></div><p>YOUR NOTE<br/><em>What changed? What else could explain it?</em></p><small>Illustrative record structure. Your notes stay in your browser.</small></div>
    </article>
   </div>
  </section>
 </>;
}
