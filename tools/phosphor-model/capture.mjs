// One bounded visual batch. Run only after source review and compute allocation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { GROUPS } from './settings.mjs';
import { ROOT,fromTecos } from '../../test/lib/root.mjs';
const opts=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const group=opts.group??'legacy';assert.ok(GROUPS[group],'unknown capture group');
const viewport=Number(opts.viewport??600),dpr=Number(opts.dpr??1),frame=opts.frame??(group==='softening'?'80-reverse':'80-reading');
if(group==='softening')assert.deepEqual({viewport,dpr,frame},{viewport:600,dpr:1,frame:'80-reverse'},'softening allocation is one bounded 600/DPR1/80-reverse cell');
const base=resolve(ROOT,'evidence/vs3-model'),out=group==='legacy'?base:resolve(base,'softening');
const name=(group==='legacy'?'':'softening-')+`${viewport}-dpr${dpr}-${frame}`;
const frozen=JSON.parse(await readFile(resolve(base,'fixtures.json'),'utf8'));
assert.equal(frozen.identity.baselineViewer,'76c4aa0');
assert.equal(frozen.identity.tecos,'fe2097f4bad3f7578aa41b8bce8aa571c451dbc7');
assert.deepEqual(frozen.identity.pins,JSON.parse(await readFile(resolve(ROOT,'pins.json'),'utf8')));
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD:tec-os'),frozen.identity.tecos);
assert.equal(git('-C','tec-os','rev-parse','HEAD'),frozen.identity.tecos);
assert.equal(process.env.TECOS_ROM_ASSEMBLER,'atom','explicit ATOM environment required');
await mkdir(resolve(out,'screenshots'),{recursive:true});await mkdir(resolve(out,'sheets'),{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const path=resolve(ROOT,'.'+new URL(req.url,'http://x').pathname);
  if(!path.startsWith(ROOT+sep)){res.writeHead(403).end();return;}
  try{const body=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const {chromium}=fromTecos('playwright');let browser,deadlineExpired=false;
const began=Date.now(),budget=110_000;
const deadline=setTimeout(()=>{deadlineExpired=true;console.error('model capture exceeded its 110-second work budget');browser?.close().catch(()=>{});},budget);
const left=()=>Math.max(1,budget-(Date.now()-began));
try{
  browser=await chromium.launch({timeout:Math.min(30_000,left())});
  const context=await browser.newContext({viewport:{width:viewport,height:900},deviceScaleFactor:dpr});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10_000);page.setDefaultNavigationTimeout(15_000);
  page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/tools/phosphor-model/index.html`;
  await page.goto(url+(group==='legacy'?'':'?group=softening'));await page.waitForFunction(()=>window.model?.ready);
  assert.equal(await page.evaluate(()=>window.model.group),group);
  const variants=group==='legacy'?['R','S','G','L','L-off']:Object.keys(GROUPS.softening);
  variants.sort((a,b)=>createHash('sha256').update(name+a).digest('hex').localeCompare(createHash('sha256').update(name+b).digest('hex')));
  const cells=[];
  for(let i=0;i<variants.length;i++){
    const variant=variants[i],label=String.fromCharCode(65+i);
    const proof=await page.evaluate(async({frame,variant})=>{
      window.model.choose(frame,variant==='L-off'?'L':variant,variant==='L-off');
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return window.model.verify();
    },{frame,variant});
    assert.equal(proof.geometry.dpr,dpr);assert.equal(proof.geometry.zoom,1);
    if(group==='softening')assert.equal(proof.geometry.maskActive,false,'softening cell must keep mask off');
    const file=`${name}-${label}.png`;
    await page.locator('#surface').screenshot({path:resolve(out,'screenshots',file),animations:'disabled',scale:'device',timeout:Math.min(10_000,left())});
    cells.push({label,variant,file,proof});
    if(group==='softening')await writeFile(resolve(out,name+'-progress.json'),JSON.stringify({status:'partial capture; not acceptance',name,group,frame,cells},null,2)+'\n');
  }
  const stale=await page.evaluate(()=>window.model.staleControl());
  const controls=group==='softening'?await page.evaluate(()=>window.model.controls()):null;
  const sourceIdentity=await page.evaluate(()=>window.model.identity);
  const glcd=await page.locator('#glcd').evaluate(c=>c.toDataURL());
  await page.evaluate(candidates=>{for(const width of [32,40,80])for(const candidate of candidates)window.model.choose(`${width}-reading`,candidate);},Object.keys(GROUPS[group]));
  assert.equal(await page.locator('#glcd').evaluate(c=>c.toDataURL()),glcd);
  assert.equal(await page.locator('#serial').textContent(),'SERIAL unchanged');
  await page.locator('#raw').click();assert.equal(await page.locator('#candidate').inputValue(),'R');
  await page.locator('#sharp').click();await page.keyboard.type('dir');assert.equal(await page.locator('#keys').textContent(),'dir');
  let legacyMaskProbe=null,tiny;
  if(group==='softening'){
    // Legacy controls only, in this same browser; never overwrite legacy evidence.
    await page.goto(url);await page.waitForFunction(()=>window.model?.ready);
    assert.equal(await page.evaluate(()=>window.model.group),'legacy');
    const proof=await page.evaluate(async()=>{window.model.choose('80-reverse','L');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return window.model.verify();});
    assert.equal(proof.geometry.maskActive,true);
    const on=`${name}-legacy-mask-on.png`,off=`${name}-legacy-mask-off.png`;
    await page.locator('#surface').screenshot({path:resolve(out,'screenshots',on),animations:'disabled',scale:'device',timeout:Math.min(10_000,left())});
    const offProof=await page.evaluate(async()=>{window.model.choose('80-reverse','L',true);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return window.model.verify();});
    assert.equal(offProof.geometry.maskActive,false);
    await page.locator('#surface').screenshot({path:resolve(out,'screenshots',off),animations:'disabled',scale:'device',timeout:Math.min(10_000,left())});
    legacyMaskProbe={scope:'legacy mask controls, not another complete comparison cell',on,off,proof,offProof,controls:await page.evaluate(()=>window.model.controls())};
  }
  await page.setViewportSize({width:200,height:900});
  tiny=await page.evaluate(()=>window.model.choose('80-reading','L'));
  assert.ok(tiny.rowDevicePixels<2&&!tiny.maskActive,'mask suppressed below two device pixels per row');
  assert.deepEqual(errors,[]);
  const result={name,group,toolsCommit:git('rev-parse','HEAD'),sourceIdentity,headless:true,browserVersion:browser.version(),viewport:{width:viewport,height:900},dpr,frame,cells,staleControl:stale,controls,legacyMaskProbe,
    modelChecks:{isolation:true,rawSwitch:true,keyboardFocus:true,scope:'mock model page only; production workflow proof pending'},tinyMaskFallback:tiny,
    reading:{expectedRows:frozen.frames.find(f=>f.id===frame).textRows,expected:frame.endsWith('-reading')?'0O 1Il []{} () ,.;: !? /\\ -_=+ SAMPLE.ASM 186':null,source:'frozen '+frame,transcription:null,errorCount:null,joinedStrokes:null,washedOutReverse:null,resizeMoire:null,status:'awaiting independent visual review'},
    estimate:{seconds:[15,30],peakCapMB:700,source:'prior 3.4-second/495 MB batch plus extra controls; estimate, not measurement'},workBudgetMs:budget};
  await writeFile(resolve(out,name+'.json'),JSON.stringify(result,null,2)+'\n');
  const w=Math.ceil(cells[0].proof.geometry.width*dpr),h=Math.ceil(cells[0].proof.geometry.height*dpr),gap=24,labelHeight=30;
  const images=cells.map((c,i)=>{const x=(i%2)*(w+gap),y=Math.floor(i/2)*(h+labelHeight+gap);return `<text x="${x}" y="${y+22}" fill="white">${c.label}</text><image x="${x}" y="${y+labelHeight}" width="${w}" height="${h}" href="../screenshots/${c.file}"/>`;}).join('');
  await writeFile(resolve(out,'sheets',name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${2*w+gap}" height="${3*(h+labelHeight+gap)}"><rect width="100%" height="100%" fill="#16191a"/>${images}</svg>\n`);
  await browser.close();browser=undefined;
  const composition=JSON.parse(execFileSync('python3',[resolve(ROOT,'tools/phosphor-model/contact.py'),name,group],{cwd:ROOT,encoding:'utf8',timeout:left()}));
  const effects=group==='softening'?JSON.parse(execFileSync('python3',[resolve(ROOT,'tools/phosphor-model/effects.py'),name],{cwd:ROOT,encoding:'utf8',timeout:left()})):null;
  if(deadlineExpired||Date.now()-began>budget)throw Error('model capture exceeded 110-second work budget');
  console.log(JSON.stringify({name,group,cells:cells.map(c=>({label:c.label,variant:c.variant,geometry:c.proof.geometry})),stale,controls,legacyMaskProbe,readingStatus:result.reading.status,composition,effects}));
}finally{clearTimeout(deadline);await browser?.close();server.close();if(deadlineExpired)throw Error('model capture exceeded 110-second work budget');}
