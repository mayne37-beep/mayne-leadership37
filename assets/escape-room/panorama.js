(function(root){
  'use strict';
  const rad = degrees => degrees*Math.PI/180;
  const deg = radians => radians*180/Math.PI;
  function directionAt(px,py,width,height,view) {
    const t=Math.tan(rad(view.fov)/2), u=(px/width*2-1)*t*width/height, v=(1-py/height*2)*t;
    const pitch=rad(view.pitch),yaw=rad(view.yaw);
    const xp=u, yp=v*Math.cos(pitch)+Math.sin(pitch), zp=-v*Math.sin(pitch)+Math.cos(pitch);
    const x=xp*Math.cos(yaw)+zp*Math.sin(yaw), z=-xp*Math.sin(yaw)+zp*Math.cos(yaw);
    return {yaw:deg(Math.atan2(x,z)),pitch:deg(Math.atan2(yp,Math.hypot(x,z)))};
  }
  function project(yaw,pitch,width,height,view) {
    const y=rad(pitch),x=rad(yaw),vy=rad(view.yaw),vp=rad(view.pitch);
    const dx=Math.sin(x)*Math.cos(y),dy=Math.sin(y),dz=Math.cos(x)*Math.cos(y);
    const xx=dx*Math.cos(vy)-dz*Math.sin(vy), zz=dx*Math.sin(vy)+dz*Math.cos(vy);
    const yy=dy*Math.cos(vp)-zz*Math.sin(vp), z=dy*Math.sin(vp)+zz*Math.cos(vp);
    if (z<=0.05) return null;
    const t=Math.tan(rad(view.fov)/2),nx=xx/(z*t*width/height),ny=yy/(z*t);
    if (Math.abs(nx)>1.5 || Math.abs(ny)>1.5) return null;
    return {x:(nx+1)*50,y:(1-ny)*50};
  }
  class Viewer {
    constructor(canvas,source,view,onFailure){
      this.canvas=canvas;this.view=view;this.onFailure=onFailure;
      const gl=canvas.getContext('webgl',{alpha:false,antialias:true});
      if (!gl) throw new Error('360° viewing needs WebGL in this browser. Choose a photo scene instead.');
      this.gl=gl;
      const vertex='attribute vec2 pos; varying vec2 uv; void main(){uv=pos;gl_Position=vec4(pos,0.0,1.0);}';
      const fragment='precision highp float; varying vec2 uv; uniform sampler2D tex; uniform vec2 angle; uniform float aspect; uniform float fov; void main(){float t=tan(fov*0.5);vec3 d=normalize(vec3(uv.x*t*aspect,uv.y*t,1.0));float cp=cos(angle.y),sp=sin(angle.y);d=vec3(d.x,d.y*cp+d.z*sp,-d.y*sp+d.z*cp);float cy=cos(angle.x),sy=sin(angle.x);d=vec3(d.x*cy+d.z*sy,d.y,-d.x*sy+d.z*cy);vec2 sampleUV=vec2(fract(0.5+atan(d.x,d.z)/6.28318530718),0.5-asin(clamp(d.y,-1.0,1.0))/3.14159265359);gl_FragColor=texture2D(tex,sampleUV);}';
      const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
      this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error('The panorama renderer could not initialize.');
      gl.useProgram(this.program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(this.program,'pos');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([224,234,241,255]));
      this.img=new Image();this.img.onload=()=>{if(this.disposed)return;const max=gl.getParameter(gl.MAX_TEXTURE_SIZE);let source=this.img;if(source.width>max || source.height>max){const reduced=document.createElement('canvas');const factor=Math.min(max/source.width,max/source.height);reduced.width=Math.floor(source.width*factor);reduced.height=Math.floor(source.height*factor);reduced.getContext('2d').drawImage(source,0,0,reduced.width,reduced.height);source=reduced;}gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);this.draw();};this.img.onerror=()=>onFailure?.('The 360° photo could not be opened. Upload a JPG or PNG panorama.');this.img.src=source;
      this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);this.draw();
    }
    draw(){if(this.disposed)return;const gl=this.gl,c=this.canvas;const ratio=Math.min(root.devicePixelRatio||1,2);c.width=Math.max(1,c.clientWidth*ratio);c.height=Math.max(1,c.clientHeight*ratio);gl.viewport(0,0,c.width,c.height);gl.useProgram(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'angle'),rad(this.view.yaw),rad(this.view.pitch));gl.uniform1f(gl.getUniformLocation(this.program,'fov'),rad(this.view.fov));gl.uniform1f(gl.getUniformLocation(this.program,'aspect'),c.width/c.height);gl.drawArrays(gl.TRIANGLES,0,6);}
    destroy(){this.disposed=true;this.observer?.disconnect();this.gl.deleteTexture(this.texture);this.gl.deleteProgram(this.program);this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }
  root.EscapePanorama={Viewer,project,directionAt};
  if(typeof module!=='undefined' && module.exports)module.exports=root.EscapePanorama;
})(typeof window==='undefined'?globalThis:window);
