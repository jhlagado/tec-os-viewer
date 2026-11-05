"""Core-only packet analysis and Q export, after the browser phase. No halo/mask work."""
import hashlib,json,pathlib,sys,time,resource
from PIL import Image,__version__
from edge_profiles import analyse
root=pathlib.Path(__file__).resolve().parents[2]
name=sys.argv[1];base=root/'evidence/vs3-model';out=base/'core-softening'
start=time.perf_counter()
record=json.loads((out/(name+'.json')).read_text())
assert record['group']=='core' and record['frame']=='80-reverse'
assert len(record['cells'])==4 and all(not c.get('synthetic') for c in record['cells'])
manifest=json.loads((base/'fixtures.json').read_text());frame=next(f for f in manifest['frames'] if f['id']==record['frame'])
raw=(base/'frames'/(frame['id']+'.rgba')).read_bytes()
old_path=base/'softening/softening-600-dpr1-80-reverse-effects.json'
old_bytes=old_path.read_bytes();old=json.loads(old_bytes)['sourceAnchoredEdgeProfiles']
images={c['variant']:Image.open(out/'screenshots'/c['file']).convert('RGB') for c in record['cells']}
assert set(images)=={'R','F','C75','C100'}
assert all(im.size==images['F'].size for im in images.values())
geometry=record['cells'][0]['proof']['geometry']
assert (geometry['width'],geometry['height'],geometry['dpr'])==(542,406.5,1)
qfile=name+'-Q.png'
evidence=analyse(root,frame,manifest['identity'],raw,images,geometry,
 candidate_names=('C75','C100'),anchor_reference=old['anchors'],control_export=out/'screenshots'/qfile)
assert evidence['detectorRules']==old['detectorRules'],'detector thresholds changed'
assert len(evidence['negativeControls'])==4
assert all(c['rejected'] for c in evidence['negativeControls'])
assert evidence['positiveCalibration']['detector']['observableProfiles']>0
q=next(c for c in evidence['negativeControls'] if c['name']=='affine-dimmer-offset')
assert q['transform']=={'kind':'uniform RGB affine','gain':.8,'offset':7,'quantized':True,'clipped':False}
with Image.open(out/'screenshots'/qfile) as image:
 assert image.size==images['F'].size
 assert hashlib.sha256(image.convert('RGB').tobytes()).hexdigest()==q['imagePixelsSha256']
full=any(c['observableProfiles']==4 for c in evidence['candidatesVersusF'].values())
result={'name':name,'group':'core','scope':'old-font four-profile diagnostic only; no readability or default acceptance',
 'sourceAnchoredEdgeProfiles':evidence,'anchorReference':{'file':str(old_path.relative_to(root)),
 'sha256':hashlib.sha256(old_bytes).hexdigest(),'evidenceCommit':'3ecab09','nativeCoordinatesUnchanged':True},
 'syntheticQ':{'variant':'Q','file':qfile,'synthetic':True,'construction':'captured F, exact existing affine-dimmer-offset control path',
 'gain':.8,'offset':7,'newNegativeControl':False,'imagePixelsSha256':q['imagePixelsSha256'],
 'pngSha256':hashlib.sha256((out/'screenshots'/qfile).read_bytes()).hexdigest()},
 'fullFourProfileDemonstration':full,'nextAction':'independent visual judgement required; no automatic acceptance' if full else
 'stop and report limitation; no automatic retry, escalation or mechanism switch',
 'pillowVersion':__version__,'seconds':time.perf_counter()-start,
 'peakMB':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024*1024 if sys.platform=='darwin' else 1024),2)}
(out/(name+'-effects.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
