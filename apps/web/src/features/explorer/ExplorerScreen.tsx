'use client';
import Link from 'next/link';
import {useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {Brand} from '@/components/ui/Brand';
import {useExplorer} from './ExplorerSession';
import {LandingDetails} from './LandingDetails';
import {ExploreLink} from './SkyEntry';
import {LandingStory} from './LandingStory';
import {PRIMARY_EXAMPLE,exampleLink,isConsoleLink,consoleLink} from './routes';
import data from './landing-data.json';
import styles from './landing.module.css';

export function ExplorerScreen(){
 const router=useRouter(),session=useExplorer(),hero=useRef<HTMLElement>(null);
 const destination=session.sequence?'/console/':exampleLink(PRIMARY_EXAMPLE);
 const action=session.sequence?'RETURN TO OBSERVATORY':'EXPLORE THE SKY';
 useEffect(()=>{if(isConsoleLink(window.location.search))router.replace('/console/'+window.location.search);},[router]);
 return <div id="top" className={styles.landing}>
  <a className="skip-link" href="#explore-entry">Skip to exploration</a>
  <header className={styles.header}><Brand/><nav aria-label="Main navigation"><Link href="/docs/">HOW TO LOOK</Link><a href="#mission">THE MISSION</a><ExploreLink href={destination}>EXPLORE <span aria-hidden="true">↗</span></ExploreLink></nav></header>
  <main>
   <section ref={hero} className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.heroArt} aria-hidden="true"><img src="/art/khonsu-planet.webp" alt="" width="1672" height="941" fetchPriority="high"/><div className={styles.starLayer}/></div>
    <div className={styles.heroCopy}><span className={styles.eyebrow}>AN OBSERVATORY THROUGH TIME</span><h1 id="hero-title">THE SKY<br/>REMEMBERS.</h1><p>Move through real SPHEREx observations.<br/>Find what time reveals.</p><a className={styles.storyPrompt} href="#story">A DIFFERENT WAY TO LOOK <span aria-hidden="true">↓</span></a><small className={styles.artCaption}>ILLUSTRATIVE PLANET &amp; SKY / NOT TELESCOPE DATA</small></div>
    <aside id="explore-entry" className={styles.entryPanel} aria-label="Enter the observatory">
     <img className={styles.mark} src="/khonsu-mark.svg" width="120" height="120" alt=""/><p className={styles.wordmark}>KHONSU</p><p className={styles.tagline}>Find what time reveals.</p>
     <div className={styles.entryTime}><span>ONE FIELD. REAL DATES.</span><svg viewBox="0 0 300 90" aria-hidden="true"><path d="M12 76 Q150 0 288 76" fill="none" stroke="#aab5c7"/>{Array.from({length:13},(_,i)=><path key={i} d={`M${12+i*23} ${76-152*(i/12)*(1-i/12)} l${(i-6)*.6} -${i%3===0?14:8}`} stroke={i<8?'#edb85e':'#aab5c7'}/>)}<circle cx="196" cy="42" r="6" fill="#edb85e"/></svg><div><span>THEN</span><span>NOW</span></div></div>
     <ExploreLink className={styles.primary} href={destination}>{action}<span aria-hidden="true">↗</span></ExploreLink>
     <p className={styles.entryNote}>{session.sequence?'Continue with your selected observation.':`Start with ${data.frame_count} saved observations of the WISE 0855 field.`}</p>
     <Link className={styles.secondary} href="/console/?field=1">SEARCH YOUR OWN FIELD <span aria-hidden="true">→</span></Link>
    </aside>
   </section>
   <div className={styles.missionLine}><span>NASA SPACE APPS 2026 / BYTEBOYZ</span><span>REAL IMAGES. REAL OBSERVATION DATES.</span><span>YOUR EYE FOR CHANGE.</span></div>
   <LandingStory hero={hero}/>
   <section id="fields" className={styles.fields} aria-labelledby="fields-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>FIVE FIELDS TO BEGIN WITH</span><h2 id="fields-title">Every patch has a history.</h2></div><p>Choose a target to set its coordinates.<br/>You decide when to search the archive.</p></div>
    <div className={styles.targetGrid}>{data.targets.map((target,i)=>{const live=session.targets.find(item=>item.preset_id===target.preset_id),ra=live?.ra_deg??target.ra_deg,dec=live?.dec_deg??target.dec_deg;return <article key={target.preset_id}><span className={styles.targetNumber}>{String(i+1).padStart(2,'0')}</span><Link href={consoleLink({ra_deg:ra,dec_deg:dec,fov_arcmin:6})}>{target.label}<span aria-hidden="true">↗</span></Link><p>{target.object_type}</p><span className={styles.targetStatus} data-available={target.status==='success'}>{target.status==='success'?`${target.usable_frame_count} comparable field frames`:'Last query timed out'}</span><p className={styles.targetCaveat}>{target.science_note}</p></article>;})}</div>
    <p className={styles.reportNote}>Historical check: 14 November 2026, DR1 and QR3. Results can change. A timeout does not mean no coverage, and field frames do not establish a target detection. <a href="https://github.com/Sammieblz/khonsu/blob/main/docs/target-coverage.md" target="_blank" rel="noreferrer">READ THE COVERAGE REPORT ↗</a></p>
   </section>
   <section className={styles.invitation}><span className={styles.eyebrow}>YOUR NEXT LOOK COULD RAISE A QUESTION.</span><h2>Start with the sky.<br/>Follow the evidence.</h2><ExploreLink className={styles.primary} href={destination}>{action}<span aria-hidden="true">↗</span></ExploreLink></section>
   <div className={styles.details}><LandingDetails/></div>
  </main>
  <footer className={styles.footer}><span>KHONSU / BYTEBOYZ</span><p>A candidate is a question worth investigating. It is not a confirmed discovery.</p><a href="#top">BACK TO THE SKY ↑</a></footer>
 </div>;
}
