import { renderPixels, validateDisplay, type Raster, type DisplayOptions, type DisplaySize } from './display';

const vertex = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
const common = `
precision highp float;
precision highp int;
uniform sampler2D intensity;
uniform highp usampler2D validity;
uniform ivec2 sourceSize;
uniform float low; uniform float high;
ivec2 bounded(ivec2 p){return clamp(p,ivec2(0),sourceSize-1);}
bool validAt(ivec2 p){return texelFetch(validity,bounded(p),0).r!=uint(0);}
float valueAt(ivec2 p){return texelFetch(intensity,bounded(p),0).r;}
`;
const displayFragment = `#version 300 es
${common}
uniform ivec2 outputSize;
uniform float a; uniform float gammaValue;
uniform int useAsinh; uniform int hatch; uniform int smoothView;
out vec4 color;
float inverseSinh(float x){return log(x+sqrt(x*x+1.));}
void main(){
 vec2 s=vec2(gl_FragCoord.x,float(outputSize.y)-gl_FragCoord.y)*vec2(sourceSize)/vec2(outputSize)-.5;
 ivec2 outputPixel=ivec2(int(gl_FragCoord.x),outputSize.y-1-int(gl_FragCoord.y));
 ivec2 nearest=(2*outputPixel+1)*sourceSize/(2*outputSize);
 if(!validAt(nearest)){
  bool line=hatch==1&&(nearest.x+nearest.y)%8<2;
  color=vec4(line?vec3(70.,82.,99.)/255.:vec3(39.,49.,64.)/255.,1.);return;
 }
 float value=valueAt(nearest);
 if(smoothView==1){
  ivec2 base=ivec2(floor(s));vec2 fraction=fract(s);float total=0.,weight=0.;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
   ivec2 p=base+ivec2(x,y);
   float w=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
   if(validAt(p)){total+=valueAt(p)*w;weight+=w;}
  }
  value=total/max(weight,1e-8);
 }
 value=clamp((value-low)/(high-low),0.,1.);
 if(useAsinh==1)value=inverseSinh(value/a)/inverseSinh(1./a);
 value=floor(pow(value,1./gammaValue)*255.+.5)/255.;color=vec4(vec3(value),1.);
}`;
const detailFragment = `#version 300 es
${common}
uniform float amount;
out float result;
float weight(int x){return abs(x)==2?1.:abs(x)==1?4.:6.;}
void main(){
 // Native-grid storage orientation matches the uploaded typed array.
 ivec2 p=ivec2(gl_FragCoord.xy);float original=valueAt(p);result=original;
 if(!validAt(p))return;
 float smoothValue=0.;
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  ivec2 q=p+ivec2(x,y);if(!validAt(q))return;
  smoothValue+=valueAt(q)*weight(x)*weight(y)/256.;
 }
 float span=high-low,r=original-smoothValue;
 float correction=sign(r)*max(abs(r)-.025*span,0.);
 result=original+amount*clamp(correction,-.08*span,.08*span);
}`;

type Result = HTMLCanvasElement | ImageBitmap | ImageData;
interface Pending {
  id:number; resolve:(value:Result)=>void; reject:(error:Error)=>void;
  raster:Raster; options:DisplayOptions; size:DisplaySize;
}

function program(gl:WebGL2RenderingContext, fragment:string):WebGLProgram {
  const value=gl.createProgram();
  if(!value)throw Error('WebGL program unavailable');
  const shaders:WebGLShader[]=[];
  try{
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
      const shader=gl.createShader(type);if(!shader)throw Error('WebGL shader unavailable');
      shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Shader unavailable');
      gl.attachShader(value,shader);
    }
    gl.linkProgram(value);
    if(!gl.getProgramParameter(value,gl.LINK_STATUS))throw Error('Display shader link failed');
    return value;
  }catch(error){gl.deleteProgram(value);throw error;}
  finally{for(const shader of shaders)gl.deleteShader(shader);}
}

export class DisplayRenderer {
  private canvas=document.createElement('canvas');
  private gl:WebGL2RenderingContext|null=null;
  private displayProgram:WebGLProgram|null=null;
  private detailProgram:WebGLProgram|null=null;
  private textures:WebGLTexture[]=[];
  private framebuffer:WebGLFramebuffer|null=null;
  private floatTargets=false;
  private uploaded:Raster|null=null;
  private processedKey='';
  private worker:Worker|null=null;
  private serial=0;
  private pending:Pending|null=null;
  private lost=()=>{this.uploaded=null;this.processedKey='';this.onChange();};
  mode='CPU canvas';
  adapter='CPU display';

  constructor(private onChange:()=>void,forceCpu=false){
    this.canvas.addEventListener('webglcontextlost',this.lost);
    if(!forceCpu)try{
      const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
      if(gl){
        this.gl=gl;this.displayProgram=program(gl,displayFragment);
        this.floatTargets=!!gl.getExtension('EXT_color_buffer_float');
        if(this.floatTargets){this.detailProgram=program(gl,detailFragment);this.framebuffer=gl.createFramebuffer();}
        for(let i=0;i<3;i++){const texture=gl.createTexture();if(!texture)throw Error('Display texture unavailable');this.textures.push(texture);}
        const debug=gl.getExtension('WEBGL_debug_renderer_info');
        this.adapter=debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'Adapter information unavailable';
        this.mode='WebGL2';
      }
    }catch{this.releaseGpu();this.adapter='WebGL unavailable; CPU display';}
    if(typeof Worker!=='undefined')try{
      this.worker=new Worker(new URL('./display.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=event=>{
        const pending=this.pending;
        if(!pending||event.data.id!==pending.id){event.data.bitmap?.close();return;}
        this.pending=null;
        if(event.data.error){pending.reject(Error(event.data.error));return;}
        pending.resolve(event.data.bitmap??new ImageData(event.data.pixels,pending.size.width,pending.size.height));
      };
      this.worker.onerror=event=>{
        event.preventDefault();this.worker?.terminate();this.worker=null;
        const pending=this.pending;this.pending=null;
        if(pending)pending.resolve(this.cpu(pending.raster,pending.options,pending.size));
        this.mode='CPU canvas';this.onChange();
      };
      if(!this.gl)this.mode='CPU worker';
    }catch{this.worker=null;}
  }

  private cpu(raster:Raster,options:DisplayOptions,size:DisplaySize){
    return new ImageData(renderPixels(raster,options,size) as Uint8ClampedArray<ArrayBuffer>,size.width,size.height);
  }

  private bindTexture(index:number,unit=index){
    const gl=this.gl!;
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]!);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }

  private upload(raster:Raster){
    if(this.uploaded===raster)return;
    const gl=this.gl!;gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    this.bindTexture(0);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,raster.width,raster.height,0,gl.RED,gl.FLOAT,raster.values);
    this.bindTexture(1);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8UI,raster.width,raster.height,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,raster.valid);
    if(this.floatTargets){this.bindTexture(2);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,raster.width,raster.height,0,gl.RED,gl.FLOAT,null);}
    this.uploaded=raster;this.processedKey='';
  }

  private shared(program:WebGLProgram,raster:Raster,options:DisplayOptions){
    const gl=this.gl!,uniform=(name:string)=>gl.getUniformLocation(program,name);
    gl.uniform1i(uniform('intensity'),0);gl.uniform1i(uniform('validity'),1);
    gl.uniform2i(uniform('sourceSize'),raster.width,raster.height);
    gl.uniform1f(uniform('low'),options.low);gl.uniform1f(uniform('high'),options.high);
  }

  async render(raster:Raster,options:DisplayOptions,size:DisplaySize=raster):Promise<Result>{
    validateDisplay(options,size);
    const gl=this.gl,display=this.displayProgram,amount=options.detail??0;
    if(gl&&display&&!gl.isContextLost()&&(amount===0||this.floatTargets))try{
      if(this.canvas.width!==size.width)this.canvas.width=size.width;
      if(this.canvas.height!==size.height)this.canvas.height=size.height;
      this.upload(raster);
      const key=`${options.low},${options.high},${amount}`;
      if(amount>0&&key!==this.processedKey){
        const detail=this.detailProgram!;
        gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.textures[2]!,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float target unavailable');
        gl.viewport(0,0,raster.width,raster.height);gl.useProgram(detail);
        this.bindTexture(0,0);this.bindTexture(1,1);this.shared(detail,raster,options);
        gl.uniform1f(gl.getUniformLocation(detail,'amount'),amount);gl.drawArrays(gl.TRIANGLES,0,3);
        this.processedKey=key;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,size.width,size.height);gl.useProgram(display);
      this.bindTexture(amount>0?2:0,0);this.bindTexture(1,1);this.shared(display,raster,options);
      const uniform=(name:string)=>gl.getUniformLocation(display,name);
      gl.uniform2i(uniform('outputSize'),size.width,size.height);
      gl.uniform1i(uniform('smoothView'),options.sampling==='smooth'?1:0);
      gl.uniform1i(uniform('useAsinh'),options.curve==='asinh'?1:0);
      gl.uniform1i(uniform('hatch'),options.mask==='hatch'?1:0);
      gl.uniform1f(uniform('a'),options.a);gl.uniform1f(uniform('gammaValue'),options.gamma);
      gl.drawArrays(gl.TRIANGLES,0,3);
      if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL display unavailable');
      this.mode='WebGL2';return this.canvas;
    }catch{this.releaseGpu();this.onChange();}
    if(this.worker){
      this.mode='CPU worker';
      return new Promise((resolve,reject)=>{
        this.pending?.reject(Error('Superseded display'));const id=++this.serial;
        this.pending={id,resolve,reject,raster,options,size};this.worker!.postMessage({id,raster,options,size});
      });
    }
    this.mode='CPU canvas';return this.cpu(raster,options,size);
  }

  private releaseGpu(){
    const gl=this.gl;
    if(gl&&!gl.isContextLost()){
      for(const texture of this.textures)gl.deleteTexture(texture);
      if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);
      if(this.displayProgram)gl.deleteProgram(this.displayProgram);
      if(this.detailProgram)gl.deleteProgram(this.detailProgram);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl=null;this.textures=[];this.displayProgram=null;this.detailProgram=null;
    this.framebuffer=null;this.uploaded=null;this.processedKey='';
  }

  dispose(){
    this.canvas.removeEventListener('webglcontextlost',this.lost);this.worker?.terminate();
    this.pending?.reject(Error('Renderer closed'));this.pending=null;this.releaseGpu();
  }
}
