// Observe each arrow separately through real browser key events and the
// running page's screen, then complete and execute the partial command.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {ROOT,fromTecos} from './lib/root.mjs';
import {serve} from './lib/serve.mjs';

test('browser arrows preserve empty history and recall, edit and execute stored commands', {timeout:120_000}, async t=>{
 execFileSync(process.execPath,[resolve(ROOT,'tools/build.mjs')],{stdio:'pipe'});
 const server=await serve();
 t.after(()=>server.close());
 const browser=await fromTecos('playwright').chromium.launch();
 t.after(()=>browser.close());
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>globalThis.tecos?.screen().includes('A:SYSTEM>'),null,{timeout:60_000});
 await page.focus('#tms');
 await page.keyboard.type('TY');
 await page.waitForFunction(()=>globalThis.tecos.screen().includes('A:SYSTEM>TY'));
 // The following character witnesses that the earlier arrow left the FIFO.
 // Checking after each one prevents opposite cursor moves cancelling out.
 for(const [arrow,next,text] of [['ArrowUp','P','A:SYSTEM>TYP'],['ArrowDown','E','A:SYSTEM>TYPE']]){
  await page.keyboard.press(arrow);
  await page.keyboard.type(next);
  await page.waitForFunction(expected=>globalThis.tecos.screen().includes(expected),text);
 }
 await page.keyboard.type(' STARTUP.CMD');
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>{
  const lines=globalThis.tecos.screen();
  return lines.includes('A:SYSTEM>TYPE STARTUP.CMD')&&lines.includes('SHELL.SVC')&&lines.includes('CON PICO 40')&&lines.includes('A:SYSTEM>');
 },null,{timeout:60_000});
 // Use the active last line: earlier command echoes remain on the screen.
 const active=expected=>globalThis.tecos.screen().filter(line=>line.trim()).at(-1)===expected;
 for(const text of ['ECHO FIRST','ECHO SECOND']){
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForFunction(active,'A:SYSTEM>');
 }
 await page.keyboard.type('partial');
 await page.waitForFunction(active,'A:SYSTEM>partial');
 for(const [key,text] of [['ArrowUp','ECHO SECOND'],['ArrowUp','ECHO FIRST'],['ArrowDown','ECHO SECOND'],['ArrowDown',''],['ArrowUp','ECHO SECOND']]){
  await page.keyboard.press(key);
  await page.waitForFunction(active,'A:SYSTEM>'+text);
 }
 for(let i=0;i<6;i++)await page.keyboard.press('Backspace');
 await page.keyboard.type('THIRD');
 await page.waitForFunction(active,'A:SYSTEM>ECHO THIRD');
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>{
  const lines=globalThis.tecos.screen();
  return lines.includes('THIRD')&&lines.filter(line=>line.trim()).at(-1)==='A:SYSTEM>';
 });
 assert.deepEqual(errors,[]);
});
