"use client";
import { useEffect, useState } from 'react';
import styles from './resolutionLab.module.css';

interface StudyField {
  id:string; title:string; fov_arcmin:number; grid_size:number;
  assets:Record<'original'|'warnings'|'zodi'|'zodi_warnings',string>;
  warning_fraction:number; unavailable_fraction:number; sky_sigma_original:number; sky_sigma_zodi:number;
  source:{observation_id:string;observed_start_utc:string;release:string;source_fits_url:string};
}
interface StudyReport {schema_version:number;fields:StudyField[];audit:{id:string;inspected:number;pairs_checked:number;status:string}[];}

export function QualityStudy(){
  const [report,setReport]=useState<StudyReport|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [index,setIndex]=useState(0),[zodi,setZodi]=useState(true),[warnings,setWarnings]=useState(false),[gaps,setGaps]=useState(false);
  const [loaded,setLoaded]=useState<Record<string,boolean>>({}),[failed,setFailed]=useState<Record<string,boolean>>({});
  useEffect(()=>{const controller=new AbortController();setError('');
    fetch('/experiments/quality/manifest.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('The quality comparison is unavailable.');return r.json();})
      .then((r:StudyReport)=>{if(r.schema_version!==1||!r.fields?.length||!Array.isArray(r.audit))throw Error('Incomplete quality report.');setReport(r);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
  },[attempt]);
  const field=report?.fields[index],mode=zodi?(warnings?'zodi_warnings':'zodi'):(warnings?'warnings':'original');
  const selected=field?.assets[mode];
  return <section id="quality-study" className={styles.qualityStudy} aria-label="Quality and background study">
    <p className={styles.eyebrow}>QUALITY / CONTROLLED COMPARISON</p><h2>WHAT IS HIDING THE SKY?</h2>
    <p>Two views of one authentic exposure. Same field and absolute stretch; no additional observation or measured resolution.</p>
    {error?<div role="alert">{error} <button onClick={()=>setAttempt(a=>a+1)}>RETRY STUDY</button></div>:!field?<p role="status">Loading quality comparison...</p>:<>
      <label className={styles.eyebrow}>Study field <select aria-label="Quality study field" value={index} onChange={e=>setIndex(Number(e.target.value))}>{report!.fields.map((f,i)=><option key={f.id} value={i}>{f.title}</option>)}</select></label>
      <div className={styles.controls}>
        <button aria-pressed={zodi} onClick={()=>setZodi(!zodi)}>SUBTRACT ZODI MODEL</button>
        <button aria-pressed={warnings} onClick={()=>setWarnings(!warnings)}>INCLUDE WARNING SAMPLES</button>
        <button aria-pressed={gaps} onClick={()=>setGaps(!gaps)}>INSPECT STUDY GAPS</button>
      </div>
      <div className={styles.studyImages}>
        {(['original','trial'] as const).map(side=>{const url=side==='original'?field.assets.original:selected!;return <figure key={side}>
          <figcaption>{side==='original'?'ORIGINAL / STRICT SAMPLES':`${zodi?'IMAGE - ZODI':'ORIGINAL'} / ${warnings?'WARNINGS INCLUDED':'STRICT SAMPLES'}`}</figcaption>
          <div className={styles.studyPlane} data-gaps={gaps?'inspect':'quiet'}>
            <img key={url} src={url} alt={`${side==='original'?'Original':mode} view of ${field.title}`} width={field.grid_size} height={field.grid_size}
              style={{visibility:loaded[url]&&!failed[url]?'visible':'hidden'}} onLoad={()=>setLoaded(old=>({...old,[url]:true}))} onError={()=>setFailed(old=>({...old,[url]:true}))}/>
            {(!loaded[url]||failed[url])&&<p role="status">{failed[url]?'Image unavailable. Refresh to retry.':'Loading image...'}</p>}
          </div>
        </figure>;})}
      </div>
      <p className={styles.gapLegend}>Dark navy indicates excluded measurements. {(field.warning_fraction*100).toFixed(2)}% warning-only; {(field.unavailable_fraction*100).toFixed(2)}% unavailable. Including warnings does not repair bad pixels or make the values reliable.</p>
      <p>{field.fov_arcmin} arcmin / {field.source.observed_start_utc} / {field.source.release} / <a href={field.source.source_fits_url} target="_blank" rel="noreferrer">{field.source.observation_id} at IRSA</a></p>
      <p>ZODI removes a supplied foreground model. It does not remove detector noise. Robust scatter on the same sky pixels: {field.sky_sigma_original.toFixed(5)} before, {field.sky_sigma_zodi.toFixed(5)} MJy/sr after. This diagnostic is not a source significance measurement.</p>
      <details><summary>SHORT-EPOCH STACKS AND DIFFERENCES</summary><p>The bounded audit checks pairs within 24 hours, with the same detector/release and wavelength spread at most one tenth of a bandwidth. These samples have insufficient compatible coverage; no real stack or PSF-matched difference is shown.</p>
        <ul>{report!.audit.map(a=><li key={a.id}>{a.id}: {a.inspected} inputs, {a.pairs_checked} pairs, {a.status.replaceAll('_',' ')}.</li>)}</ul>
        <p>Combining different wavelengths or widely separated dates could hide motion or create false variability. More compatible archive data may exist.</p>
      </details>
      <a href="/experiments/quality/manifest.json">Download source IDs, hashes, WCS, settings and audit</a>
    </>}
  </section>;
}
