/** ADR-061(c) FLIP — Connector OS เป็นเจ้าของ geometry corner joints */
import { describe, it, expect, vi } from 'vitest';
import type { Cabinet, CabinetPanel } from '../../../types/Cabinet';
import { generateMinifixDrillMap } from '../generateDrillMap';

const T=18,W=600,H=720,D=560;
function panel(o:{id:string;role:CabinetPanel['role'];w:number;h:number;position:[number,number,number]}):CabinetPanel{
  return{id:o.id,role:o.role,name:o.id,finishWidth:o.w,finishHeight:o.h,coreMaterialId:'c',
    faces:{faceA:null,faceB:null},edges:{top:null,bottom:null,left:null,right:null},grainDirection:'HORIZONTAL',
    computed:{realThickness:T,cutWidth:o.w,cutHeight:o.h,surfaceArea:0,edgeLength:0,cost:0,co2:0},
    position:o.position,rotation:[0,0,0],visible:true,selected:false} as CabinetPanel;
}
function cab(mode:'OVERLAY'|'INSET'):Cabinet{
  const hw=W-2*T+2*9,sx=hw/2-9+T/2;
  return{id:'x',name:'x',type:'BASE',dimensions:{width:W,height:H,depth:D,toeKickHeight:100},
    structure:{topJoint:mode,bottomJoint:mode,hasBackPanel:false,backPanelConstruction:'inset',backPanelInset:6,shelfCount:0,dividerCount:0},
    materials:{defaultCore:'c',defaultSurface:'s',defaultEdge:'e'},
    panels:[panel({id:'t',role:'TOP',w:hw,h:D,position:[0,H-T/2,D/2]}),panel({id:'b',role:'BOTTOM',w:hw,h:D,position:[0,T/2,D/2]}),
      panel({id:'l',role:'LEFT_SIDE',w:D,h:H,position:[-sx,H/2,D/2]}),panel({id:'r',role:'RIGHT_SIDE',w:D,h:H,position:[sx,H/2,D/2]})]} as unknown as Cabinet;
}
const strip = (dm: ReturnType<typeof generateMinifixDrillMap>) =>
  dm.panels.map(p => ({ id: p.panelId, pts: p.points.map(({ id, ...rest }) => rest) }));

describe('cornerEngine flip', () => {
  it.each(['OVERLAY','INSET'] as const)('%s: connector-os (default) === legacy ทุกจุด และไม่มี mismatch log', (mode) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = generateMinifixDrillMap(cab(mode));                                  // default = connector-os
    const b = generateMinifixDrillMap(cab(mode), {}, {}, { cornerEngine: 'legacy' });
    expect(strip(a)).toEqual(strip(b));
    const mismatchLogs = err.mock.calls.filter(c => String(c[0]).includes('handover mismatch'));
    expect(mismatchLogs).toEqual([]);
    err.mockRestore();
  });

  it('AWI density: สอง engine ยังเท่ากัน', () => {
    const a = generateMinifixDrillMap(cab('INSET'), {}, {}, { connectorDensity: 'AWI_PREMIUM' });
    const b = generateMinifixDrillMap(cab('INSET'), {}, {}, { connectorDensity: 'AWI_PREMIUM', cornerEngine: 'legacy' });
    expect(strip(a)).toEqual(strip(b));
  });
});
