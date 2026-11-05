import subprocess,pathlib,json,hashlib
out=pathlib.Path('/tmp/p6-vs1-rerun')
for n in [1,2]:
 root=out/f'clean-{n}'
 cmd=['git','clone','--recurse-submodules','https://github.com/jhlagado/tec-os-viewer.git',str(root)]
 with (out/f'clone-{n}.log').open('w') as f:subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['git','checkout','5c9940073f80ad4e90e075bc5e051a9b311ec047'],cwd=root,check=True)
 subprocess.run(['git','submodule','update','--init'],cwd=root,check=True)
 assert not any((root/p).exists() for p in ['node_modules','build','dist','.inputs','tec-os/node_modules','tec-os/build','tec-os/dist','tec-os/.inputs'])
 guard=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit','600','--name',f'P6-VG1-clean-{n}','--log',str(out/'resources.jsonl'),'--','npm','run','page']
 with (out/f'VG1-clean-{n}.log').open('w') as f:r=subprocess.run(guard,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps({'name':f'VG1-clean-{n}','cwd':str(root),'argv':guard,'exit':r.returncode})+'\n')
 print('VG1-clean',n,r.returncode,flush=True)
 if r.returncode:raise SystemExit(r.returncode)
 manifest={str(p.relative_to(root/'dist')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'dist').rglob('*')) if p.is_file()}
 (out/f'manifest-{n}.json').write_text(json.dumps(manifest,indent=2)+'\n')
a=json.loads((out/'manifest-1.json').read_text());b=json.loads((out/'manifest-2.json').read_text());assert a==b,(a,b)
print('VG1 byte-identical',len(a),'files',flush=True)
