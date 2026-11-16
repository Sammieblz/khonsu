'use client';
import {useEffect,useState} from 'react';
import type {SequenceManifest} from '@/features/explorer/interfaces';
import {shareLinks} from './links';
import styles from './context.module.css';

export function ShareField({sequence,activeFrameId}:{sequence:SequenceManifest;activeFrameId:string|null}) {
  const [links,setLinks]=useState<ReturnType<typeof shareLinks>|null>(null),[message,setMessage]=useState('');
  useEffect(()=>{
    const frame=sequence.frames.find(item=>item.frame_id===activeFrameId);
    setLinks(shareLinks(window.location.href,{ra_deg:sequence.target.ra_deg,dec_deg:sequence.target.dec_deg,fov_arcmin:sequence.requested_fov_arcmin},frame?.observation_id));
    setMessage('');
  },[sequence,activeFrameId]);
  async function copy(kind:'link'|'code') {
    if(!links)return;
    try{await navigator.clipboard.writeText(links[kind]);setMessage(kind==='link'?'Search link copied.':'Embed code copied.');}
    catch{setMessage('Copying was blocked. Select and copy the text below.');}
  }
  if(sequence.data_mode==='synthetic')return null;
  return <section className={styles.share} aria-label="Share this sky field">
    <h3>SHARE THIS FIELD</h3>
    <div className={styles.actions}><button onClick={()=>void copy('link')}>COPY SEARCH LINK</button><button onClick={()=>void copy('code')}>COPY EMBED CODE</button></div>
    <p role="status">{message}</p>
    <p>The link restores coordinates and the selected observation if returned. Visitors choose Explore to run the search. It carries no candidate notes or private browser data.{sequence.data_mode==='cached-real'?' This cached field becomes a new archive query; it does not reproduce the saved bundle.':''}</p>
    <details><summary>Link &amp; embed preview</summary>
      <label>Search URL<textarea aria-label="Search URL" readOnly rows={3} value={links?.link??''}/></label>
      <label>HTML embed code<textarea aria-label="HTML embed code" readOnly rows={5} value={links?.code??''}/></label>
      {links&&<a href={links.embed} target="_blank" rel="noreferrer">OPEN COMPACT PREVIEW</a>}
      <p>Your published Khonsu URL and observation service must be reachable by visitors. A localhost link works only on your computer.</p>
    </details>
  </section>;
}
