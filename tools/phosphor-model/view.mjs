// Fixed presentation trials, after the production decoder. Model-only UI.
import { renderText80, renderTms, isText80 } from '/src/tms.mjs';
import { GROUPS, settings, maskRows } from './settings.mjs';
import { parseFont, checkGlyphPixels, enlarge, decodedMutations } from './oracle.mjs';
const $=id=>document.getElementById(id);
const group=new URLSearchParams(location.search).get('group')??'legacy';
if(!Object.hasOwn(GROUPS,group))throw Error('unknown model group: '+group);
const fixture=await fetch('/evidence/vs3-model/fixtures.json').then(r=>r.json());
const frames=fixture.frames.map(f=>({...f,snapshot:{registers:Uint8Array.from(f.snapshot.registers),vram:Uint8Array.from(f.snapshot.vram)}}));
const sharp=$('sharp'),glow=$('glow'),mask=$('mask'),ctx=sharp.getContext('2d'),gc=glow.getContext('2d');
const buffers=new Map();
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
const fontSource=new Uint8Array(await fetch('/'+fixture.identity.fontSource).then(r=>r.arrayBuffer()));
if(await hash(fontSource)!==fixture.identity.fontSourceSha256)throw Error('pinned font source identity mismatch');
const font=parseFont(new TextDecoder().decode(fontSource));
if(await hash(font)!==fixture.identity.fontBytesSha256)throw Error('pinned font bytes identity mismatch');
const maskSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 192" preserveAspectRatio="none">${maskRows().map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${r.fill}" fill-opacity="${r.opacity}"/>`).join('')}</svg>`;
const maskImage=`url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`;
mask.style.backgroundImage=maskImage;
let current,variant='R',maskOff=false;
function buffer(width){
  if(!buffers.has(width)){
    const raw=document.createElement('canvas'),floor=document.createElement('canvas');
    raw.width=floor.width=width;raw.height=floor.height=192;
    const rc=raw.getContext('2d'),fc=floor.getContext('2d');
    buffers.set(width,{raw,floor,rc,fc,image:rc.createImageData(width,192),floorImage:fc.createImageData(width,192)});
  }
  return buffers.get(width);
}
function decode(f){
  const b=buffer(f.sourceWidth);
  if(isText80(f.snapshot.registers))renderText80(b.image,f.snapshot);
  else if(!renderTms(b.image,f.snapshot))throw Error('unsupported frozen mode');
  b.rc.putImageData(b.image,0,0);return b;
}
function floorCopy(b){
  const d=b.floorImage.data,s=b.image.data;d.set(s);
  for(let i=0;i<d.length;i+=4)if(s[i]===0&&s[i+1]===0&&s[i+2]===0){d[i+1]=8;d[i+2]=2;}
  b.fc.putImageData(b.floorImage,0,0);return b.floor;
}
function bounds(element){const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}
function geometry(){
  const b=bounds(sharp),rowDevice=b.height*devicePixelRatio/192,s=settings(group,variant);
  return{...b,dpr:devicePixelRatio,zoom:visualViewport.scale,rowDevicePixels:rowDevice,
    fractionalRows:Math.abs(rowDevice-Math.round(rowDevice))>1e-6,
    sourceXScale:current?b.width*devicePixelRatio/current.sourceWidth:null,
    maskActive:s.mask&&!maskOff&&rowDevice>=2};
}
const blur=n=>n?`blur(${n}px)`:'none';
function draw(f,candidate='R',options={}){
  if(!f)throw Error('unknown frozen frame');
  const s=settings(group,candidate);current=f;variant=candidate;maskOff=group==='softening'||Boolean(options.maskOff);
  const b=decode(f),visible=options.visibleFrame?decode(options.visibleFrame):b;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(s.floor?floorCopy(visible):visible.raw,0,0,1024,768);
  if(options.visibleFrame)decode(f);
  Object.assign(sharp.style,{imageRendering:s.imageRendering,filter:blur(s.sharpBlur),opacity:'1',mixBlendMode:'normal',transform:'none'});
  Object.assign(glow.style,{display:s.glowOpacity?'block':'none',opacity:String(s.glowOpacity),filter:blur(s.glowBlur),mixBlendMode:s.glowBlend,imageRendering:'auto',transform:'none'});
  if(s.glowOpacity){
    const halo=options.glowFrame?decode(options.glowFrame):b;
    gc.imageSmoothingEnabled=false;gc.drawImage(halo.raw,0,0,1024,768);
    if(options.glowFrame)decode(f);
  }
  const g=geometry();Object.assign(mask.style,{display:g.maskActive?'block':'none',transform:'none',backgroundImage:maskImage});
  $('status').textContent=`${f.id} ${candidate} | source ${f.sourceWidth} × 192 | mask ${g.maskActive?'on':'off'}`;
  return g;
}
function equal(actual,want,what){if(actual!==want)throw Error(`${what}: ${actual} != ${want}`);}
function near(actual,want,what,tolerance=1e-6){if(!Number.isFinite(actual)||Math.abs(actual-want)>tolerance)throw Error(`${what}: ${actual} != ${want}`);}
function filterCheck(actual,want,what){
  if(!want)return equal(actual,'none',what);
  const match=/^blur\(([\d.]+)px\)$/.exec(actual);
  if(!match)throw Error(what+': '+actual);
  near(Number(match[1]),want,what);
}
function alignment(element,what){
  const actual=bounds(element),want=bounds(sharp);
  for(const key of ['x','y','width','height'])near(actual[key],want[key],what+' alignment mismatch '+key,.05);
  return actual;
}
function verifyMask(g){
  const cs=getComputedStyle(mask),expected=g.maskActive?'block':'none';equal(cs.display,expected,'computed mask display');
  equal(cs.transform,'none','computed mask transform');equal(cs.backgroundSize,'100% 100%','computed mask size');
  equal(cs.backgroundPosition,'0% 0%','computed mask position');equal(cs.pointerEvents,'none','computed mask pointer events');
  near(Number(cs.opacity),1,'computed mask element opacity');
  const match=/^url\(["']?(data:image\/svg\+xml,[^"']+)["']?\)$/.exec(cs.backgroundImage);
  if(!match)throw Error('computed mask source is not the cached SVG');
  const svg=new DOMParser().parseFromString(decodeURIComponent(match[1].split(',').slice(1).join(',')),'image/svg+xml');
  equal(svg.documentElement.getAttribute('viewBox'),'0 0 1 192','mask source viewBox');
  equal(svg.documentElement.getAttribute('preserveAspectRatio'),'none','mask source stretch');
  const rows=[...svg.querySelectorAll('rect')];equal(rows.length,192,'mask source row count');
  for(let i=0;i<192;i++){
    // Oracle fractions are independent of the SVG construction table.
    for(const [field,value] of Object.entries({x:0,y:i+3/4,width:1,height:1/4}))near(Number(rows[i].getAttribute(field)),value,`mask row ${i} ${field}`);
    equal(rows[i].getAttribute('fill'),'black',`mask row ${i} fill`);
    near(Number(rows[i].getAttribute('fill-opacity')),.12,`mask row ${i} opacity`);
  }
  const box=g.maskActive?alignment(mask,'mask overlay'):null;
  return{active:g.maskActive,sourceRows:192,sourceLastQuarter:true,computedBackgroundSize:cs.backgroundSize,bounds:box,
    projectedBands:box?rows.map(r=>({top:box.y+Number(r.getAttribute('y'))*box.height/192,bottom:box.y+(Number(r.getAttribute('y'))+Number(r.getAttribute('height')))*box.height/192})):[],
    suppressionThresholdDevicePixels:2};
}
function verifyStyles(){
  const s=settings(group,variant),main=getComputedStyle(sharp),halo=getComputedStyle(glow),g=geometry();
  filterCheck(main.filter,s.sharpBlur,'computed sharp filter');equal(main.imageRendering,s.imageRendering,'computed sharp scaling');
  near(Number(main.opacity),1,'computed sharp opacity');equal(main.mixBlendMode,'normal','computed sharp blend');equal(main.transform,'none','computed sharp transform');
  equal(halo.display,s.glowOpacity?'block':'none','computed glow display');near(Number(halo.opacity),s.glowOpacity,'computed glow opacity');
  filterCheck(halo.filter,s.glowBlur,'computed glow filter');equal(halo.mixBlendMode,s.glowBlend,'computed glow blend');
  equal(halo.pointerEvents,'none','computed glow pointer events');equal(halo.imageRendering,'auto','computed glow scaling');
  const glowBounds=s.glowOpacity?alignment(glow,'glow overlay'):null;equal(halo.transform,'none','computed glow transform');
  return{sharp:{filter:main.filter,opacity:main.opacity,blend:main.mixBlendMode,imageRendering:main.imageRendering,bounds:bounds(sharp)},
    glow:{filter:halo.filter,opacity:halo.opacity,blend:halo.mixBlendMode,display:halo.display,bounds:glowBounds},mask:verifyMask(g)};
}
async function verify(f=current){
  const b=buffer(f.sourceWidth),raw=b.rc.getImageData(0,0,f.sourceWidth,192).data,sourceSha=await hash(raw);
  if(sourceSha!==f.rgbaSha256)throw Error('pre-effect source frame mismatch');
  const vramSha=await hash(f.snapshot.vram);
  equal(vramSha,f.vramSha256,'expected frozen VRAM identity');
  const glyphProof=checkGlyphPixels(f,raw,font),s=settings(group,variant);
  const actualSha=await hash(ctx.getImageData(0,0,1024,768).data),expectedSha=await hash(enlarge(f,raw,s.floor));
  if(actualSha!==expectedSha)throw Error('visible sharp frame mismatch');
  let glowSha=null,expectedGlowSha=null;
  if(s.glowOpacity){
    glowSha=await hash(gc.getImageData(0,0,1024,768).data);
    expectedGlowSha=await hash(enlarge(f,raw,false));
    if(glowSha!==expectedGlowSha)throw Error('glow current frame mismatch');
  }
  const computed=verifyStyles(),g=geometry();if(Math.abs(g.width/g.height-4/3)>.001)throw Error('aspect ratio changed');
  return{sourceSha,visibleSharpSha:actualSha,glowBufferSha256:glowSha,glowExpectedBufferSha256:expectedGlowSha,glowSourceFrameId:s.glowOpacity?f.id:null,glowSourceRgbaSha256:s.glowOpacity?sourceSha:null,expectedVramSha256:vramSha,glyphProof,computed,geometry:g,sourceWidth:f.sourceWidth,sourceHeight:192,
    group,settings:{candidate:variant,floor:s.floor?[0,8,2]:null,sharpBlurCssPixels:s.sharpBlur,glowOpacity:s.glowOpacity,glowBlurCssPixels:s.glowBlur,glowBlend:s.glowBlend,maskOpacity:g.maskActive?0.12:0}};
}
for(const f of frames){
  const b=decode(f);if(await hash(b.image.data)!==f.rgbaSha256)throw Error('frozen source identity mismatch: '+f.id);
  const option=document.createElement('option');option.value=f.id;option.textContent=f.id;$('frame').append(option);
}
$('candidate').replaceChildren(...Object.keys(GROUPS[group]).map(name=>{const o=document.createElement('option');o.value=o.textContent=name;return o;}));
$('off').disabled=group==='softening';
const get=id=>frames.find(f=>f.id===id);
function choose(id,candidate,off=false){$('frame').value=id;$('candidate').value=candidate;$('width').value=get(id).consoleWidth;$('off').checked=group==='softening'||off;return draw(get(id),candidate,{maskOff:off});}
$('candidate').onchange=()=>choose(current.id,$('candidate').value,$('off').checked);
$('frame').onchange=()=>choose($('frame').value,variant,$('off').checked);
$('width').onchange=()=>choose(`${$('width').value}-${current.kind}`,variant,$('off').checked);
$('off').onchange=()=>choose(current.id,variant,$('off').checked);
$('raw').onclick=()=>{choose(current.id,'R');sharp.focus();};
sharp.onclick=()=>(matchMedia('(pointer:coarse)').matches?$('keyboard'):sharp).focus();
for(const el of [sharp,$('keyboard')])el.addEventListener('keydown',e=>{$('keys').textContent+=e.key;});
const ic=$('glcd').getContext('2d');ic.fillStyle='#6a8';ic.fillRect(0,0,256,128);ic.fillStyle='#123';ic.fillText('GLCD unchanged',15,30);
async function reject(name,action,expected){
  let error;try{await action();}catch(e){error=e.message;}
  if(!error?.startsWith(expected))throw Error(`negative control not detected: ${name}: ${error??'no refusal'}`);
  return{name,rejected:true,diagnostic:error};
}
window.model={group,candidates:Object.keys(GROUPS[group]),frames:frames.map(({snapshot,...f})=>f),choose,verify,verifyStyles,geometry,identity:fixture.identity,
  async staleControl(){
    const f=get('80-reverse'),old=get('80-prompt'),candidate=group==='legacy'?'G':'H';
    try{return{...await reject('stale-sharp',async()=>{draw(f,candidate,{visibleFrame:old});await verify(f);},'visible sharp frame mismatch'),expected:f.id,stale:old.id};}
    finally{choose(f.id,'R');}
  },
  async controls(){
    const f=get('80-reverse'),old=get('80-prompt'),halo=group==='legacy'?'G':'H',controls=[];
    const vramBefore=await hash(f.snapshot.vram),fontBefore=await hash(font);
    equal(vramBefore,f.vramSha256,'control frozen VRAM precondition');equal(fontBefore,fixture.identity.fontBytesSha256,'control pinned font precondition');
    try{
      controls.push(await reject('stale-glow',async()=>{draw(f,halo,{glowFrame:old});await verify(f);},'glow current frame mismatch'));
      if(group==='softening')controls.push(await reject('disabled-sharp-filter',async()=>{draw(f,'B1');sharp.style.filter='none';await verify(f);},'computed sharp filter'));
      controls.push(await reject('disabled-glow-filter',async()=>{draw(f,halo);glow.style.filter='none';await verify(f);},'computed glow filter'));
      controls.push(await reject('shifted-glow-overlay',async()=>{draw(f,halo);glow.style.transform='translateX(1px)';await verify(f);},'glow overlay alignment mismatch'));
      if(group==='legacy')controls.push(await reject('shifted-mask-overlay',async()=>{draw(f,'L');mask.style.transform='translateY(1px)';await verify(f);},'computed mask transform'));
      if(group==='legacy')controls.push(await reject('shifted-mask-band',async()=>{draw(f,'L');mask.style.backgroundImage=`url("data:image/svg+xml,${encodeURIComponent(maskSvg.replace('y="0.75"','y="0.5"'))}")`;await verify(f);},'mask row 0 y'));
      decode(f);
      for(const mutation of decodedMutations(f,new Uint8ClampedArray(buffer(f.sourceWidth).image.data))){
        controls.push(await reject(mutation.name,async()=>{
          buffer(f.sourceWidth).rc.putImageData(new ImageData(mutation.rgba,f.sourceWidth,192),0,0);
          checkGlyphPixels(f,buffer(f.sourceWidth).rc.getImageData(0,0,f.sourceWidth,192).data,font);
        },'decoded glyph pixel mismatch'));
      }
      equal(await hash(f.snapshot.vram),vramBefore,'control expected VRAM changed');equal(await hash(font),fontBefore,'control expected font changed');
      return{controls,expectedVramSha256:vramBefore,expectedFontSha256:fontBefore,expectedReferencesUnchanged:true,scope:'mock model only'};
    }finally{choose(f.id,'R');}
  },
  async benchmark(candidate,workload){
    const sequence=workload==='frozen'?[get('80-ted')]:['80-prompt','80-ted','80-reverse','80-demo'].map(get),js=[],cadence=[];let prior;
    for(let i=0;i<360;i++){
      const stamp=await new Promise(requestAnimationFrame);
      if(document.visibilityState!=='visible'||!document.hasFocus())throw Error('benchmark lost foreground focus');
      const start=performance.now();draw(sequence[i%sequence.length],candidate);const elapsed=performance.now()-start;
      if(i>=60){js.push(elapsed);cadence.push(stamp-prior);}prior=stamp;
    }
    const stats=a=>{const b=[...a].sort((a,b)=>a-b);return{median:b[Math.floor(b.length/2)],p95:b[Math.ceil(b.length*.95)-1],samples:a.length};};
    return{candidate,workload,warmup:60,samples:300,drawMs:stats(js),rafCallbackCadenceMs:stats(cadence),rawDrawMs:js,rawRafCallbackIntervalsMs:cadence,
      presentationTiming:'not measured by rAF callback cadence',foreground:{visibility:document.visibilityState,focus:document.hasFocus()},geometry:geometry(),sequence:sequence.map(f=>f.id),proof:await verify()};
  }
};
choose(group==='legacy'?'80-reading':'80-reverse','R');window.model.ready=true;
