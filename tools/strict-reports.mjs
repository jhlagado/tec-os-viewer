// Strict-suite receipts for fresh, sequential per-file Node test invocations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fields=['tests','pass','fail','cancelled','skipped','todo'];
function checkCounts(c){
 for(const name of fields)assert.ok(Number.isSafeInteger(c[name])&&c[name]>=0,'invalid '+name);
 assert.ok(c.tests>0,'empty test report');
 assert.equal(c.pass,c.tests,'all tests must pass');
 for(const name of fields.slice(2))assert.equal(c[name],0,'strict '+name);
}
export function parseStrictTap(text,exitCode){
 assert.equal(exitCode,0,'test process exit');
 const counts={};
 for(const name of fields){
  const matches=[...text.matchAll(new RegExp('^# '+name+' (\\d+)$','gm'))];
  assert.equal(matches.length,1,'one complete '+name+' summary required');counts[name]=Number(matches[0][1]);
 }
 checkCounts(counts);return counts;
}
export function aggregateStrict(manifest,records){
 assert.ok(manifest.length>0,'empty file manifest');
 assert.equal(new Set(manifest.map(f=>f.path)).size,manifest.length,'duplicate manifest file');
 assert.equal(records.length,manifest.length,'missing or extra file report');
 const byName=new Map();
 for(const r of records){assert.ok(!byName.has(r.file),'duplicate file report');byName.set(r.file,r);}
 const totals=Object.fromEntries(fields.map(f=>[f,0]));
 for(const f of manifest){
  const r=byName.get(f.path);assert.ok(r,'missing manifest report');
  assert.equal(r.sourceSHA256,f.sha256,'file source changed');assert.equal(r.exitCode,0,'file exit');
  assert.equal(r.complete,true,'incomplete file report');checkCounts(r.counts);
  for(const name of fields)totals[name]+=r.counts[name];
 }
 return totals;
}
const discover=()=>readdirSync('test').filter(n=>n.endsWith('.test.mjs')).sort().map(n=>({path:'test/'+n,sha256:sha(readFileSync('test/'+n))}));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
function main([command,directory,file,rawPath,exit]){
 const dir=resolve(directory),manifestPath=join(dir,'manifest.json');
 assert.equal(process.env.STRICT,'1','strict environment required');
 if(command==='init'){
  mkdirSync(dir,{recursive:true});assert.equal(readdirSync(dir).length,0,'fresh report directory required');
  assert.equal(git('status','--porcelain'),'','clean source required');
  const files=discover();assert.ok(files.length,'no test files');
  save(manifestPath,{schema:'viewer-strict-files-v1',head:git('rev-parse','HEAD'),node:process.version,files});
  writeFileSync(join(dir,'files.nul'),files.map(f=>f.path+'\0').join(''));return;
 }
 const m=load(manifestPath);assert.equal(m.schema,'viewer-strict-files-v1');
 if(command==='case'){
  const f=m.files.find(f=>f.path===file);assert.ok(f,'file not in manifest');
  const resultPath=join(dir,basename(file)+'.case.json');assert.ok(!existsSync(resultPath),'duplicate case receipt');
  const raw=readFileSync(rawPath),r={file,sourceSHA256:sha(readFileSync(file)),exitCode:Number(exit),rawReportSHA256:sha(raw),complete:false};
  try{assert.equal(r.sourceSHA256,f.sha256,'test file changed');r.counts=parseStrictTap(raw.toString('utf8'),r.exitCode);r.complete=true;}
  catch(error){r.error=error.message;save(resultPath,r);throw error;}
  save(resultPath,r);console.log(JSON.stringify({file,...r.counts}));return;
 }
 assert.equal(command,'finish','unknown strict report command');
 assert.equal(git('rev-parse','HEAD'),m.head,'source head changed');assert.equal(git('status','--porcelain'),'','source tree changed');
 assert.deepEqual(discover(),m.files,'file manifest changed');
 const recordNames=readdirSync(dir).filter(n=>n.endsWith('.case.json'));
 assert.equal(recordNames.length,m.files.length,'missing or extra case receipts');
 const records=recordNames.map(n=>load(join(dir,n))),totals=aggregateStrict(m.files,records);
 for(const r of records){
  const raw=readFileSync(join(dir,basename(r.file)+'.tap'));
  assert.equal(sha(raw),r.rawReportSHA256,'raw report changed');assert.deepEqual(parseStrictTap(raw.toString('utf8'),r.exitCode),r.counts,'receipt counts differ');
 }
 const report={schema:'viewer-strict-suite-v1',head:m.head,complete:true,node:m.node,files:m.files,records,totals,manifestSHA256:sha(readFileSync(manifestPath)),method:'Every test entry file ran once in a fresh Node invocation, concurrency one, strict checks and original assertions unchanged.'};
 save(join(dir,'full-suite.json'),report);console.log(JSON.stringify({complete:true,files:m.files.length,...totals}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2));}catch(error){console.error('Strict receipt refused: '+error.message);process.exitCode=1;}
}
