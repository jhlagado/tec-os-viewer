"""Source-anchored native-pixel edge evidence. Importing this module performs no job."""
import hashlib,math

Y_WEIGHTS=(.2126,.7152,.0722)
EPS=1e-12

def _sha(data):return hashlib.sha256(data).hexdigest()

def _font(data):
 glyphs={};rows=None
 for line in data.decode('utf8').splitlines():
  if not line or (line.startswith('#') and not (len(line)==5 and set(line)<={'#','.'})):continue
  if line.startswith('= '):rows=[];glyphs[int(line[2:],16)]=rows;continue
  assert rows is not None and len(line)==5 and set(line)<={'#','.'},'edge oracle font row'
  rows.append(int(line.replace('#','1').replace('.','0'),2)<<3)
 assert all(len(glyphs.get(code,[]))==8 for code in range(32,128)),'edge oracle font glyph'
 return bytes(v for code in range(32,128) for v in glyphs[code])

def _metrics(values,offsets):
 low,high=min(values),max(values);contrast=high-low
 norm=[(v-low)/contrast for v in values] if contrast>EPS else [0.]*len(values)
 gradients=[abs(b-a) for a,b in zip(norm,norm[1:])]
 mass=sum(gradients);peak=max(gradients,default=0.)
 positions=[(a+b)/2 for a,b in zip(offsets,offsets[1:])]
 mean=sum(p*w for p,w in zip(positions,gradients))/mass if mass>EPS else 0.
 variance=sum(w*(p-mean)**2 for p,w in zip(positions,gradients))/mass if mass>EPS else 0.
 spacing=offsets[1]-offsets[0]
 return {'luminanceRange':[low,high],'contrast':contrast,'normalizedValues':norm,
  'gradientMass':mass,'normalizedGradientPeakPerCssPx':peak/spacing,
  'effectiveGradientWidthCssPx':mass/peak*spacing if peak>EPS else 0.,
  'gradientCentroidCssPx':mean,'gradientVarianceCssPxSquared':variance}

def _samples(image,anchor):
 rgb=[list(image.getpixel(tuple(p))) for p in anchor['nativePixelCoordinates']]
 luminance=[sum(w*v for w,v in zip(Y_WEIGHTS,p)) for p in rgb]
 return {'rgb':rgb,'green':[p[1] for p in rgb],'luminance':luminance,
  'metrics':_metrics(luminance,anchor['offsetsCssPx'])}

def _detect(baseline,candidate,anchor):
 x,y=baseline['luminance'],candidate['luminance'];mx=sum(x)/len(x);my=sum(y)/len(y)
 variance=sum((v-mx)**2 for v in x)
 gain=sum((a-mx)*(b-my) for a,b in zip(x,y))/variance if variance>EPS else 0.
 offset=my-gain*mx
 residual=math.sqrt(sum((b-(gain*a+offset))**2 for a,b in zip(x,y))/len(x))
 bm,cm=baseline['metrics'],candidate['metrics']
 contrast=min(bm['contrast'],cm['contrast'])
 tolerance=2/max(contrast,1.) # Two luminance levels for quantisation, not a visual threshold.
 rms=math.sqrt(sum((a-b)**2 for a,b in zip(bm['normalizedValues'],cm['normalizedValues']))/len(x))
 spacing=anchor['offsetsCssPx'][1]-anchor['offsetsCssPx'][0]
 width_delta=cm['effectiveGradientWidthCssPx']-bm['effectiveGradientWidthCssPx']
 peak_drop=bm['normalizedGradientPeakPerCssPx']-cm['normalizedGradientPeakPerCssPx']
 if contrast<16:reason='insufficient native profile contrast'
 elif x==y:reason='identical/blur-disabled profile'
 elif residual<=1.:reason='brightness-only affine fit within one luminance level'
 elif rms<=tolerance:reason='no normalized shape change above quantisation allowance'
 elif width_delta<=2*tolerance*spacing or peak_drop<=2*tolerance/spacing:reason='no resolved normalized gradient broadening'
 else:reason='resolved normalized edge-profile broadening'
 return {'observable':reason=='resolved normalized edge-profile broadening','reason':reason,
  'normalizedShapeRms':rms,'normalizedQuantisationAllowance':tolerance,
  'affineFit':{'gain':gain,'offset':offset,'residualRmsLuminanceLevels':residual},
  'effectiveWidthIncreaseCssPx':width_delta,'widthResolutionCssPx':2*tolerance*spacing,
  'normalizedGradientPeakDecreasePerCssPx':peak_drop,'peakResolutionPerCssPx':2*tolerance/spacing,
  'gradientVarianceChangeCssPxSquared':cm['gradientVarianceCssPxSquared']-bm['gradientVarianceCssPxSquared']}

def _anchors(frame,raw,font,geometry,image_size):
 assert frame['consoleWidth']==80 and frame['sourceWidth']==512 and frame['sourceHeight']==192,'edge profile allocation is 80 columns'
 r,v=frame['snapshot']['registers'],frame['snapshot']['vram'];assert r[7]==0x31
 names=(r[2]&12)<<10;patterns=(r[4]&7)*2048;row=frame['glyphProof']['row']
 sx=geometry['width']*geometry['dpr']/512;sy=geometry['height']*geometry['dpr']/192
 def bit(x,y):
  if not (0<=x<512 and 0<=y<192):return None
  at=(y*512+x)*4
  return int(any(raw[at:at+3]))
 anchors=[]
 for col,code in zip(frame['glyphProof']['columns'],frame['glyphProof']['codes']):
  assert v[names+row*80+col]==code,'edge source VRAM position'
  glyph=[b^(255 if code&128 else 0) for b in font[((code&127)-32)*8:((code&127)-32)*8+8]]
  assert v[patterns+code*8:patterns+code*8+8]==glyph,'edge source font pattern'
  ox,oy=16+col*6,row*8
  for gy in range(8):
   for gx in range(6):
    on=bool(glyph[gy]&(128>>gx));at=((oy+gy)*512+ox+gx)*4
    assert list(raw[at:at+4])==([94,220,120,255] if on else [0,0,0,255]),'edge source RGBA/font mismatch'
  for axis in ['x','y']:
   choices=[]
   for gy in range(8):
    for gx in range(6):
     if (axis=='x' and gx==0) or (axis=='y' and gy==0):continue
     ax,ay=ox+gx,oy+gy;dx,dy=(1,0) if axis=='x' else (0,1)
     before,after=bit(ax-dx,ay-dy),bit(ax,ay)
     if before==after:continue
     negative=positive=0
     while bit(ax-dx*(negative+1),ay-dy*(negative+1))==before:negative+=1
     while bit(ax+dx*positive,ay+dy*positive)==after:positive+=1
     scale=sx if axis=='x' else sy
     choices.append(((min(negative,positive)*scale,(negative+positive)*scale,-gy,-gx),ax,ay,before,after,negative,positive))
   assert choices,'no anchored font edge'
   _,ax,ay,before,after,negative,positive=max(choices)
   edge=ax*sx if axis=='x' else ay*sy
   cross=int((ay+.5)*sy) if axis=='x' else int((ax+.5)*sx)
   values=range(math.floor(edge)-4,math.floor(edge)+5)
   points=[[p,cross] if axis=='x' else [cross,p] for p in values]
   assert all(0<=x<image_size[0] and 0<=y<image_size[1] for x,y in points)
   anchors.append({'id':('reverse' if code&128 else 'normal')+'-'+axis,
    'axis':axis,'profileDirection':'horizontal across a vertical edge' if axis=='x' else 'vertical across a horizontal edge',
    'source':{'row':row,'column':col,'code':code,'glyphRows':glyph,'boundaryPixel':[ax,ay],
     'negativeBit':before,'positiveBit':after,'negativeRunSourcePx':negative,'positiveRunSourcePx':positive},
    'nativePixelCoordinates':points,'offsetsCssPx':[(p+.5-edge)/geometry['dpr'] for p in values],
    'captureBoundsCss':{k:geometry[k] for k in ['x','y','width','height']},
    'mapping':'native screenshot pixel centres relative to unchanged CSS clip; no sample interpolation or resizing'})
 return anchors

def analyse(root,frame,identity,raw,images,geometry):
 from PIL import ImageFilter
 font_source=(root/identity['fontSource']).read_bytes();assert _sha(font_source)==identity['fontSourceSha256']
 font=_font(font_source);assert _sha(font)==identity['fontBytesSha256']
 vram_before=_sha(bytes(frame['snapshot']['vram']));assert vram_before==frame['vramSha256']
 assert _sha(raw)==frame['rgbaSha256']
 anchors=_anchors(frame,raw,font,geometry,images['F'].size)
 profiles={name:{a['id']:_samples(image,a) for a in anchors} for name,image in images.items()}
 def compare(samples):
  result=[{'anchor':a['id'],**_detect(profiles['F'][a['id']],samples[a['id']],a)} for a in anchors]
  count=sum(p['observable'] for p in result)
  return {'profiles':result,'observableProfiles':count,'allFourProfilesObservable':count==4,
   'interpretation':'resolved at all four source profiles; not a visual pass' if count==4 else
     'partial broadening evidence at listed profiles only; not a visual pass' if count else
     'no observable edge broadening at these native samples; not a visual pass'}
 candidates={name:compare(profiles[name]) for name in ['B1','B2']}
 controls=[]
 control_images=[('identical-reference',images['F']),('blur-disabled',images['F'].copy())]
 for name,gain,offset in [('affine-dimmer-offset',.8,7),('affine-brighter-offset',1.1,2)]:
  assert all(0<=gain*lo+offset and gain*hi+offset<=255 for lo,hi in images['F'].getextrema()),'affine control would clip'
  control_images.append((name,images['F'].point(lambda v:int(round(gain*v+offset)))))
 for name,image in control_images:
  samples={a['id']:_samples(image,a) for a in anchors};detected=compare(samples)
  assert detected['observableProfiles']==0,('edge detector accepted a non-blur control',name)
  controls.append({'name':name,'rejected':True,'imagePixelsSha256':_sha(image.tobytes()),'samples':samples,'detector':detected,
   'construction':'F pixels; blur-disabled is the F/no-filter raster' if name in ['identical-reference','blur-disabled'] else 'uniform RGB gain/offset with quantisation, no clipping, no blur'})
 calibration=images['F'].filter(ImageFilter.GaussianBlur(geometry['dpr']))
 calibration_samples={a['id']:_samples(calibration,a) for a in anchors};calibration_result=compare(calibration_samples)
 assert calibration_result['observableProfiles']>0,'edge detector failed its image-space blur sensitivity calibration'
 assert _sha(bytes(frame['snapshot']['vram']))==vram_before and _sha(font)==identity['fontBytesSha256']
 return {'scope':'four native source-anchored profiles, not a whole-font or reading acceptance',
  'expectedVramSha256':vram_before,'expectedFontSha256':_sha(font),'expectedRgbaSha256':_sha(raw),'expectedReferencesUnchanged':True,
  'luminanceWeights':list(Y_WEIGHTS),'anchors':anchors,'samples':profiles,'candidatesVersusF':candidates,
  'negativeControls':controls,'positiveCalibration':{'construction':'F image with Pillow Gaussian radius one CSS pixel, not a browser candidate',
   'samples':calibration_samples,'detector':calibration_result,'imagePixelsSha256':_sha(calibration.tobytes())},
  'detectorRules':{'minimumContrastLuminanceLevels':16,'affineResidualAllowanceLuminanceLevels':1,
   'normalizedShapeAllowance':'two luminance levels divided by lower profile contrast',
   'broadening':'non-affine shape change plus increased effective gradient width and reduced normalized peak',
   'limitedResolution':'absence of resolved broadening is recorded, never turned into a visual pass'}}
