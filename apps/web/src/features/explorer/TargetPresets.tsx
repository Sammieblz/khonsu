import type { PresetTarget } from '@/lib/api/client';
import styles from './explorer.module.css';
export function TargetPresets({targets,onChoose,selected,error}:{targets:PresetTarget[];onChoose:(target:PresetTarget)=>void;selected:string|undefined;error:string}){
 return <section className={styles.referenceTargets} aria-label="Challenge target presets">
  <span className={styles.eyebrow}>CHOOSE A KNOWN FIELD</span>
  {error&&<p role="status">{error} You can still enter coordinates above.</p>}
  <div>{targets.map((target,i)=><button key={target.preset_id} aria-pressed={selected===target.preset_id} disabled={target.ra_deg==null||target.dec_deg==null} onClick={()=>onChoose(target)}><span>{String(i+1).padStart(2,'0')}</span>{target.label}</button>)}</div>
 </section>;
}
