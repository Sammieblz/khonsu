import type {SearchState} from './SearchStatus';
import type {PresentationState} from './ExplorerSession';
export interface LoadingStatus {key:string;title:string;detail:string;busy:boolean;progress?:number;retry?:boolean;}
export function observationStatus(search:SearchState,exampleLoading:boolean,exampleError:string,sequenceId:string|null,presentation:PresentationState):LoadingStatus|null {
  if(exampleLoading)return {key:'saved',title:'Opening saved observations',detail:'Checking the real SPHEREx bundle and its image assets.',busy:true};
  if(search.phase==='running'){
    const job=search.job,status=job?.status??'queued';
    const title=status==='retrieving'?'Gathering your patch of sky':status==='processing'?'Preparing the observations':status==='ready'?'Bringing the images into view':'Sending your sky request';
    return {key:status,title,detail:job?.message??'Connecting to the observation service. You can cancel at any time.',busy:true,progress:job?.progress??undefined};
  }
  if(search.phase==='failed')return {key:'failed',title:search.guide.title,detail:search.message+' '+search.guide.hint,busy:false,retry:search.guide.retry};
  if(search.phase==='cancelled')return {key:'cancelled',title:'Search stopped',detail:'Your coordinates are still available. Try again whenever you are ready.',busy:false,retry:true};
  if(exampleError)return {key:'example-failed',title:'Saved observations are unavailable',detail:exampleError,busy:false,retry:true};
  if(sequenceId&&(presentation.sequenceId!==sequenceId||presentation.phase==='empty'||presentation.phase==='loading'))return {key:'rendering',title:'Bringing the images into view',detail:'Loading the selected observation and preparing its display.',busy:true};
  return null;
}
