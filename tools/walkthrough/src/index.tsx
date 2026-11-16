import React from 'react';
import {AbsoluteFill,Composition,registerRoot,Sequence,useCurrentFrame,interpolate,Easing,Img,staticFile,OffthreadVideo,Html5Audio} from 'remotion';
import timeline from './timeline.json';
import captures from '../captures.json';

const C={space:'#070b12',ivory:'#f1f0e9',amber:'#edb85e',silver:'#aab5c7',cyan:'#79c7e8'};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
function Sky(){const f=useCurrentFrame();return <AbsoluteFill style={{overflow:'hidden'}}><svg width="1920" height="1080" style={{opacity:.55,transform:`rotate(${f/1100}deg) scale(1.08)`}}>{Array.from({length:150},(_,i)=><circle key={i} cx={(i*619+53)%1920} cy={(i*i*47+89)%1080} r={i%13===0?2:1} fill={i%9===0?C.amber:C.silver} opacity={.2+(i%6)/9}/>)}{Array.from({length:7},(_,i)=><path key={i} d={`M -200 ${1000+i*100} Q 900 ${-800+i*100} 2200 ${500+i*120}`} stroke={i%2?C.cyan:C.amber} strokeOpacity=".17" fill="none" strokeWidth="1"/>)}</svg></AbsoluteFill>}
function Segment({scene,index,total,cut}:{scene:any;index:number;total:number;cut:string}){
 const f=useCurrentFrame();const intro=scene.id==='story'||scene.id==='outro';
 const enter=interpolate(f,[0,16],[0,1],{...clamp,easing:Easing.bezier(.23,1,.32,1)});
 const exit=interpolate(f,[scene.duration-9,scene.duration],[1,0],clamp);
 const caption=scene.audio.find((a:any)=>f>=a.start&&f<a.start+a.frames);
 const clip=(captures as any)[scene.id];
 const lead=clip&&cut==='short'&&scene.id==='candidate'?Math.max(0,clip.duration-scene.duration/30-.2):0;
 const available=clip?Math.max(1,Math.floor((clip.duration-lead-.4)*30)):0;
 return <AbsoluteFill style={{opacity:enter*exit}}>
  {scene.audio.map((a:any)=><Sequence key={a.src} from={a.start} durationInFrames={a.frames}><Html5Audio src={staticFile(a.src)} playbackRate={a.speed}/></Sequence>)}
  <div style={{position:'absolute',left:64,top:35,display:'flex',alignItems:'center',gap:18}}><Img src={staticFile('mark.svg')} style={{width:48,height:48}}/><span style={{letterSpacing:11,fontSize:27}}>KHONSU</span></div>
  <div style={{position:'absolute',right:64,top:50,fontSize:20,letterSpacing:3,color:C.silver}}>{cut==='short'?'NASA SPACE APPS / BYTEBOYZ':'FIELD GUIDE / '+String(index+1).padStart(2,'0')+' OF '+total}</div>
  {intro?<>
   <Img src={staticFile('planet.webp')} style={{position:'absolute',width:1400,height:1000,objectFit:'cover',right:-400,top:-100,opacity:.38,transform:`scale(${1+f/scene.duration*.04})`}}/>
   <div style={{position:'absolute',left:100,right:160,top:260,transform:`translateY(${(1-enter)*24}px)`}}><div style={{color:C.amber,fontSize:25,letterSpacing:6,marginBottom:30}}>{scene.kicker.toUpperCase()}</div><h1 style={{fontFamily:'Display',fontSize:150,lineHeight:.95,fontWeight:600,maxWidth:1350,margin:0}}>{scene.title}</h1><div style={{height:3,width:interpolate(f,[8,42],[0,550],clamp),background:C.amber,marginTop:50}}/><p style={{fontSize:30,color:C.silver,letterSpacing:3}}>{scene.id==='story'?'FROM WONDER TO OBSERVATION':'ONE SKY. MANY MOMENTS.'}</p></div>
   <div style={{position:'absolute',bottom:195,left:100,color:C.silver,fontSize:18}}>{scene.id==='story'?'Original illustrative sky / no Marvel footage or music':'NASA/IPAC IRSA SPHEREx data / independent Space Apps project / no NASA endorsement'}</div>
  </>:<>
   <div style={{position:'absolute',left:64,top:210,width:395,transform:`translateX(${(1-enter)*-26}px)`}}><div style={{fontFamily:'Display',fontSize:100,color:C.amber,opacity:.75}}>{String(index).padStart(2,'0')}</div><h2 style={{fontFamily:'Display',fontSize:75,lineHeight:1.02,fontWeight:600,margin:'24px 0'}}>{scene.title}</h2><div style={{width:90,height:3,background:C.amber}}/><p style={{fontSize:27,lineHeight:1.5,color:C.silver}}>{scene.kicker}</p><p style={{fontSize:19,lineHeight:1.7,color:C.cyan,marginTop:35}}>PAUSE. COMPARE. NOTICE.</p></div>
   <div style={{position:'absolute',left:530,top:116,color:C.silver,fontSize:18,letterSpacing:2}}>RECORDED APPLICATION / {['entry','share'].includes(scene.id)?'KHONSU INTERFACE':'CACHED REAL SPHEREx OBSERVATIONS'}</div>
   <div style={{position:'absolute',left:530,top:156,width:1326,height:746,overflow:'hidden',border:'1px solid #4d5c6e',boxShadow:'0 24px 80px #0008',transform:`translateY(${(1-enter)*16}px)`}}>
    {clip&&<><Sequence durationInFrames={Math.min(available,scene.duration)}><OffthreadVideo src={staticFile('captures/'+scene.id+'.webm')} trimBefore={Math.round((clip.from+lead)*30)} muted style={{width:'100%',height:'100%'}}/></Sequence>{available<scene.duration&&<Sequence from={available}><Img src={staticFile('captures/'+scene.id+'.png')} style={{width:'100%',height:'100%'}}/></Sequence>}</>}
    <div style={{position:'absolute',left:5,bottom:7,width:50,height:44,background:'#0b121d'}}/>
   </div>
  </>}
  {caption&&<div style={{position:'absolute',bottom:31,left:75,right:75,minHeight:99,display:'flex',alignItems:'center',justifyContent:'center',background:'#070b12f2',borderTop:'1px solid #edb85e66',padding:'15px 32px',textAlign:'center',fontSize:34,lineHeight:1.3,color:C.ivory}}>{caption.text}</div>}
 </AbsoluteFill>
}
function Film({cut}:{cut:'long'|'short'}){const f=useCurrentFrame(),plan=timeline[cut];return <AbsoluteFill style={{background:C.space,color:C.ivory,fontFamily:'Arial, sans-serif'}}><style>{`@font-face{font-family:Display;src:url('${staticFile('display.ttf')}')}*{box-sizing:border-box}`}</style><Sky/><Html5Audio src={staticFile('narration/ambience.wav')} volume={af=>.6*Math.min(1,af/30,Math.max(0,(plan.frames-af)/30))}/>{plan.scenes.map((s,i)=><Sequence key={s.id} from={s.start} durationInFrames={s.duration}><Segment scene={s} index={i} total={plan.scenes.length} cut={cut}/></Sequence>)}<div style={{position:'absolute',left:0,bottom:0,height:4,width:`${f/plan.frames*100}%`,background:C.amber}}/></AbsoluteFill>}
registerRoot(()=> <><Composition id="KhonsuWalkthrough" component={Film} defaultProps={{cut:'long' as const}} durationInFrames={timeline.long.frames} fps={30} width={1920} height={1080}/><Composition id="KhonsuSubmission" component={Film} defaultProps={{cut:'short' as const}} durationInFrames={900} fps={30} width={1920} height={1080}/></>);
