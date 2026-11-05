import subprocess,pathlib,json
root='/Users/johnhardy/projects/tec-os-viewer'
out=pathlib.Path('/tmp/p6-vs1-rerun')
gates=[('VG8',600,['test/no-copy.test.mjs']),('VG3',600,['test/boards.test.mjs']),('VG4',600,['test/worked-example.test.mjs']),('VG2',700,['test/web-bundle.test.mjs','test/web-store.test.mjs','test/web-touch.test.mjs','test/page-boundaries.test.mjs','test/clean-build.test.mjs']),('VG5',700,['test/stored-cards.test.mjs']),('VG6',700,['test/single-page.test.mjs']),('full',700,None)]
for name,limit,files in gates:
 cmd=['node','--test','--test-concurrency=1',*files] if files else ['npm','test']
 guard=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit',str(limit),'--name','P6-'+name,'--log',str(out/'resources.jsonl'),'--',*cmd]
 with (out/(name+'.log')).open('w') as f:r=subprocess.run(guard,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps({'name':name,'cwd':root,'argv':guard,'exit':r.returncode})+'\n')
 print(name,r.returncode,flush=True)
 if r.returncode:break
