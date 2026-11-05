from run import *
import hashlib
tec=OUT/'clean-1/tec-os';pin=subprocess.check_output(['git','rev-parse','HEAD'],cwd=tec,text=True).strip()
try:
 subprocess.run(['git','checkout','--detach','78127ec63a2478c544af7fa96bfa73345f9df824'],cwd=tec,env=ENV,check=True)
 run('prior-ROM-build',600,['npm','run','build'],cwd=tec)
 old=(tec/'dist/tecos.rom').read_bytes();assert hashlib.sha256(old).hexdigest()=='8cad40923ce1c3c6079d3201a1a8cc294dbe501838ed54505ca12287672f8b9f'
 (OUT/'prior-ROM.sha256').write_text(hashlib.sha256(old).hexdigest()+'\n');(OUT/'prior.rom').write_bytes(old)
finally:subprocess.run(['git','checkout','--detach',pin],cwd=tec,env=ENV,check=True)
p=ROOT/'tec-os/dist/tecos.rom';current=p.read_bytes()
try:
 p.write_bytes(old);run('VG9-prior-ROM',600,['node','tools/build.mjs'],expected=1,needle='not the pinned')
finally:p.write_bytes(current)
p=ROOT/'test/lib/page.mjs';current=p.read_bytes()
s=current.decode();needle='rom: new Uint8Array(readFileSync(resolve(DIST, "roms/tecos.rom")))';assert needle in s
s=s.replace(needle,'rom: new Uint8Array(readFileSync('+json.dumps(str(OUT/'prior.rom'))+'))')
try:
 p.write_text(s);run('VG11-prior-palette',600,['node','--test','test/green-console.test.mjs'],expected=1,needle='VG11: register 7 selects light green (3) on black (1)')
finally:p.write_bytes(current)
run('quick-restored',600,['npm','run','quick'])
run('VG11-restored',600,['node','--test','test/green-console.test.mjs'])
