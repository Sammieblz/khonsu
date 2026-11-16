"use client";
import {useState} from 'react';
import styles from './explorer.module.css';
export function LandingDetails(){const [missionOpen,setMissionOpen]=useState(false);return <>        <section id="guide" className={styles.guide} aria-labelledby="guide-title">
          <div><span className={styles.eyebrow}>THE OBSERVER'S FIELD GUIDE</span><h2 id="guide-title">Pause. Compare. Notice.</h2></div>
          <ol>
            <li><span>01</span><h3>Find your field</h3><p>Choose a known target or enter coordinates. Open saved observations for a quick first look.</p></li>
            <li><span>02</span><h3>Rewind and blink</h3><p>Drag through the actual observation dates, or blink two of them. Pan for a closer look. Nothing is drawn between real observations.</p></li>
            <li><span>03</span><h3>Check the quality</h3><p>Open Observation details &amp; quality for each date's release, wavelength, missing data and warnings. Many apparent changes are gaps, noise or artifacts.</p></li>
            <li><span>04</span><h3>Mark a candidate</h3><p>Choose Mark, select the position and write what you saw. Notes stay in this browser.</p></li>
            <li><span>05</span><h3>Export the evidence</h3><p>Download an evidence file with positions, dates and source links. A search link repeats the search but never carries notes.</p></li>
          </ol>
          <div className={styles.guideNote}>
            <h3>Moving, or changing?</h3>
            <p>A source that sits in different places on different dates may be moving. One that stays put but brightens or fades may be varying, or may only look different because of noise, a slightly different wavelength, unmatched image sharpness or missing data. Khonsu shows the observations; it does not detect, confirm or classify anything. A mark is a lead for follow-up, not a discovery.</p>
          </div>
        </section>
        <details id="mission" className={styles.mission} open={missionOpen} onToggle={event=>setMissionOpen(event.currentTarget.open)}>
          <summary>THE MISSION <span>Explore SPHEREx in 3D</span></summary>
          {missionOpen&&<><div className={styles.missionHeading}><div><h2>The instrument behind the observations.</h2><p>NASA Eyes mission simulation. Its simulation clock is separate from your selected observation dates.</p></div><button className={styles.secondaryButton} onClick={()=>setMissionOpen(false)}>CLOSE MISSION</button></div><iframe src="https://eyes.nasa.gov/apps/solar-system/#/sc_spherex" title="NASA Eyes SPHEREx mission simulation" allow="fullscreen" referrerPolicy="no-referrer"/><p>NASA/JPL-Caltech. If the interactive view cannot load, <a href="https://eyes.nasa.gov/apps/solar-system/#/sc_spherex" target="_blank" rel="noreferrer">open NASA Eyes in a new tab</a>. <a href="https://spherex.caltech.edu/" target="_blank" rel="noreferrer">Read about SPHEREx</a>.</p></>}
        </details>
        <section id="credits" className={styles.credits} aria-labelledby="credits-title">
          <div><span className={styles.eyebrow}>DATA &amp; CREDITS</span><h2 id="credits-title">Where these observations come from.</h2></div>
          <div>
            <p>The images are SPHEREx spectral images from the <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">NASA/IPAC Infrared Science Archive (IRSA)</a>, retrieved as small cutouts and placed by Khonsu on one celestial grid. Each observation's release, UTC time and source FITS link are listed under Observation details &amp; quality in the viewer.</p>
            <p>Acknowledgement requested by IRSA for SPHEREx data: <q>This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.</q></p>
            <p>SPHEREx DR1 spectral images: <a href="https://doi.org/10.26131/IRSA678" target="_blank" rel="noreferrer">doi:10.26131/IRSA678</a>. Some observations are Quick Release (QR) images; IRSA states that <q>the DR1 spectral images are intended to be used together with the QR3 spectral images as a uniformly processed set.</q> See the <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html" target="_blank" rel="noreferrer">SPHEREx DR1 overview at IRSA</a>.</p>
            <p className={styles.notice}>NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.</p>
            <p>Khonsu is an independent NASA Space Apps Challenge 2026 participant project. It has not been reviewed or approved by NASA, JPL, Caltech or IPAC. The NASA Eyes view in The Mission is a NASA/JPL-Caltech simulation shown for context; its clock never changes observation dates.</p>
          </div>
        </section>
</>;}
