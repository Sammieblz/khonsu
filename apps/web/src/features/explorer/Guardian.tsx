import {useId} from 'react';
import styles from './motion.module.css';

// Original geometric celestial guardian. Illustration only, never observation data.
export function Guardian({moving=false}:{moving?:boolean}){
 const id=useId().replaceAll(':','');
 return <svg className={styles.guardian} data-moving={moving} viewBox="0 0 240 200" aria-hidden="true">
  <defs><linearGradient id={id} x1="0" x2="1"><stop stopColor="#aab5c7"/><stop offset=".5" stopColor="#f1f0e9"/><stop offset="1" stopColor="#b0b8c6"/></linearGradient></defs>
  <g className={styles.guardianSky}><path d="M20 80 Q120 -10 220 80 M42 110 Q120 30 200 100" fill="none" stroke="#edb85e" strokeOpacity=".4"/><g fill="#f1f0e9"><circle cx="24" cy="75" r="2"/><circle cx="51" cy="48" r="1.5"/><circle cx="181" cy="42" r="2.5"/><circle cx="211" cy="70" r="1.8"/><path d="m93 18 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></g></g>
  <ellipse cx="120" cy="185" rx="39" ry="3" fill="#edb85e" opacity=".2"/>
  <path d="M107 92 98 119 87 179 Q122 190 154 179 L138 114 132 92" fill={`url(#${id})`}/>
  <path d="m112 111-10 69m22-61 7 63m4-68 13 66" stroke="#070b12" strokeOpacity=".45" fill="none"/>
  <path d="M109 97 121 121 135 96" fill="#070b12" stroke="#edb85e"/>
  <path d="M125 52c-24 0-33 34-9 45-13-22-3-32 9-45" fill="#edb85e"/>
  <path d="M125 57q-15 6-15 23l10 16 15-13q7-17-10-26" fill="#f1f0e9"/>
  <path d="m119 76 9 1-5 8" fill="#070b12"/><path d="m114 91 11 7 11-9" fill="none" stroke="#edb85e"/>
  <path d="m106 101-22 29-13-12" fill="none" stroke="#d8dce0" strokeWidth="9" strokeLinecap="round"/>
  <path d="m66 85 4 96" stroke="#edb85e" strokeWidth="2"/><path d="M71 67c-15 0-20 20-5 26-8-9-4-20 5-26" fill="#edb85e"/>
  <g className={styles.guardianArm}><path d="m134 102 24-8 19-22" fill="none" stroke="#f1f0e9" strokeWidth="9" strokeLinecap="round"/><path d="m175 74 2-14m0 13 9-9" stroke="#edb85e" strokeWidth="3" strokeLinecap="round"/><circle cx="187" cy="54" r="3" fill="#edb85e"/></g>
 </svg>;
}
