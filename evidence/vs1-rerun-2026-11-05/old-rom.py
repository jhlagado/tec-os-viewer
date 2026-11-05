import subprocess,pathlib,hashlib,json
out=pathlib.Path('/tmp/p6-vs1-rerun');root=out/'clean-1';tec=root/'tec-os'
pin=subprocess.check_output(['git','rev-parse','HEAD'],cwd=tec,text=True).strip()
try:
 subprocess.run(['git','checkout','--detach','1b9c51f'],cwd=tec,check=True)
 cmd=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit','600','--name','P6-old-ROM-build','--log',str(out/'resources.jsonl'),'--','npm','run','build']
 with (out/'old-ROM-build.log').open('w') as f:r=subprocess.run(cmd,cwd=tec,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0
 rom=(tec/'dist/tecos.rom').read_bytes();assert hashlib.sha256(rom).hexdigest()=='1f9eb404c7146902c9a306b16081d7886b122ef1b5867babeb98e00e68094e1c'
 (out/'old-rom.sha256').write_text(hashlib.sha256(rom).hexdigest()+'\n')
finally:subprocess.run(['git','checkout','--detach',pin],cwd=tec,check=True)
main=pathlib.Path('/Users/johnhardy/projects/tec-os-viewer');p=main/'tec-os/dist/tecos.rom';old=p.read_bytes()
try:
 p.write_bytes(rom)
 cmd=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit','600','--name','P6-VG1-old-ROM','--log',str(out/'resources.jsonl'),'--','node','tools/build.mjs']
 with (out/'VG1-old-ROM.log').open('w') as f:r=subprocess.run(cmd,cwd=main,stdout=f,stderr=subprocess.STDOUT)
 s=(out/'VG1-old-ROM.log').read_text();assert r.returncode!=0 and '1f9eb404' in s and 'not the pinned' in s
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps({'name':'VG1-old-ROM','cwd':str(main),'argv':cmd,'exit':r.returncode,'expectedFailure':True,'observed':True})+'\n')
finally:p.write_bytes(old)
