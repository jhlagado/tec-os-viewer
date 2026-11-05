from run import *
import hashlib
commit=subprocess.check_output(['git','rev-parse','d193838'],cwd=ROOT,text=True).strip()
(OUT/'measured-commit.txt').write_text(commit+'\n')
for n in [1,2]:
 root=OUT/f'clean-{n}'
 with (OUT/f'clone-{n}.log').open('w') as f:
  for cmd in [['git','clone','--recurse-submodules','--branch','vs2-green-console','https://github.com/jhlagado/tec-os-viewer.git',str(root)],['git','-C',str(root),'checkout','--detach',commit],['git','-C',str(root),'submodule','update','--init']]:
   subprocess.run(cmd,env=ENV,stdout=f,stderr=subprocess.STDOUT,check=True)
 assert not any((root/p).exists() for p in ['node_modules','build','dist','.inputs','tec-os/node_modules','tec-os/build','tec-os/dist','tec-os/.inputs'])
 run(f'VG9-clean-{n}',600,['npm','run','page'],cwd=root)
 manifest={str(p.relative_to(root/'dist')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'dist').rglob('*')) if p.is_file()}
 (OUT/f'manifest-{n}.json').write_text(json.dumps(manifest,indent=2)+'\n')
a=json.loads((OUT/'manifest-1.json').read_text());b=json.loads((OUT/'manifest-2.json').read_text());assert a==b
print('VG9 byte-identical',len(a),'files',flush=True)
