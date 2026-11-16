'use client';
import {useEffect,useState} from 'react';
import type {SequenceManifest} from '@/features/explorer/interfaces';
import {wiseReferenceUrl} from './links';
import styles from './context.module.css';

export function WiseReference({sequence}:{sequence:SequenceManifest}) {
  const [revision,setRevision]=useState(0),[loaded,setLoaded]=useState(false),[slow,setSlow]=useState(false);
  const url=wiseReferenceUrl(sequence.target.ra_deg,sequence.target.dec_deg,sequence.requested_fov_arcmin);
  useEffect(()=>{setLoaded(false);setSlow(false);const timer=setTimeout(()=>setSlow(true),20000);return()=>clearTimeout(timer);},[url,revision]);
  return <section className={styles.reference} aria-label="WISE reference sky">
    <h3>WISE REFERENCE SKY</h3>
    <p>AllWISE color atlas: red W4 (22 µm), green W2 (4.6 µm), blue W1 (3.4 µm). Combined 2010-2011 survey exposures; dates vary by band and position. This is not a single observation or a frame in the SPHEREx movie.</p>
    <div className={styles.actions}><button onClick={()=>setRevision(value=>value+1)}>RESET / RETRY REFERENCE</button><a href={url} target="_blank" rel="noreferrer">OPEN ALADIN</a></div>
    <p role="status">{loaded?'External reference viewer opened. If its imagery is blank or unavailable, retry or open Aladin separately.':slow?'The external viewer is taking longer than expected. SPHEREx remains available.':'Opening the reference sky in Aladin Lite...'}</p>
    <iframe key={`${url}-${revision}`} src={url} title="Aladin Lite AllWISE reference sky" style={{aspectRatio:`${sequence.grid.width_px}/${sequence.grid.height_px}`}} loading="lazy" allow="fullscreen" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)}/>
    <p>Starts at RA {sequence.target.ra_deg.toFixed(5)}°, Dec {sequence.target.dec_deg.toFixed(5)}°, {sequence.requested_fov_arcmin}′ field. Navigation inside Aladin is independent; Reset returns to this field.</p>
    <p><a href="https://irsa.ipac.caltech.edu/data/WISE/docs/release/AllWISE/" target="_blank" rel="noreferrer">WISE: NASA/JPL-Caltech, UCLA and IRSA</a>. HiPS and reference viewer: <a href="https://aladin.cds.unistra.fr/" target="_blank" rel="noreferrer">CDS Aladin Lite</a>. Its colors and resolution do not change the SPHEREx data.</p>
  </section>;
}
