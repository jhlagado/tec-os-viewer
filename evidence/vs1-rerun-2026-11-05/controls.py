import subprocess,pathlib,json,re,shutil
root=pathlib.Path('/Users/johnhardy/projects/tec-os-viewer');out=pathlib.Path('/tmp/p6-vs1-rerun')
def run(name,limit,cmd,needle):
 guard=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit',str(limit),'--name','P6-'+name,'--log',str(out/'resources.jsonl'),'--',*cmd]
 with (out/(name+'.log')).open('w') as f:r=subprocess.run(guard,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 s=(out/(name+'.log')).read_text()
 ok=r.returncode!=0 and needle in s
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps({'name':name,'cwd':str(root),'argv':guard,'exit':r.returncode,'expectedFailure':True,'diagnostic':needle,'observed':ok})+'\n')
 print(name,r.returncode,ok,flush=True)
 if not ok:raise RuntimeError(name)
def changed(path,content,name,limit,cmd,needle):
 p=root/path;old=p.read_bytes() if p.exists() else None
 try:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content);run(name,limit,cmd,needle)
 finally:
  if old is None:p.unlink()
  else:p.write_bytes(old)
check=['node','tools/build.mjs']
p=json.loads((root/'pins.json').read_text());p['files']['SAMPLE.ASM']='0'+p['files']['SAMPLE.ASM'][1:]
changed('pins.json',json.dumps(p).encode(),'VG1-hash',600,check,'not the pinned')
p=root/'tec-os/README.md';changed('tec-os/README.md',p.read_bytes()+b'\nVS1 failing control\n','VG1-tracked',600,check,'changes to tracked files')
s=(root/'src/store.mjs').read_text();s=s.replace('throw e;','return null;',1)
changed('src/store.mjs',s.encode(),'VG2-null-read',700,['node','--test','--test-concurrency=1','--test-name-pattern=the real store\'s loadCard','test/web-store.test.mjs'],'Missing expected rejection')
p=root/'tec-os/dist/page.recipe.json';r=json.loads(p.read_text())
def prune(x):
 if isinstance(x,list):return [prune(y) for y in x if not isinstance(y,dict) or y.get('name')!='SAMPLE.ASM']
 if isinstance(x,dict):return {k:prune(v) for k,v in x.items()}
 return x
changed('tec-os/dist/page.recipe.json',json.dumps(prune(r)).encode(),'VG4-no-sample',600,['node','--test','test/worked-example.test.mjs'],"TAS's build")
s=(root/'src/main.mjs').read_text().replace('prepareCard(state.card, state.display, state.width)','({ problem: null, note: null, changed: false })')
assert s!=(root/'src/main.mjs').read_text()
changed('src/main.mjs',s.encode(),'VG5-no-prepare',700,['node','--test','test/stored-cards.test.mjs'],"and not PICO.SVC's:")
changed('host/card.mjs',(root/'tec-os/host/card.mjs').read_bytes(),'VG8-copy',600,['node','--test','test/no-copy.test.mjs'],'host/card.mjs is tec-os/host/card.mjs')
changed('tec-os/vs1-untracked-control.txt',b'untracked\n','review-untracked',600,check,'has untracked files')
changed('tec-os/dist/files/UNPINNED.COM',b'\xc9','review-extra-file',600,check,'is not named in pins.json')
pin=subprocess.check_output(['git','-C','tec-os','rev-parse','HEAD'],cwd=root,text=True).strip()
try:
 subprocess.run(['git','-C','tec-os','checkout','--detach','HEAD^'],cwd=root,check=True,stdout=subprocess.DEVNULL)
 run('review-off-pin',600,check,"not the viewer's pin")
finally:subprocess.run(['git','-C','tec-os','checkout','--detach',pin],cwd=root,check=True,stdout=subprocess.DEVNULL)
subprocess.run(['node','tools/build.mjs'],cwd=root,check=True,stdout=subprocess.DEVNULL)
changed('vs1-dirty-control.txt',b'dirty\n','review-dirty-label',600,['node','tools/page.mjs'],"the viewer's tree has changes")
s=(root/'test/single-page.test.mjs').read_text()
s=s.replace('"./lib/page.mjs"',json.dumps(str(root/'test/lib/page.mjs'))).replace('"./lib/root.mjs"',json.dumps(str(root/'test/lib/root.mjs')))
s=s.replace('const html = readFileSync(resolve(ROOT, "dist/tec-os-viewer.html"));','let html = readFileSync(resolve(ROOT, "dist/tec-os-viewer.html"));\n  html = Buffer.from(html.toString().replace(/"roms\\/tecos\\.rom":"[^"]+",/, ""));')
(out/'VG6-missing-embed.test.mjs').write_text(s)
run('VG6-missing-embed',700,['node','--test',str(out/'VG6-missing-embed.test.mjs')],'Timeout')
