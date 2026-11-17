// Browser key mapping and the page's queue must preserve prompt editing.
// Exercise both command processors with the distributed ROM and starter card.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findVolume,parseContainer,volumePayload} from '../tec-os/tools/lib/container.mjs';
import {CpmVolume} from '../tec-os/tools/lib/cpmfs.mjs';
import {keyInput,pumpKeys} from '../src/keys.mjs';
import {card,power} from './lib/page.mjs';

const LIMIT=300_000_000;
const word=(m,at)=>m.read(at)|(m.read(at+1)<<8);
function run(m,done,what){
 m.runUntilChecked(()=>{pumpKeys(m);return done();},LIMIT,what);
}
function held(m){
 const first=m.sym(m.videoConsole()?'CINMX':'CINLP');
 const last=m.sym(m.videoConsole()?'CINME':'CINWE');
 return m.pending.length===0&&m.pc>=first&&m.pc<last;
}
function queue(m,key){
 const input=keyInput({key,ctrlKey:false,altKey:false,metaKey:false},m.videoConsole());
 assert.ok(input,`mapped browser key ${key}`);
 m.enqueueInput(input.text,input.via);
}
function lineState(m){
 const count=m.read(m.sym('LINCNT')),buffer=word(m,m.sym('PARAM'));
 return {count,pointer:word(m,m.sym('LINPTR')),
  bytes:Array.from({length:count},(_,i)=>m.read(buffer+2+i)),
  row:m.read(m.sym('VROW')),col:m.read(m.sym('VCOL'))};
}

for(const shell of [false,true])for(const board of ['serial','pico','glcd']){
 test(`${shell?'shell':'bare CCP'} ignores up/down arrows from the page on ${board}`,async()=>{
  const image=await card();
  const a=findVolume(parseContainer(image),'A');
  const files=new CpmVolume(volumePayload(image,a),a.g);
  files.write('ONE.TXT',Buffer.from('ARROW-CANARY\r\n'),{text:true});
  if(!shell){
   // Display preparation inserts the shell whenever its file is present.
   files.erase('SHELL.SVC');
   files.write('STARTUP.CMD',Buffer.from('\x1a','latin1'));
  }
  const m=power(image,board,40);
  run(m,()=>m.ready(),'the first prompt');
  assert.equal(Boolean(word(m,m.sym('SHOWN'))),shell,'the actual shell hook');
  assert.equal(m.read(m.sym('CONMOD')),{serial:0,pico:1,glcd:3}[board],'the actual console');
  for(const key of 'TYPE ')queue(m,key);
  run(m,()=>held(m),'the partial command');
  assert.equal(Buffer.from(lineState(m).bytes).toString('latin1'),'TYPE ');
  for(const key of ['ArrowUp','ArrowDown']){
   const before=lineState(m),mark=m.output.length;
   queue(m,key);
   run(m,()=>held(m),`ignored ${key}`);
   assert.deepEqual(lineState(m),before);
   assert.equal(m.text(mark),'','no arrow is echoed');
  }
  const mark=m.output.length;
  for(const key of 'ONE.TXT')queue(m,key);
  queue(m,'Enter');
  run(m,()=>m.ready()&&m.text(mark).includes('ARROW-CANARY')&&/A(:\S*)?>$/.test(m.text(mark)),'the completed command');
  assert.deepEqual(m.violations,[]);
 });
}
