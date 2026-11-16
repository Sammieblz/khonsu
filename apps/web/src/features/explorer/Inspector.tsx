'use client';
import {Tabs} from '@base-ui/react/tabs';
import {Dialog} from '@base-ui/react/dialog';
import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import styles from './console.module.css';

export const INSPECTOR_TABS=['field','display','layers','compare','notes','info'] as const;
export type InspectorTab=typeof INSPECTOR_TABS[number];
export function Inspector({tab,onTab,open,onOpen,panels}:{tab:InspectorTab;onTab:(tab:InspectorTab)=>void;open:boolean;onOpen:(open:boolean)=>void;panels:Record<InspectorTab,ReactNode>}) {
  const [narrow,setNarrow]=useState(false);
  const [controlsSlot,setControlsSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>setControlsSlot(document.getElementById('console-controls')),[]);
  useEffect(()=>{const media=matchMedia('(max-width: 1099px), (max-height: 599px)');const update=()=>setNarrow(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const content=<Tabs.Root value={tab} onValueChange={value=>onTab(value as InspectorTab)} className={styles.inspectorTabs}>
    <Tabs.List className={styles.tabList} aria-label="Console inspector">{INSPECTOR_TABS.map(value=><Tabs.Tab key={value} value={value}>{value.toUpperCase()}</Tabs.Tab>)}</Tabs.List>
    <div className={styles.panelScroll}>{INSPECTOR_TABS.map(value=><Tabs.Panel key={value} value={value} keepMounted hidden={tab!==value} data-inspector-panel={value}>{panels[value]}</Tabs.Panel>)}</div>
  </Tabs.Root>;
  if(!narrow)return <aside className={styles.inspector} hidden={!open} aria-label="Console inspector">{content}</aside>;
  return <Dialog.Root open={open} onOpenChange={onOpen} modal={false} disablePointerDismissal>
    {controlsSlot&&createPortal(<Dialog.Trigger className={styles.mobileLauncher}>CONTROLS</Dialog.Trigger>,controlsSlot)}
    <Dialog.Portal><Dialog.Popup className={styles.sheet} initialFocus={false}>
      <div className={styles.sheetHeading}><Dialog.Title>OBSERVATORY CONTROLS</Dialog.Title><Dialog.Close aria-label="Close controls">CLOSE</Dialog.Close></div>
      {content}
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
