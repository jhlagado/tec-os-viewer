// Fixed presentation trials, after the production decoder. Model-only UI.
import { renderText80, renderTms, isText80 } from '/src/tms.mjs';
const $ = id => document.getElementById(id);
const fixture = await fetch('/evidence/vs3-model/fixtures.json').then(r => r.json());
const frames = fixture.frames.map(f => ({ ...f, snapshot: { registers: Uint8Array.from(f.snapshot.registers), vram: Uint8Array.from(f.snapshot.vram) } }));
const sharp = $('sharp'), glow = $('glow'), ctx = sharp.getContext('2d'), gc = glow.getContext('2d');
const buffers = new Map();
const hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), v => v.toString(16).padStart(2,'0')).join('');
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 192" preserveAspectRatio="none">${Array.from({length:192},(_,y)=>`<rect x="0" y="${y+.75}" width="1" height=".25" fill="black" fill-opacity=".12"/>`).join('')}</svg>`;
$('mask').style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`;
let current, variant = 'R', maskOff = false;
function buffer(width) {
  if (!buffers.has(width)) {
    const raw = document.createElement('canvas'), floor = document.createElement('canvas');
    raw.width = floor.width = width; raw.height = floor.height = 192;
    const rc = raw.getContext('2d'), fc = floor.getContext('2d');
    buffers.set(width,{raw,floor,rc,fc,image:rc.createImageData(width,192),floorImage:fc.createImageData(width,192)});
  }
  return buffers.get(width);
}
function decode(f) {
  const b = buffer(f.sourceWidth);
  if (isText80(f.snapshot.registers)) renderText80(b.image,f.snapshot);
  else if (!renderTms(b.image,f.snapshot)) throw Error('unsupported frozen mode');
  b.rc.putImageData(b.image,0,0);
  return b;
}
function floorCopy(b) {
  const d = b.floorImage.data, s = b.image.data; d.set(s);
  for (let i=0;i<d.length;i+=4) if (s[i]===0 && s[i+1]===0 && s[i+2]===0) { d[i+1]=8; d[i+2]=2; }
  b.fc.putImageData(b.floorImage,0,0); return b.floor;
}
function geometry() {
  const b=sharp.getBoundingClientRect(), rowDevice=b.height*devicePixelRatio/192;
  return { x:b.x,y:b.y,width:b.width,height:b.height,dpr:devicePixelRatio,zoom:visualViewport.scale,
    rowDevicePixels:rowDevice,fractionalRows:Math.abs(rowDevice-Math.round(rowDevice))>1e-6,
    sourceXScale:current ? b.width*devicePixelRatio/current.sourceWidth : null,
    maskActive:variant==='L' && !maskOff && rowDevice>=2 };
}
function draw(f, candidate='R', options={}) {
  current=f; variant=candidate; maskOff=Boolean(options.maskOff);
  const b=decode(f), withFloor=candidate==='G'||candidate==='L';
  // The stale control changes only the pixels delivered to the visible sharp layer.
  let visible=b;
  if (options.visibleFrame) visible=decode(options.visibleFrame);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(withFloor?floorCopy(visible):visible.raw,0,0,1024,768);
  if (options.visibleFrame) decode(f); // keep the correct pre-effect reference for the boundary check
  sharp.style.imageRendering=candidate==='R'?'pixelated':'auto';
  glow.style.display=withFloor?'block':'none';
  if (withFloor) { gc.imageSmoothingEnabled=false; gc.drawImage(b.raw,0,0,1024,768); }
  const g=geometry(); $('mask').style.display=g.maskActive?'block':'none';
  $('status').textContent=`${f.id} ${candidate} | source ${f.sourceWidth} × 192 | mask ${g.maskActive?'on':'off'}`;
  return g;
}
async function verify(f=current) {
  const b=buffer(f.sourceWidth), sourceSha=await hash(b.rc.getImageData(0,0,f.sourceWidth,192).data);
  if (sourceSha!==f.rgbaSha256) throw Error('pre-effect source frame mismatch');
  const actual=ctx.getImageData(0,0,1024,768).data, expected=new Uint8ClampedArray(actual.length), src=b.image.data;
  const floor=variant==='G'||variant==='L';
  for(let y=0;y<768;y++) for(let x=0;x<1024;x++) {
    const si=(Math.floor(y/4)*f.sourceWidth+Math.floor(x*f.sourceWidth/1024))*4, o=(y*1024+x)*4;
    expected.set(src.subarray(si,si+4),o);
    if(floor && src[si]===0 && src[si+1]===0 && src[si+2]===0) { expected[o+1]=8;expected[o+2]=2; }
  }
  const actualSha=await hash(actual), expectedSha=await hash(expected);
  if(actualSha!==expectedSha) throw Error('visible sharp frame mismatch');
  const g=geometry(); if(Math.abs(g.width/g.height-4/3)>0.001) throw Error('aspect ratio changed');
  return {sourceSha,visibleSharpSha:actualSha,geometry:g,sourceWidth:f.sourceWidth,sourceHeight:192,
    settings:{candidate:variant,floor:floor?[0,8,2]:null,glowOpacity:floor?0.16:0,blurCssPixels:floor?1.2:0,maskOpacity:g.maskActive?0.12:0}};
}
for(const f of frames) {
  const b=decode(f); if(await hash(b.image.data)!==f.rgbaSha256) throw Error('frozen source identity mismatch: '+f.id);
  const option=document.createElement('option');option.value=f.id;option.textContent=f.id;$('frame').append(option);
}
const get=id=>frames.find(f=>f.id===id);
function choose(id,candidate,off=false) { $('frame').value=id;$('candidate').value=candidate;$('width').value=get(id).consoleWidth;$('off').checked=off;return draw(get(id),candidate,{maskOff:off}); }
$('candidate').onchange=()=>choose(current.id,$('candidate').value,$('off').checked);
$('frame').onchange=()=>choose($('frame').value,variant,$('off').checked);
$('width').onchange=()=>choose(`${$('width').value}-${current.kind}`,variant,$('off').checked);
$('off').onchange=()=>choose(current.id,variant,$('off').checked);
$('raw').onclick=()=>{choose(current.id,'R');sharp.focus();};
sharp.onclick=()=> (matchMedia('(pointer:coarse)').matches?$('keyboard'):sharp).focus();
for(const el of [sharp,$('keyboard')]) el.addEventListener('keydown',e=>{$('keys').textContent+=e.key;});
const ic=$('glcd').getContext('2d');ic.fillStyle='#6a8';ic.fillRect(0,0,256,128);ic.fillStyle='#123';ic.fillText('GLCD unchanged',15,30);
window.model={ frames:frames.map(({snapshot,...f})=>f),choose,verify,geometry,identity:fixture.identity,
  async staleControl(){ const f=get('80-reverse'),old=get('80-prompt');draw(f,'G',{visibleFrame:old});let error;try{await verify(f);}catch(e){error=e.message;}if(error!=='visible sharp frame mismatch')throw Error('stale visible frame was not detected: '+error);choose(f.id,'R');return {rejected:true,diagnostic:error,expected:f.id,stale:old.id}; },
  async benchmark(candidate,workload){
    const sequence=workload==='frozen'?[get('80-ted')]:['80-prompt','80-ted','80-reverse','80-demo'].map(get);
    const js=[],delivery=[];let prior;
    for(let i=0;i<360;i++) {
      const stamp=await new Promise(requestAnimationFrame);
      if(document.visibilityState!=='visible'||!document.hasFocus())throw Error('benchmark lost foreground focus');
      const start=performance.now();draw(sequence[i%sequence.length],candidate);const elapsed=performance.now()-start;
      if(i>=60){js.push(elapsed);delivery.push(stamp-prior);}prior=stamp;
    }
    const stats=a=>{const b=[...a].sort((a,b)=>a-b);return{median:b[Math.floor(b.length/2)],p95:b[Math.ceil(b.length*.95)-1],samples:a.length};};
    return {candidate,workload,warmup:60,samples:300,drawMs:stats(js),rafDeliveryMs:stats(delivery),rawDrawMs:js,rawRafIntervalsMs:delivery,
      foreground:{visibility:document.visibilityState,focus:document.hasFocus()},geometry:geometry(),sequence:sequence.map(f=>f.id),proof:await verify()};
  }
};
choose('80-reading','R');window.model.ready=true;
