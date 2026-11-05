// Trial inputs, not defaults for the production Viewer. Legacy URL stays legacy.
const setting=(floor,imageRendering,sharpBlur=0,glowOpacity=0,glowBlur=0,mask=false)=>Object.freeze({floor,imageRendering,sharpBlur,glowOpacity,glowBlur,glowBlend:'screen',mask});
export const GROUPS=Object.freeze({
  legacy:Object.freeze({R:setting(false,'pixelated'),S:setting(false,'auto'),G:setting(true,'auto',0,.16,1.2),L:setting(true,'auto',0,.16,1.2,true)}),
  softening:Object.freeze({R:setting(false,'pixelated'),F:setting(true,'auto'),B1:setting(true,'auto',.25),B2:setting(true,'auto',.45),H:setting(true,'auto',.25,.22,1.6)})
});
export function settings(group,candidate){
  const value=GROUPS[group]?.[candidate];
  if(!value)throw Error(`unknown model candidate: ${group}/${candidate}`);
  return value;
}
export const maskRows=()=>Array.from({length:192},(_,row)=>({x:0,y:row+.75,width:1,height:.25,fill:'black',opacity:.12}));
