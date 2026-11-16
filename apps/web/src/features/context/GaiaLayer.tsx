import type {GaiaContext} from '@/lib/api/client';
import styles from './context.module.css';

interface Props {
  data: GaiaContext; frameId: string; width: number; height: number;
  view: {x:number;y:number;zoom:number}; viewportWidth: number;
  selected: string; interactive: boolean; onSelect:(id:string)=>void;
}

export function GaiaLayer({data,frameId,width,height,view,viewportWidth,selected,interactive,onSelect}:Props) {
  const radius=7*width/Math.max(1,viewportWidth)/view.zoom;
  return <svg className={styles.markers} viewBox={`-.5 -.5 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"
    style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}}>
    {data.sources.map(source=>{
      const point=source.positions.find(item=>item.frame_id===frameId);
      return point&&<circle key={source.source_id} data-gaia-id={source.source_id} cx={point.x} cy={point.y} r={radius}
        vectorEffect="non-scaling-stroke" fill="none" stroke={selected===source.source_id?'#f3bc60':'#79c7e8'} strokeWidth={selected===source.source_id?3:1.5}
        strokeDasharray={source.position_method==='catalog-position'?'3 3':undefined}
        style={{pointerEvents:interactive?'all':'none',cursor:interactive?'pointer':undefined}}
        onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()}
        onClick={event=>{event.stopPropagation();onSelect(source.source_id);}}><title>Gaia DR3 {source.source_id}</title></circle>;
    })}
  </svg>;
}
