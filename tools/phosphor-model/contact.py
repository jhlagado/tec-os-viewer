"""Compose a contact sheet with native PNG pixels, without a browser or resizing."""
import hashlib,json,pathlib,resource,time,sys
from PIL import Image,ImageDraw,ImageFont,__version__
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'evidence/vs3-model'
name=sys.argv[1] if len(sys.argv)>1 else '600-dpr1-80-reading'
start=time.perf_counter()
data=json.loads((out/(name+'.json')).read_text())
images=[Image.open(out/'screenshots'/c['file']).convert('RGBA') for c in data['cells']]
w,h=images[0].size
assert all(im.size==(w,h) for im in images)
gap,heading=24,30
sheet=Image.new('RGBA',(2*w+gap,3*(h+heading+gap)),(22,25,26,255))
draw=ImageDraw.Draw(sheet)
font=ImageFont.load_default(size=20)
inputs=[]
for i,(cell,im) in enumerate(zip(data['cells'],images)):
 x=(i%2)*(w+gap);y=(i//2)*(h+heading+gap)
 draw.text((x,y),cell['label'],fill='white',font=font)
 sheet.paste(im,(x,y+heading))
 assert sheet.crop((x,y+heading,x+w,y+heading+h)).tobytes()==im.tobytes()
 inputs.append({'label':cell['label'],'file':cell['file'],'sha256':hashlib.sha256((out/'screenshots'/cell['file']).read_bytes()).hexdigest(),'rect':[x,y+heading,w,h],'pixelCopyEqual':True})
path=out/'sheets'/(name+'.png')
sheet.save(path)
with Image.open(path) as reopened:
 for record,im in zip(inputs,images):
  x,y,w,h=record['rect']
  assert reopened.crop((x,y,x+w,y+h)).convert('RGBA').tobytes()==im.tobytes()
result={'tool':'Pillow','version':__version__,'inputs':inputs,'output':str(path.relative_to(out)),
 'outputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':list(sheet.size),'seconds':time.perf_counter()-start,
 'peakMB':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024*1024),2),
 'scope':'light offline native-pixel composition, no browser, no resizing; permitted after heavy-slot hold'}
(out/'contact-composition.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
