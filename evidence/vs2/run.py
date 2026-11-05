import os,subprocess,pathlib,json
ROOT=pathlib.Path('/Users/johnhardy/projects/tec-os-viewer');OUT=pathlib.Path('/tmp/p6-vs2');ENV={**os.environ,'TECOS_ROM_ASSEMBLER':'atom'}
def run(name,limit,args,cwd=ROOT,expected=0,needle=None):
 cmd=['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit',str(limit),'--name','P6-VS2-'+name,'--log',str(OUT/'resources.jsonl'),'--',*args]
 with (OUT/(name+'.log')).open('w') as f:r=subprocess.run(cmd,cwd=cwd,env=ENV,stdout=f,stderr=subprocess.STDOUT)
 text=(OUT/(name+'.log')).read_text();ok=r.returncode==expected and (needle is None or needle in text)
 with (OUT/'commands.jsonl').open('a') as f:f.write(json.dumps({'name':name,'cwd':str(cwd),'env':{'TECOS_ROM_ASSEMBLER':'atom'},'argv':cmd,'exit':r.returncode,'expectedExit':expected,'diagnostic':needle,'observed':ok})+'\n')
 print(name,r.returncode,ok,flush=True)
 if not ok:raise RuntimeError(name)
 return text
if __name__=='__main__':
 run('quick-tests',600,['npm','run','quick'])
 run('VG10',600,['node','--test','test/worked-example.test.mjs'])
 run('VG11',600,['node','--test','--test-concurrency=1','test/boards.test.mjs','test/green-console.test.mjs'])
 run('VG12',700,['npm','test'])
