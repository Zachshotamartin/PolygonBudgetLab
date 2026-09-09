import * as T from 'three';
import { meshData } from './decimate.js';
export const PRESETS=['Braided knot','Ridged vessel','Terrain tile'];
export function createPreset(name=PRESETS[0]) {
  let geometry;
  if(name==='Ridged vessel') {
    const profile=[new T.Vector2(0,-1.1)];
    for(let i=0;i<=40;i++){const y=-1.1+i*2.2/40;profile.push(new T.Vector2(0.55+0.19*Math.cos(y*2.5)+0.045*Math.cos(i*Math.PI),y));}
    geometry=new T.LatheGeometry(profile,64);
  } else if(name==='Terrain tile') {
    geometry=new T.PlaneGeometry(2.4,2.4,44,44).rotateX(-Math.PI/2);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,0.55*Math.exp(-((x-.2)**2+(z+.25)**2)*3)+0.27*Math.sin(x*5+z*2)*Math.cos(z*4)+0.07*Math.sin(x*17)*Math.sin(z*11));}
  } else geometry=new T.TorusKnotGeometry(0.78,0.245,144,16);
  const mesh=meshData(geometry);geometry.dispose();return mesh;
}
