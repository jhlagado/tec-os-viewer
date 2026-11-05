// One bounded visual batch. Run under the global 700 MB browser guard.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, fromTecos } from '../../test/lib/root.mjs';
const opts=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const viewport=Number(opts.viewport??600), dpr=Number(opts.dpr??1), frame=opts.frame??'80-reading';
const out=resolve(ROOT,'evidence/vs3-model'), name=`${viewport}-dpr${dpr}-${frame}`;
await mkdir(resolve(out,'screenshots'),{recursive:true});
await mkdir(resolve(out,'sheets'),{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const path=resolve(ROOT,'.'+new URL(req.url,'http://x').pathname);
  if(!path.startsWith(ROOT+sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const {chromium}=fromTecos('playwright');let browser;
try{
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:viewport,height:900},deviceScaleFactor:dpr});
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/phosphor-model/index.html`);
  await page.waitForFunction(()=>window.model?.ready);
  const variants=['R','S','G','L','L-off'];
  variants.sort((a,b)=>createHash('sha256').update(name+a).digest('hex').localeCompare(createHash('sha256').update(name+b).digest('hex')));
  const cells=[];
  for(let i=0;i<variants.length;i++){
    const variant=variants[i],label=String.fromCharCode(65+i);
    const proof=await page.evaluate(async({frame,variant})=>{
      window.model.choose(frame,variant==='L-off'?'L':variant,variant==='L-off');
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      return window.model.verify();
    },{frame,variant});
    assert.equal(proof.geometry.dpr,dpr);assert.equal(proof.geometry.zoom,1);
    const file=`${name}-${label}.png`;
    await page.locator('#surface').screenshot({path:resolve(out,'screenshots',file),animations:'disabled',scale:'device'});
    cells.push({label,variant,file,proof});
  }
  const stale=await page.evaluate(()=>window.model.staleControl());
  const glcd=await page.locator('#glcd').evaluate(c=>c.toDataURL());
  await page.evaluate(()=>{for(const width of [32,40,80])for(const candidate of ['R','S','G','L'])window.model.choose(`${width}-reading`,candidate);});
  assert.equal(await page.locator('#glcd').evaluate(c=>c.toDataURL()),glcd);
  assert.equal(await page.locator('#serial').textContent(),'SERIAL unchanged');
  await page.locator('#raw').click();assert.equal(await page.locator('#candidate').inputValue(),'R');
  await page.locator('#sharp').click();await page.keyboard.type('dir');assert.equal(await page.locator('#keys').textContent(),'dir');
  await page.setViewportSize({width:200,height:900});
  const tiny=await page.evaluate(()=>window.model.choose('80-reading','L'));
  assert.ok(tiny.rowDevicePixels<2 && !tiny.maskActive,'mask suppressed below two device pixels per row');
  assert.deepEqual(errors,[]);
  const result={name,toolsCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),sourceIdentity:await page.evaluate(()=>window.model.identity),headless:true,browserVersion:browser.version(),viewport:{width:viewport,height:900},dpr,frame,cells,staleControl:stale,
    modelChecks:{isolation:true,rawSwitch:true,keyboardFocus:true,scope:'mock model page only; production workflow proof pending'},tinyMaskFallback:tiny,reading:{expected:'0O 1Il []{} () ,.;: !? /\\ -_=+ SAMPLE.ASM 186',transcription:null,errorCount:null,joinedStrokes:null,washedOutReverse:null,resizeMoire:null,status:'awaiting blinded human review'}};
  await writeFile(resolve(out,name+'.json'),JSON.stringify(result,null,2)+'\n');
  const w=Math.ceil(cells[0].proof.geometry.width*dpr),h=Math.ceil(cells[0].proof.geometry.height*dpr),gap=24,labelHeight=30;
  const images=cells.map((c,i)=>{const x=(i%2)*(w+gap),y=Math.floor(i/2)*(h+labelHeight+gap);return `<text x="${x}" y="${y+22}" fill="white">${c.label}</text><image x="${x}" y="${y+labelHeight}" width="${w}" height="${h}" href="../screenshots/${c.file}"/>`;}).join('');
  await writeFile(resolve(out,'sheets',name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${2*w+gap}" height="${3*(h+labelHeight+gap)}"><rect width="100%" height="100%" fill="#16191a"/>${images}</svg>\n`);
  // Finish the browser phase before composing native pixels. Both phases stay
  // inside the caller's one guard, without retaining browser memory for the PNG.
  await browser.close();browser=undefined;
  const composition=JSON.parse(execFileSync('python3',[resolve(ROOT,'tools/phosphor-model/contact.py'),name],{cwd:ROOT,encoding:'utf8'}));
  console.log(JSON.stringify({name,cells:cells.map(c=>({label:c.label,variant:c.variant,geometry:c.proof.geometry})),stale,readingStatus:result.reading.status,composition}));
}finally{await browser?.close();server.close();}
