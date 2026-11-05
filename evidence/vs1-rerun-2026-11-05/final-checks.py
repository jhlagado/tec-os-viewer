import pathlib,subprocess,json
out=pathlib.Path('/tmp/p6-vs1-rerun');root='/Users/johnhardy/projects/tec-os-viewer'
for name,cmd in [('VG3-no-card',['node','--test','--test-name-pattern=with no card','test/boards.test.mjs']),('quick',['npm','run','quick'])]:
 guard=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit','600','--name','P6-'+name,'--log',str(out/'resources.jsonl'),'--',*cmd]
 with (out/(name+'.log')).open('w') as f:r=subprocess.run(guard,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps({'name':name,'cwd':root,'argv':guard,'exit':r.returncode})+'\n')
 print(name,r.returncode,flush=True)
 if r.returncode:raise SystemExit(r.returncode)
