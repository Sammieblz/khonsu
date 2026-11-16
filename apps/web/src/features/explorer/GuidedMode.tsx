'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {Dialog} from '@base-ui/react/dialog';
import {useExplorer} from './ExplorerSession';
import {PRIMARY_EXAMPLE} from './routes';
import styles from './guide.module.css';
const steps=[
 {title:'Begin with real observations',body:'Use the saved WISE 0855 field for a quick test. It contains real SPHEREx images and dates, so you can explore without waiting for an archive search.',target:'[data-console]'},
 {title:'Move through actual dates',body:'Drag the amber handle, press the arrow keys, or choose Next. Watch the UTC date change. The handle can move smoothly, but each displayed image is an actual observation.',target:'[data-time-dial]',tool:'time'},
 {title:'Compare the view',body:'Try Show original, then return to Clean View. Estimated areas make gaps easier to look at; they are not measurements. Fit shows the whole field. Fill crops it without stretching.',target:'[data-inspector-panel="display"]',panel:'display'},
 {title:'Check the quality',body:'Use the quality layer and Inspect to understand missing or flagged pixels. Gaia markers and the WISE reference are optional context from other telescopes.',target:'[data-inspector-panel="layers"]',panel:'layers'},
 {title:'Write your first note',body:'Type what you notice, then Save observation note. You do not need to mark a pixel. Edit, export or delete it in this panel. Check the save message before leaving.',target:'#candidate-note',panel:'notes'},
 {title:'Mark a specific position',body:'Mark a point on the image, then open Notes to save a candidate note. Its real date, position, original pixel validity and source references stay attached. This is a question to investigate, not a discovery.',target:'#observation-canvas',tool:'mark'},
 {title:'Keep and share your evidence',body:'Export notebook keeps your notes and candidate evidence. Share creates a coordinate link without private notes. The documentation includes a complete testing checklist and explains database recovery.',target:'[data-inspector-panel="notes"]',panel:'notes'},
] as const;
export function GuidedMode(){
 const s=useExplorer(),[open,setOpen]=useState(false),[index,setIndex]=useState(0),[small,setSmall]=useState(false),step=steps[index]!;
 useEffect(()=>{
  if(!open)return;
  const panel='panel'in step?step.panel:null,tool='tool'in step?step.tool:null;
  window.dispatchEvent(new CustomEvent('khonsu:inspect',{detail:{panel,tool,close:!panel&&matchMedia('(max-width:1099px), (max-height:599px)').matches}}));
  let target:Element|null=null;const timer=window.setTimeout(()=>{target=document.querySelector(step.target);target?.classList.add('khonsu-tour-target');if(panel)target?.scrollIntoView({block:'nearest',behavior:'instant'});},50);
  return()=>{clearTimeout(timer);target?.classList.remove('khonsu-tour-target');};
 },[open,index,s.sequence?.sequence_id]);
 return <Dialog.Root open={open} onOpenChange={setOpen} modal={false} disablePointerDismissal>
  <Dialog.Trigger onClick={()=>{setIndex(0);setSmall(false);}}>GUIDED MODE</Dialog.Trigger>
  <Dialog.Portal><Dialog.Popup className={styles.tour} data-guided-mode data-minimized={small}>
   <div className={styles.tourHeading}><span>STEP {index+1} / {steps.length}</span><button onClick={()=>setSmall(!small)} aria-label={small?'Expand tour instructions':'Minimize tour instructions'}>{small?'EXPAND':'MINIMIZE'}</button><Dialog.Close aria-label="Exit guided mode">EXIT</Dialog.Close></div>
   <Dialog.Title>{step.title}</Dialog.Title><Dialog.Description hidden={small}>{step.body}</Dialog.Description>
   {!small&&index===0&&!s.sequence&&<button disabled={s.exampleLoading} onClick={()=>void s.loadExample(PRIMARY_EXAMPLE)}>{s.exampleLoading?'OPENING OBSERVATIONS':'OPEN SAVED EXAMPLE'}</button>}
   {!small&&index===1&&s.sequence?.frames.length===1&&<p>This field has one usable observation. Try the saved example to test time comparison.</p>}
   {!small&&index===steps.length-1&&<Link href="/docs/">OPEN THE COMPLETE GUIDE</Link>}
   <div className={styles.tourActions}><button disabled={index===0} onClick={()=>setIndex(i=>i-1)}>BACK</button>{index<steps.length-1?<button onClick={()=>setIndex(i=>i+1)}>NEXT STEP</button>:<Dialog.Close>FINISH TOUR</Dialog.Close>}</div>
  </Dialog.Popup></Dialog.Portal>
 </Dialog.Root>;
}
