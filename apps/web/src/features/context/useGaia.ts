'use client';
import {useEffect, useState} from 'react';
import {loadGaiaContext, type GaiaContext} from '@/lib/api/client';
import type {SequenceManifest} from '@/features/explorer/interfaces';

export function useGaia(sequence: SequenceManifest | null, enabled: boolean) {
  const [data,setData]=useState<GaiaContext|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!sequence||!enabled||data?.sequence_id===sequence.sequence_id)return;
    const controller=new AbortController();
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},35000);
    setLoading(true);setError('');
    loadGaiaContext(sequence,controller.signal).then(result=>{
      if(!controller.signal.aborted)setData(result);
    }).catch(cause=>{
      if(timedOut)setError('Gaia took too long to answer. Retry later; your SPHEREx observations remain available.');
      else if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Gaia context is unavailable.');
    }).finally(()=>{clearTimeout(timeout);if(!controller.signal.aborted||timedOut)setLoading(false);});
    return()=>{clearTimeout(timeout);controller.abort();};
  },[sequence,enabled,data,attempt]);
  return {data,error,loading,retry:()=>{setData(null);setAttempt(value=>value+1);}};
}
