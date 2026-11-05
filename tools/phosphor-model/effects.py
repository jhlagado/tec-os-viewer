"""Final native screenshot sanity checks, after Chromium has closed. No resizing."""
import hashlib,json,pathlib,resource,sys,time
from PIL import Image,ImageChops,ImageFilter,__version__
from edge_profiles import analyse
root=pathlib.Path(__file__).resolve().parents[2]
name=sys.argv[1]
out=root/'evidence/vs3-model/softening'
start=time.perf_counter()
record=json.loads((out/(name+'.json')).read_text())
assert record['group']=='softening' and record['frame']=='80-reverse'
manifest=json.loads((root/'evidence/vs3-model/fixtures.json').read_text())
frames=manifest['frames']
f=next(f for f in frames if f['id']==record['frame'])
raw=(root/'evidence/vs3-model/frames'/(f['id']+'.rgba')).read_bytes()
assert hashlib.sha256(raw).hexdigest()==f['rgbaSha256']
reference=Image.frombytes('RGBA',(f['sourceWidth'],192),raw).convert('RGB')
ink=ImageChops.lighter(ImageChops.lighter(*reference.split()[:2]),reference.split()[2]).point(lambda x:255 if x else 0)
far_ink=ink.filter(ImageFilter.MaxFilter(17))
halo_exclusion=ink.filter(ImageFilter.MaxFilter(3))
images={c['variant']:Image.open(out/'screenshots'/c['file']).convert('RGB') for c in record['cells']}
assert set(images)=={'R','F','B1','B2','H'}
size=images['R'].size
assert all(im.size==size for im in images.values())
g=record['cells'][0]['proof']['geometry']
sw,sh=g['width']*g['dpr'],g['height']*g['dpr']
def source_at(x,y):
 return min(reference.width-1,int((x+.5)*reference.width/sw)),min(191,int((y+.5)*192/sh))
def diff(a,b):
 changes=absolute=up=down=0
 for pa,pb in zip(a.getdata(),b.getdata()):
  ds=[int(x)-int(y) for x,y in zip(pa,pb)]
  changes+=any(ds);absolute+=sum(abs(d) for d in ds);up=max(up,*ds);down=min(down,*ds)
 return {'changedPixels':changes,'absoluteChannelDelta':absolute,'maxIncrease':up,'maxDecrease':down}
# Flat black source regions well away from text, filters and rounded corners.
floor_samples=0
for y in range(8,size[1]-8,8):
 for x in range(8,size[0]-8,8):
  sx,sy=source_at(x,y)
  if far_ink.getpixel((sx,sy)):continue
  assert images['R'].getpixel((x,y))==(0,0,0),'raw black reference not black'
  for variant in ['F','B1','B2','H']:
   actual=images[variant].getpixel((x,y))
   assert max(abs(a-b) for a,b in zip(actual,(0,8,2)))<=1,('final floor mismatch',variant,x,y,actual)
  floor_samples+=1
assert floor_samples>0,'no isolated floor sample'
blur={v:diff(images[v],images['F']) for v in ['B1','B2']}
for value in blur.values():
 value['rasterObservable']=bool(value['changedPixels'])
 value['interpretation']='Raster difference only, not a softness or reading ranking' if value['changedPixels'] else 'No raster-observable blur at this size; not a visual pass'
edge_profiles=analyse(root,f,manifest['identity'],raw,images,g)
for variant in ['B1','B2']:
 blur[variant]['edgeBroadeningObservableProfiles']=edge_profiles['candidatesVersusF'][variant]['observableProfiles']
 blur[variant]['edgeBroadeningInterpretation']=edge_profiles['candidatesVersusF'][variant]['interpretation']
halo=diff(images['H'],images['B1'])
assert halo['maxDecrease']>=-1,'screen halo unexpectedly darkens the B1 image'
outside=0
for y in range(8,size[1]-8):
 for x in range(8,size[0]-8):
  sx,sy=source_at(x,y)
  if halo_exclusion.getpixel((sx,sy)):continue
  h,b=images['H'].getpixel((x,y)),images['B1'].getpixel((x,y))
  outside+=any(a>v+1 for a,v in zip(h,b))
assert halo['changedPixels']>0 and outside>0,'no final halo beyond the source ink margin'
halo['changedPixelsOutsideOneSourcePixelInkMargin']=outside
probe=record['legacyMaskProbe']
on=Image.open(out/'screenshots'/probe['on']).convert('RGB')
off=Image.open(out/'screenshots'/probe['off']).convert('RGB')
assert on.size==off.size==size,'mask probe bounds changed'
mask=diff(on,off)
assert mask['maxIncrease']<=1,'black mask unexpectedly brightens the final screenshot'
assert mask['changedPixels']>0,'active legacy mask made no final screenshot difference'
result={'scope':'final screenshot effect sanity only, not legibility, production or timing acceptance',
 'group':'softening','name':name,'referenceRgbaSha256':f['rgbaSha256'],'floorSamples':floor_samples,
 'channelRoundingAllowance':1,'sourceInkMarginPixels':1,'floorIsolationMarginSourcePixels':8,
 'blurVersusFloor':blur,'sourceAnchoredEdgeProfiles':edge_profiles,'haloVersusB1':halo,'legacyMaskOnVersusOff':mask,
 'pillowVersion':__version__,'seconds':time.perf_counter()-start,
 'peakMB':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024*1024 if sys.platform=='darwin' else 1024),2)}
(out/(name+'-effects.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
