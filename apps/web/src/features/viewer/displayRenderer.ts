import { renderPixels, type Raster, type DisplayOptions } from './display';
const vertex=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D intensity;
uniform highp usampler2D validity;
uniform float low; uniform float high; uniform float a; uniform float gammaValue;
uniform int useAsinh; uniform int hatch; uniform int height;
out vec4 color;
float inverseSinh(float x){return log(x+sqrt(x*x+1.0));}
void main(){
 ivec2 p=ivec2(int(gl_FragCoord.x),height-1-int(gl_FragCoord.y));
 if(texelFetch(validity,p,0).r==uint(0)){
  bool line=hatch==1&&(p.x+p.y)%8<2;
  color=vec4(line?vec3(70.,82.,99.)/255.:vec3(39.,49.,64.)/255.,1.);return;
 }
 float value=clamp((texelFetch(intensity,p,0).r-low)/(high-low),0.,1.);
 if(useAsinh==1)value=inverseSinh(value/a)/inverseSinh(1./a);
 value=floor(pow(value,1./gammaValue)*255.+.5)/255.;color=vec4(vec3(value),1.);
}`;
type Result=HTMLCanvasElement|ImageBitmap|ImageData;
export class DisplayRenderer {
  private canvas=document.createElement('canvas');
  private gl:WebGL2RenderingContext|null=null;
  private program:WebGLProgram|null=null;
  private textures:WebGLTexture[]=[];
  private worker:Worker|null=null;
  private serial=0;
  private pending:{id:number;resolve:(value:Result)=>void;reject:(error:Error)=>void;raster:Raster;options:DisplayOptions}|null=null;
  private lost=()=>{this.gl=null;this.program=null;this.textures=[];this.onChange();};
  mode='CPU canvas';
  constructor(private onChange:()=>void,forceCpu=false){
    this.canvas.addEventListener('webglcontextlost',this.lost);
    if(!forceCpu)try{
      const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
      if(gl){
        const program=gl.createProgram()!;
        for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Shader unavailable');gl.attachShader(program,shader);gl.deleteShader(shader);}
        gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Display shader link failed');
        this.gl=gl;this.program=program;this.textures=[gl.createTexture()!,gl.createTexture()!];this.mode='GPU WebGL2';
      }
    }catch{this.gl=null;}
    if(typeof Worker!=='undefined')try{
      this.worker=new Worker(new URL('./display.worker.ts',import.meta.url));
      this.worker.onmessage=event=>{const pending=this.pending;if(!pending||event.data.id!==pending.id){event.data.bitmap?.close();return;}this.pending=null;if(event.data.error){pending.reject(Error(event.data.error));return;}pending.resolve(event.data.bitmap ?? new ImageData(event.data.pixels,pending.raster.width,pending.raster.height));};
      this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;const pending=this.pending;this.pending=null;if(pending)pending.resolve(new ImageData(renderPixels(pending.raster,pending.options) as Uint8ClampedArray<ArrayBuffer>,pending.raster.width,pending.raster.height));this.mode='CPU canvas';this.onChange();};
      if(!this.gl)this.mode='CPU worker';
    }catch{this.worker=null;}
  }
  async render(raster:Raster,options:DisplayOptions):Promise<Result>{
    const gl=this.gl,program=this.program;
    if(gl&&program&&!gl.isContextLost())try{
      this.canvas.width=raster.width;this.canvas.height=raster.height;gl.viewport(0,0,raster.width,raster.height);gl.useProgram(program);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      this.textures.forEach((texture,index)=>{gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,index===0?gl.R32F:gl.R8UI,raster.width,raster.height,0,index===0?gl.RED:gl.RED_INTEGER,index===0?gl.FLOAT:gl.UNSIGNED_BYTE,index===0?raster.values:raster.valid);});
      const uniform=(name:string)=>gl.getUniformLocation(program,name);
      gl.uniform1i(uniform('intensity'),0);gl.uniform1i(uniform('validity'),1);gl.uniform1i(uniform('height'),raster.height);gl.uniform1i(uniform('useAsinh'),options.curve==='asinh'?1:0);gl.uniform1i(uniform('hatch'),options.mask==='hatch'?1:0);
      gl.uniform1f(uniform('low'),options.low);gl.uniform1f(uniform('high'),options.high);gl.uniform1f(uniform('a'),options.a);gl.uniform1f(uniform('gammaValue'),options.gamma);
      gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw Error('GPU display unavailable');this.mode='GPU WebGL2';return this.canvas;
    }catch{this.gl=null;this.onChange();}
    if(this.worker){this.mode='CPU worker';return new Promise((resolve,reject)=>{this.pending?.reject(Error('Superseded display'));const id=++this.serial;this.pending={id,resolve,reject,raster,options};this.worker!.postMessage({id,raster,options});});}
    this.mode='CPU canvas';return new ImageData(renderPixels(raster,options) as Uint8ClampedArray<ArrayBuffer>,raster.width,raster.height);
  }
  dispose(){this.canvas.removeEventListener('webglcontextlost',this.lost);this.worker?.terminate();this.pending?.reject(Error('Renderer closed'));this.pending=null;if(this.gl){for(const texture of this.textures)this.gl.deleteTexture(texture);if(this.program)this.gl.deleteProgram(this.program);this.gl.getExtension('WEBGL_lose_context')?.loseContext();}this.gl=null;}
}
