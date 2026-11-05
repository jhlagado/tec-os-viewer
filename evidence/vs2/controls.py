from run import *
import hashlib

def changed(path,data,name,limit,args,needle):
 p=ROOT/path;old=p.read_bytes() if p.exists() else None
 try:
  p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
  return run(name,limit,args,expected=1,needle=needle)
 finally:
  if old is None:p.unlink()
  else:p.write_bytes(old)

check=['node','tools/build.mjs']
p=json.loads((ROOT/'pins.json').read_text());p['files']['SAMPLE.ASM']='1'+p['files']['SAMPLE.ASM'][1:]
changed('pins.json',json.dumps(p).encode(),'VG9-hash',600,check,'not the pinned')
p=ROOT/'tec-os/README.md';changed('tec-os/README.md',p.read_bytes()+b'\nVS2 failing control\n','VG9-tracked',600,check,'changes to tracked files')
changed('tec-os/vs2-untracked.txt',b'untracked\n','VG9-untracked',600,check,'has untracked files')
pin=subprocess.check_output(['git','-C','tec-os','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
try:
 subprocess.run(['git','-C','tec-os','checkout','--detach','HEAD^'],cwd=ROOT,check=True)
 run('VG9-off-pin',600,check,expected=1,needle="not the viewer's pin")
finally:subprocess.run(['git','-C','tec-os','checkout','--detach',pin],cwd=ROOT,check=True)
p=ROOT/'tec-os/node_modules/atom-z80';absent=p.with_name('atom-z80.absent');p.rename(absent)
try:run('VG9-no-ATOM',600,['npm','run','build'],cwd=ROOT/'tec-os',expected=1,needle="Cannot find package 'atom-z80'")
finally:absent.rename(p)
s=(ROOT/'src/store.mjs').read_text().replace('throw e;','return null;',1)
changed('src/store.mjs',s.encode(),'VG12-null-read',700,['node','--test','--test-name-pattern=the real store\'s loadCard','test/web-store.test.mjs'],'Missing expected rejection')
r=json.loads((ROOT/'tec-os/dist/page.recipe.json').read_text())
def prune(x):
 if isinstance(x,list):return [prune(y) for y in x if not isinstance(y,dict) or y.get('name')!='SAMPLE.ASM']
 if isinstance(x,dict):return {k:prune(v) for k,v in x.items()}
 return x
changed('tec-os/dist/page.recipe.json',json.dumps(prune(r)).encode(),'VG10-no-sample',600,['node','--test','test/worked-example.test.mjs'],"TAS's build")
s=(ROOT/'test/worked-example.test.mjs').read_text().replace('`ted sample.asm ${line}\\r`','`ted sample.asm 128\\r`')
assert s!=(ROOT/'test/worked-example.test.mjs').read_text()
changed('test/worked-example.test.mjs',s.encode(),'VG10-old-line',600,['node','--test','test/worked-example.test.mjs'],'TED at the hello line')
s=(ROOT/'src/main.mjs').read_text().replace('prepareCard(state.card, state.display, state.width)','({ problem: null, note: null, changed: false })')
changed('src/main.mjs',s.encode(),'VG12-no-prepare',700,['node','--test','test/stored-cards.test.mjs'],"and not PICO.SVC's:")
changed('host/card.mjs',(ROOT/'tec-os/host/card.mjs').read_bytes(),'VG12-copy',700,['node','--test','test/no-copy.test.mjs'],'host/card.mjs is tec-os/host/card.mjs')
subprocess.run(['node','tools/build.mjs'],cwd=ROOT,env=ENV,check=True,stdout=subprocess.DEVNULL)
s=(ROOT/'test/single-page.test.mjs').read_text().replace('"./lib/page.mjs"',json.dumps(str(ROOT/'test/lib/page.mjs'))).replace('"./lib/root.mjs"',json.dumps(str(ROOT/'test/lib/root.mjs')))
s=s.replace('const html = readFileSync(resolve(ROOT, "dist/tec-os-viewer.html"));','let html = readFileSync(resolve(ROOT, "dist/tec-os-viewer.html"));\n  html = Buffer.from(html.toString().replace(/"roms\\/tecos\\.rom":"[^"]+",/, ""));')
(OUT/'VG12-missing-embed.test.mjs').write_text(s)
run('VG12-missing-embed',700,['node','--test',str(OUT/'VG12-missing-embed.test.mjs')],expected=1,needle='Timeout')
