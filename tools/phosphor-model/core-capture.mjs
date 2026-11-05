// Separate four-browser-capture diagnostic. No halo, mask, production or timing qualification.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {GROUPS} from './settings.mjs';
import {ROOT,fromTecos} from '../../test/lib/root.mjs';
export async function captureCore(opts){
  const viewport=Number(opts.viewport??600),dpr=Number(opts.dpr??1),frame=opts.frame??'80-reverse';
  assert.deepEqual({viewport,dpr,frame},{viewport:600,dpr:1,frame:'80-reverse'});
  assert.equal(process.env.TECOS_ROM_ASSEMBLER,'atom');
  const base=resolve(ROOT,'evidence/vs3-model'),out=resolve(base,'core-softening'),name='core-600-dpr1-80-reverse';
  const frozen=JSON.parse(await readFile(resolve(base,'fixtures.json'),'utf8')),f=frozen.frames.find(f=>f.id===frame);
  const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
  assert.equal(frozen.identity.baselineViewer,'76c4aa0');assert.equal(frozen.identity.tecos,'fe2097f4bad3f7578aa41b8bce8aa571c451dbc7');
  assert.equal(git('rev-parse','HEAD:tec-os'),frozen.identity.tecos);assert.equal(git('-C','tec-os','rev-parse','HEAD'),frozen.identity.tecos);
  assert.deepEqual(frozen.identity.pins,JSON.parse(await readFile(resolve(ROOT,'pins.json'),'utf8')));
  const accepted=JSON.parse(await readFile(resolve(ROOT,'tools/phosphor-model/core-reference.json'),'utf8'));
  const referenceBytes=await readFile(resolve(ROOT,accepted.effectsPath));
  assert.equal(createHash('sha256').update(referenceBytes).digest('hex'),accepted.effectsSha256,'immutable 3ecab09 reference changed');
  const reference=JSON.parse(referenceBytes).sourceAnchoredEdgeProfiles;
  assert.equal(f.rgbaSha256,reference.expectedRgbaSha256);assert.equal(f.vramSha256,reference.expectedVramSha256);
  assert.equal(frozen.identity.fontBytesSha256,reference.expectedFontSha256);
  // Exclusive ownership: even an empty or failed packet directory is retained.
  await mkdir(out);
  let record={name,group:'core',frame,status:'incomplete',phase:'preparing',sourceIdentity:frozen.identity};
  const persist=async()=>{const temp=resolve(out,name+'.json.tmp');await writeFile(temp,JSON.stringify(record,null,2)+'\n');await rename(temp,resolve(out,name+'.json'));};
  let phase='preparing',server,browser,timer,expired=false;
  const started=Date.now(),budget=110_000,left=()=>Math.max(1,budget-(Date.now()-started));
  try{
  await persist();await mkdir(resolve(out,'screenshots'));await mkdir(resolve(out,'sheets'));
  const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
  server=createServer(async(req,res)=>{
    const path=resolve(ROOT,'.'+new URL(req.url,'http://x').pathname);
    if(!path.startsWith(ROOT+sep)){res.writeHead(403).end();return;}
    try{const body=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const {chromium}=fromTecos('playwright');
  timer=setTimeout(()=>{expired=true;console.error('110-second cooperative browser-close request');browser?.close().catch(()=>{});},budget);
  function inactive(proof){
    assert.equal(proof.group,'core');assert.equal(proof.geometry.maskActive,false);
    assert.equal(proof.settings.glowOpacity,0);assert.equal(proof.settings.maskOpacity,0);assert.equal(proof.glowBufferSha256,null);
    assert.equal(proof.computed.glow.display,'none');assert.equal(proof.computed.mask.active,false);
    assert.equal(proof.sourceSha,f.rgbaSha256);assert.equal(proof.expectedVramSha256,f.vramSha256);
  }
  function restored(routine){
    const {effect,raw}=routine.restorationProof;inactive(effect);inactive(raw);
    assert.equal(effect.settings.candidate,'C100');assert.equal(effect.computed.sharp.filter,'blur(1px)');assert.equal(raw.settings.candidate,'R');
  }
    phase='browser';browser=await chromium.launch({timeout:Math.min(30_000,left())});
    const context=await browser.newContext({viewport:{width:600,height:900},deviceScaleFactor:1});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(10_000);page.setDefaultNavigationTimeout(15_000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/phosphor-model/index.html?group=core`);
    await page.waitForFunction(()=>window.model?.ready);assert.equal(await page.evaluate(()=>window.model.group),'core');
    const variants=Object.keys(GROUPS.core).sort((a,b)=>createHash('sha256').update(name+a).digest('hex').localeCompare(createHash('sha256').update(name+b).digest('hex'))),cells=[];
    for(const [i,variant] of variants.entries()){
      const proof=await page.evaluate(async({frame,variant})=>{window.model.choose(frame,variant);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return window.model.verify();},{frame,variant});
      inactive(proof);assert.equal(proof.geometry.dpr,1);assert.equal(proof.geometry.zoom,1);
      assert.deepEqual(Object.fromEntries(Object.keys(accepted.geometry).map(k=>[k,proof.geometry[k]])),accepted.geometry,'historical raster phase changed');
      if(cells.length)for(const key of ['x','y','width','height'])assert.ok(Math.abs(proof.geometry[key]-cells[0].proof.geometry[key])<.05);
      const label=String.fromCharCode(65+i),file=`${name}-${label}.png`;
      await page.locator('#surface').screenshot({path:resolve(out,'screenshots',file),animations:'disabled',scale:'device',timeout:Math.min(10_000,left())});
      cells.push({label,variant,file,synthetic:false,sourceKind:'browser capture',proof});
      await writeFile(resolve(out,name+'-progress.json'),JSON.stringify({status:'partial, not acceptance',group:'core',cells},null,2)+'\n');
    }
    assert.equal(cells.length,4);
    const stale=await page.evaluate(()=>window.model.staleControl());restored(stale);
    const mutations=await page.evaluate(()=>window.model.controls());restored(mutations);
    const cases=[stale,...mutations.controls];
    assert.deepEqual(cases.map(c=>c.name).sort(),['stale-main','disabled-main-filter','decoded-pixel','decoded-placement'].sort());
    assert.ok(cases.every(c=>c.rejected));assert.equal(mutations.expectedReferencesUnchanged,true);
    assert.equal(mutations.expectedVramSha256,f.vramSha256);assert.equal(mutations.expectedFontSha256,frozen.identity.fontBytesSha256);
    const glcd=await page.locator('#glcd').evaluate(c=>c.toDataURL());
    await page.locator('#raw').click();assert.equal(await page.locator('#candidate').inputValue(),'R');
    await page.locator('#sharp').click();await page.keyboard.type('dir');assert.equal(await page.locator('#keys').textContent(),'dir');
    assert.equal(await page.locator('#glcd').evaluate(c=>c.toDataURL()),glcd);assert.equal(await page.locator('#serial').textContent(),'SERIAL unchanged');
    assert.deepEqual(errors,[]);
    record={name,group:'core',frame,toolsCommit:git('rev-parse','HEAD'),sourceIdentity:frozen.identity,configuredCandidates:GROUPS.core,
      browserVersion:browser.version(),headless:true,viewport:{width:600,height:900},dpr:1,cells,browserCaptureCount:4,
      browserRefusals:{count:4,cases,routines:{staleMain:stale,mutations}},
      modelChecks:{rawSwitch:true,keyboardFocus:true,isolationSentinels:true,scope:'mock model only; production/touch qualification later'},
      reading:{expectedRows:f.textRows,status:'independent visual judgement pending; no reading pass'},
      estimate:{seconds:[5,15],capMB:700,measured:false,basis:'prior diagnostic 5.0 seconds / 599 MB'},
      browserCloseRequestAfterMs:budget,deadline:'cooperative, not proved hard termination; monitor and clean up at two-minute boundary',
      requiresTwoMinuteMonitoring:true,status:'incomplete',phase:'offline analysis pending',reference:accepted};
    await persist();phase='offline analysis';
    await browser.close();browser=undefined;
    const effects=JSON.parse(execFileSync('python3',[resolve(ROOT,'tools/phosphor-model/core_effects.py'),name],{cwd:ROOT,encoding:'utf8',timeout:left()}));
    record.comparisonEntries=[...cells,{label:'E',...effects.syntheticQ,sourceKind:'synthetic, not browser capture'}];
    record.syntheticEntryCount=1;record.comparisonEntryCount=5;record.phase='contact composition pending';
    record.effectsFile=name+'-effects.json';record.nextAction=effects.nextAction;
    await persist();phase='contact composition';
    const w=Math.ceil(cells[0].proof.geometry.width),h=Math.ceil(cells[0].proof.geometry.height),gap=24,heading=30;
    const tiles=record.comparisonEntries.map((c,i)=>{const x=i%2*(w+gap),y=Math.floor(i/2)*(h+heading+gap);return `<text x="${x}" y="${y+22}" fill="white">${c.label}${c.synthetic?' (synthetic)':''}</text><image x="${x}" y="${y+heading}" width="${w}" height="${h}" href="../screenshots/${c.file}"/>`;}).join('');
    await writeFile(resolve(out,'sheets',name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${2*w+gap}" height="${3*(h+heading+gap)}"><rect width="100%" height="100%" fill="#16191a"/>${tiles}</svg>\n`);
    const composition=JSON.parse(execFileSync('python3',[resolve(ROOT,'tools/phosphor-model/contact.py'),name,'core'],{cwd:ROOT,encoding:'utf8',timeout:left()}));
    phase='cleanup';await new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()));server=undefined;
    if(expired||Date.now()-started>budget)throw Error('cooperative core work budget exceeded');
    clearTimeout(timer);record.status='diagnostic recorded; no presentation acceptance';record.phase='complete';record.workElapsedMs=Date.now()-started;record.compositionFile=name+'-composition.json';await persist();
    console.log(JSON.stringify({name,browserCaptureCount:4,syntheticEntryCount:1,browserRefusalCount:4,effects,composition}));
  }catch(error){
    record.status='failed/incomplete';record.phase=phase;record.failure={message:error.message,cooperativeDeadlineRequested:expired};
    try{await persist();}catch(writeError){console.error('Could not persist incomplete status:',writeError.message);}
    throw error;
  }finally{clearTimeout(timer);await browser?.close();if(server)await new Promise(ok=>server.close(()=>ok()));}
}
