import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { meshData, simplifyMesh, bufferGeometry } from '../src/decimate.js';

function edges(indices) {
  const counts=new Map();
  for(let i=0;i<indices.length;i+=3)for(let k=0;k<3;k++){const key=[indices[i+k],indices[i+(k+1)%3]].sort((a,b)=>a-b).join(',');counts.set(key,(counts.get(key)||0)+1);}
  return counts;
}
test('actual edge collapse reaches a smaller triangle budget and preserves a closed manifold sphere', () => {
  const g=new T.IcosahedronGeometry(1,6),mesh=meshData(g),before=mesh.positions.slice();g.dispose();
  const result=simplifyMesh(mesh,260);
  assert.ok(result.triangles<=260);assert.ok(result.triangles>=258);assert.ok(result.collapses>100);
  assert.equal(result.indices.length,result.triangles*3);assert.ok(result.positions.every(Number.isFinite));assert.ok([...edges(result.indices).values()].every(count=>count===2));
  assert.deepEqual(mesh.positions,before);assert.ok(result.positions.length<mesh.positions.length);
  const geometry=bufferGeometry(result);assert.ok(geometry.attributes.normal.array.every(Number.isFinite));geometry.dispose();
});
test('locked open boundary vertices keep their exact positions while interior triangles collapse', () => {
  const g=new T.PlaneGeometry(2,2,12,12),p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,0.15*Math.sin(p.getX(i)*3)*Math.sin(p.getY(i)*3));
  const mesh=meshData(g),result=simplifyMesh(mesh,90,{preserveBoundary:true});g.dispose();
  assert.ok(result.triangles<mesh.indices.length/3);
  const output=new Set(Array.from({length:result.positions.length/3},(_,i)=>[...result.positions.slice(i*3,i*3+3)].join(',')));
  for(const point of result.boundaryPositions)assert.ok(output.has(point.join(',')),'Every original rim vertex must remain exactly fixed.');
  assert.ok([...edges(result.indices).values()].every(count=>count<=2));
});
test('unreachable budgets stop honestly and deterministic inputs reproduce the same mesh', () => {
  const geometry=new T.PlaneGeometry(2,2,1,2),mesh=meshData(geometry);geometry.dispose();
  const result=simplifyMesh(mesh,4,{preserveBoundary:true});assert.equal(result.triangles,4);
  const denser=meshData(new T.PlaneGeometry(2,2,3,3)),locked=simplifyMesh(denser,4,{preserveBoundary:true});
  assert.ok(locked.stoppedEarly);assert.ok(locked.triangles>4);
  assert.deepEqual(locked,simplifyMesh(denser,4,{preserveBoundary:true}));
  assert.throws(()=>simplifyMesh({positions:new Float32Array([NaN,0,0]),indices:new Uint32Array([0,0,0])},4),RangeError);
});
