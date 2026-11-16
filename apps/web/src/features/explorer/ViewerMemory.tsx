'use client';
import {createContext,useContext,useRef,useState,type ReactNode,type SetStateAction} from 'react';

type Memory={key:string;values:Record<string,unknown>};
const Context=createContext<{current:Memory}|null>(null);
export function ViewerMemory({children}:{children:ReactNode}) {
  const memory=useRef<Memory>({key:'',values:{}});
  return <Context.Provider value={memory}>{children}</Context.Provider>;
}
// A bounded snapshot for returning from the landing page. Only one viewer is active.
export function useViewerSetting<T>(sequenceId:string,name:string,initial:T):[T,(next:SetStateAction<T>)=>void] {
  const memory=useContext(Context);
  if(memory&&memory.current.key!==sequenceId)memory.current={key:sequenceId,values:{}};
  const [value,setValue]=useState<T>(()=>memory&&name in memory.current.values?memory.current.values[name] as T:initial);
  function update(next:SetStateAction<T>){setValue(previous=>{const result=typeof next==='function'?(next as (old:T)=>T)(previous):next;if(memory&&memory.current.key===sequenceId)memory.current.values[name]=result;return result;});}
  return [value,update];
}
