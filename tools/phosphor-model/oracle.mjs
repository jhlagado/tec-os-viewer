// Independent pixel expectations from the unchanged VRAM/font. No production decode calls.
export function parseFont(text){
  const glyphs=new Map();let rows;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||(line.startsWith('#')&&!/^[#.]{5}$/.test(line)))continue;
    const head=/^= ([0-9A-F]{2})$/.exec(line);
    if(head){rows=[];glyphs.set(parseInt(head[1],16),rows);continue;}
    if(!rows||!/^[#.]{5}$/.test(line))throw Error('oracle font row malformed');
    rows.push([...line].reduce((b,ch)=>b*2+(ch==='#'?1:0),0)<<3);
  }
  const out=[];
  for(let code=32;code<128;code++){
    const glyph=glyphs.get(code);if(glyph?.length!==8)throw Error('oracle font glyph missing');out.push(...glyph);
  }
  return Uint8Array.from(out);
}
export function probeGeometry(frame){
  const cols=frame.consoleWidth,r=frame.snapshot.registers;
  return {cols,names:cols===80?(r[2]&12)<<10:(r[2]&15)*1024,patterns:(r[4]&7)*2048,
    cell:cols===32?8:6,border:cols===80?16:cols===40?8:0};
}
export function checkGlyphPixels(frame,rgba,font){
  if(!frame.glyphProof)return {scope:'no known-cell probe in this scene'};
  const {cols,names,patterns,cell,border}=probeGeometry(frame),s=frame.snapshot;
  if(s.registers[7]!==0x31)throw Error('oracle palette differs from qualified green');
  const row=frame.glyphProof.row;
  for(let i=0;i<2;i++){
    const col=frame.glyphProof.columns[i],code=frame.glyphProof.codes[i];
    if(s.vram[names+row*cols+col]!==code)throw Error('oracle expected VRAM position mismatch');
    const reverse=(code&128)!==0,normal=code&127;
    for(let y=0;y<8;y++){
      const bits=font[(normal-32)*8+y]^(reverse?255:0);
      if(s.vram[patterns+code*8+y]!==bits)throw Error('oracle expected font pattern mismatch');
      for(let x=0;x<cell;x++){
        const at=((row*8+y)*frame.sourceWidth+border+col*cell+x)*4;
        const want=(bits&(128>>x))?[94,220,120,255]:[0,0,0,255];
        for(let c=0;c<4;c++)if(rgba[at+c]!==want[c])throw Error(`decoded glyph pixel mismatch: ${row}/${col}/${x}/${y}/${c}`);
      }
    }
  }
  return {row,columns:[...frame.glyphProof.columns],pixels:2*8*cell,reference:'unchanged frozen VRAM and pinned font'};
}
export function enlarge(frame,rgba,floor=false){
  const out=new Uint8ClampedArray(1024*768*4),sw=frame.sourceWidth;
  for(let y=0;y<768;y++)for(let x=0;x<1024;x++){
    const si=(Math.floor(y/4)*sw+Math.floor(x*sw/1024))*4,o=(y*1024+x)*4;
    out[o]=rgba[si];out[o+1]=rgba[si+1];out[o+2]=rgba[si+2];out[o+3]=rgba[si+3];
    if(floor&&rgba[si]===0&&rgba[si+1]===0&&rgba[si+2]===0){out[o+1]=8;out[o+2]=2;}
  }
  return out;
}
export function decodedMutations(frame,rgba){
  const {cell,border}=probeGeometry(frame),row=frame.glyphProof.row,cols=frame.glyphProof.columns;
  const pixel=new Uint8ClampedArray(rgba),placement=new Uint8ClampedArray(rgba);
  pixel[((row*8)*frame.sourceWidth+border+cols[0]*cell+1)*4]^=1;
  for(let y=0;y<8;y++)for(let x=0;x<cell;x++)for(let c=0;c<4;c++){
    const a=((row*8+y)*frame.sourceWidth+border+cols[0]*cell+x)*4+c;
    const b=((row*8+y)*frame.sourceWidth+border+cols[1]*cell+x)*4+c;
    placement[a]=rgba[b];placement[b]=rgba[a];
  }
  return [{name:'decoded-pixel',rgba:pixel},{name:'decoded-placement',rgba:placement}];
}
