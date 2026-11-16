'use client';
import {useEffect,useRef,useState} from 'react';
import type {LoadingStatus} from './loading';
import styles from './motion.module.css';
export function ObservationFeedback({status,onCancel,onRetry,onEdit,onLoadExample,savedExampleTitle}:{status:LoadingStatus;onCancel:()=>void;onRetry:()=>void;onEdit:()=>void;onLoadExample?:()=>void;savedExampleTitle?:string}){
 const [elapsed,setElapsed]=useState(0),[visible,setVisible]=useState(true),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!status.busy)return;const start=Date.now();setElapsed(0);const timer=window.setInterval(()=>{if(!document.hidden)setElapsed(Math.floor((Date.now()-start)/1000));},1000);return()=>clearInterval(timer);},[status.busy]);
 useEffect(()=>{let intersecting=true;const update=()=>setVisible(intersecting&&!document.hidden);const observer=new IntersectionObserver(entries=>{intersecting=entries[0]?.isIntersecting??false;update();});if(root.current)observer.observe(root.current);document.addEventListener('visibilitychange',update);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};},[]);
 return <div ref={root} className={styles.feedback} data-visible={visible} data-loading-stage={status.key} onPointerDown={event=>event.stopPropagation()}>
  <div className={styles.feedbackCopy}>
   <div role="status" aria-live="polite"><h2>{status.title}</h2><p>{status.detail}</p></div>
   {status.busy&&<><progress max={1} value={status.progress} aria-label="Observation loading progress"/><p className={styles.elapsed}>{elapsed<60?`${elapsed}s`:`${Math.floor(elapsed/60)}m ${elapsed%60}s`} elapsed{elapsed>=20?' · Archive searches can take a few minutes.':''}</p></>}
   {!status.busy&&status.cachedExample&&onLoadExample&&savedExampleTitle&&<div className={styles.savedRecovery}>
    <p>Saved field: <strong>{savedExampleTitle}</strong>. These are previously downloaded real observations. Opening them leaves this live search.</p>
    <button type="button" className={styles.savedRecoveryButton} onClick={onLoadExample}>OPEN CACHED REAL OBSERVATIONS</button>
   </div>}
   <div className={styles.feedbackActions}>{status.busy?<button onClick={onCancel}>CANCEL</button>:<>{status.retry&&<button onClick={onRetry}>TRY AGAIN</button>}<button onClick={onEdit}>CHOOSE A FIELD</button></>}</div>
   {!status.busy&&!!status.diagnostics?.length&&<details className={styles.failureDetails}><summary>Technical details</summary><ul>{status.diagnostics.map((detail,index)=><li key={index}>{detail}</li>)}</ul></details>}
  </div>
 </div>;
}
