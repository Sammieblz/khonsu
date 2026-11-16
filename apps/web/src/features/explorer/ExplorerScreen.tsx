'use client';
import Link from 'next/link';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {Brand} from '@/components/ui/Brand';
import {useExplorer} from './ExplorerSession';
import {LandingDetails} from './LandingDetails';
import {PRIMARY_EXAMPLE,exampleLink,isConsoleLink,consoleLink} from './routes';
import styles from './explorer.module.css';
export function ExplorerScreen(){
  const router=useRouter(),session=useExplorer();
  useEffect(()=>{if(isConsoleLink(window.location.search))router.replace('/console/'+window.location.search);},[router]);
  return <div className={styles.site}>
    <a className="skip-link" href="#explore-entry">Skip to exploration</a>
    <header className={styles.header}><Brand/><nav aria-label="Main navigation"><a href="#explore-entry">EXPLORE</a><a href="#guide">HOW TO LOOK</a><a href="#mission">THE MISSION</a><a href="#credits">CREDITS</a></nav></header>
    <main><section className={styles.introduction} aria-labelledby="hero-title"><div className={styles.celestial} aria-hidden="true"/>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>AN OBSERVATORY THROUGH TIME</span><h1 id="hero-title">THE SKY<br/>REMEMBERS.</h1><p>Move through real SPHEREx observations.<br/>Find what time reveals.</p><span className={styles.artLabel}>ORIGINAL CELESTIAL ILLUSTRATION</span></div>
      <aside id="explore-entry" className={styles.entryPanel}><img src="/khonsu-mark.svg" width="100" height="100" alt=""/><p className={styles.tagline}>One sky.<br/>Many moments.</p><Link className={styles.primaryButton} href={session.sequence?'/console/':exampleLink(PRIMARY_EXAMPLE)}>{session.sequence?'RETURN TO OBSERVATORY':'EXPLORE THE SKY'}</Link><p>Begin with verified, saved SPHEREx observations.</p><Link href="/console/">SEARCH YOUR OWN FIELD</Link></aside>
    </section><section className={styles.referenceTargets} aria-label="Challenge targets"><p>FIVE FIELDS. REAL OBSERVATIONS.</p><div className={styles.targetLinks}>{session.targets.map(target=>target.ra_deg!=null&&target.dec_deg!=null&&<Link key={target.preset_id} href={consoleLink({ra_deg:target.ra_deg,dec_deg:target.dec_deg,fov_arcmin:6})}>{target.label}</Link>)}</div></section><LandingDetails/></main>
  </div>;
}
