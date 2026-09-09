import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAX_TRIANGLES = 12000;
export function meshData(geometry) {
  const copy = geometry.clone(); for (const name of Object.keys(copy.attributes)) if (name !== 'position') copy.deleteAttribute(name);
  const merged = mergeVertices(copy, 1e-5); copy.dispose();
  const mesh = { positions: new Float32Array(merged.attributes.position.array), indices: new Uint32Array(merged.index.array) }; merged.dispose(); return mesh;
}
export function bufferGeometry(mesh) {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3)); geometry.setIndex([...mesh.indices]); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}
class Heap {
  values = [];
  push(item) { let i = this.values.length; this.values.push(item); while (i) { const parent = (i - 1) >> 1; if (this.values[parent].cost <= item.cost) break; this.values[i] = this.values[parent]; i = parent; } this.values[i] = item; }
  pop() { if (!this.values.length) return null; const first = this.values[0], last = this.values.pop(); if (!this.values.length) return first; let i = 0; while (i * 2 + 1 < this.values.length) { let child = i * 2 + 1; if (child + 1 < this.values.length && this.values[child + 1].cost < this.values[child].cost) child++; if (this.values[child].cost >= last.cost) break; this.values[i] = this.values[child]; i = child; } this.values[i] = last; return first; }
}
function faceNormal(a, b, c) {
  const u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...normal);
  return { normal: normal.map(x => x / (length || 1)), area: length / 2 };
}
function quadric(plane, area) { const q = [], order = [[0,0],[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,2],[2,3],[3,3]]; for (const [a,b] of order) q.push(plane[a] * plane[b] * area); return q; }
function evaluate(q, p) { const [x,y,z] = p; return Math.max(0, q[0]*x*x + 2*q[1]*x*y + 2*q[2]*x*z + 2*q[3]*x + q[4]*y*y + 2*q[5]*y*z + 2*q[6]*y + q[7]*z*z + 2*q[8]*z + q[9]); }
function solve(q) {
  const [a,b,c] = q, d=q[4], e=q[5], f=q[7], x=-q[3], y=-q[6], z=-q[8];
  const determinant=a*(d*f-e*e)-b*(b*f-c*e)+c*(b*e-c*d);
  if (Math.abs(determinant)<1e-12) return null;
  return [((d*f-e*e)*x+(c*e-b*f)*y+(b*e-c*d)*z)/determinant, ((c*e-b*f)*x+(a*f-c*c)*y+(b*c-a*e)*z)/determinant, ((b*e-c*d)*x+(b*c-a*e)*y+(a*d-b*b)*z)/determinant];
}

/** Greedy quadric-error edge collapse with local link and face-orientation checks. */
export function simplifyMesh(mesh, targetTriangles, { preserveBoundary = true } = {}) {
  const { positions, indices } = mesh;
  if (!positions || !indices || positions.length % 3 || indices.length % 3 || indices.length / 3 > MAX_TRIANGLES || !positions.every(Number.isFinite)
    || !indices.every(i => Number.isInteger(i) && i >= 0 && i < positions.length / 3) || !Number.isInteger(targetTriangles) || targetTriangles < 4) throw new RangeError(`Use a finite triangular mesh with at most ${MAX_TRIANGLES} triangles and a target of at least 4.`);
  const vertices = Array.from({ length: positions.length / 3 }, (_, i) => ({ p: [...positions.slice(i*3,i*3+3)], q: Array(10).fill(0), faces: new Set(), alive: true, revision: 0, boundary: false }));
  const faces = [], edgeCounts = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [...indices.slice(i, i+3)]; if (new Set(ids).size !== 3) continue;
    const { normal, area } = faceNormal(...ids.map(id => vertices[id].p)); if (area < 1e-12) continue;
    const id = faces.length, plane = [...normal, -normal.reduce((s,v,k)=>s+v*vertices[ids[0]].p[k],0)], q=quadric(plane,area);
    faces.push({ ids, normal, alive: true });
    for (const index of ids) { vertices[index].faces.add(id); vertices[index].q=vertices[index].q.map((value,k)=>value+q[k]); }
    for (let k=0;k<3;k++) { const pair=[ids[k],ids[(k+1)%3]].sort((a,b)=>a-b).join(','); edgeCounts.set(pair,(edgeCounts.get(pair)||0)+1); }
  }
  const initialTriangles=faces.length; let triangleCount=initialTriangles, collapses=0;
  for (const [edge,count] of edgeCounts) if (count!==2) for (const i of edge.split(',').map(Number)) vertices[i].boundary=true;
  const boundaryPositions=vertices.filter(v=>v.boundary).map(v=>v.p.slice());
  function neighbors(i) { const set=new Set(); for(const f of vertices[i].faces) for(const j of faces[f].ids) if(j!==i) set.add(j); return set; }
  function candidate(a,b) {
    if(a===b || !vertices[a].alive || !vertices[b].alive || (preserveBoundary && (vertices[a].boundary || vertices[b].boundary))) return null;
    const va=vertices[a],vb=vertices[b], na=neighbors(a),nb=neighbors(b), shared=[...va.faces].filter(f=>faces[f].ids.includes(b));
    if(!shared.length || shared.length>2) return null;
    const opposite=new Set(shared.flatMap(f=>faces[f].ids.filter(i=>i!==a&&i!==b))), common=[...na].filter(i=>nb.has(i));
    if(common.length!==opposite.size || common.some(i=>!opposite.has(i))) return null;
    const q=va.q.map((v,i)=>v+vb.q[i]), options=[va.p,vb.p,va.p.map((v,i)=>(v+vb.p[i])/2)], optimal=solve(q); if(optimal?.every(Number.isFinite)) options.push(optimal);
    const affected=new Set([...va.faces,...vb.faces]); let best=null;
    for(const p of options) {
      let valid=true;
      for(const f of affected) {
        const face=faces[f]; if(face.ids.includes(a)&&face.ids.includes(b)) continue;
        const next=faceNormal(...face.ids.map(i=>i===a||i===b?p:vertices[i].p));
        if(next.area<1e-12 || next.normal.reduce((sum,v,k)=>sum+v*face.normal[k],0)<0.2) {valid=false;break;}
      }
      if(!valid) continue;
      const cost=evaluate(q,p)+va.p.reduce((sum,v,i)=>sum+(v-vb.p[i])**2,0)*1e-10;
      if(!best || cost<best.cost) best={a,b,p:p.slice(),cost,ra:va.revision,rb:vb.revision};
    }
    return best;
  }
  const heap=new Heap();
  for(const edge of edgeCounts.keys()) {const [a,b]=edge.split(',').map(Number), entry=candidate(a,b);if(entry)heap.push(entry);}
  while(triangleCount>targetTriangles) {
    const next=heap.pop();if(!next)break;
    const {a,b,p}=next,va=vertices[a],vb=vertices[b];
    if(!va.alive||!vb.alive||va.revision!==next.ra||vb.revision!==next.rb)continue;
    const adjacent=new Set([a,b,...neighbors(a),...neighbors(b)]),affected=new Set([...va.faces,...vb.faces]);
    for(const f of affected)for(const i of faces[f].ids)vertices[i].faces.delete(f);
    va.p=p;va.q=va.q.map((v,i)=>v+vb.q[i]);vb.alive=false;
    for(const f of affected) {
      const face=faces[f]; if(face.ids.includes(a)&&face.ids.includes(b)){face.alive=false;triangleCount--;continue;}
      face.ids=face.ids.map(i=>i===b?a:i);face.normal=faceNormal(...face.ids.map(i=>vertices[i].p)).normal;
      for(const i of face.ids)vertices[i].faces.add(f);
    }
    for(const i of adjacent)vertices[i].revision++;
    const queued=new Set();
    for(const i of adjacent)if(vertices[i].alive)for(const j of neighbors(i)) {
      const pair=[i,j].sort((a,b)=>a-b),key=pair.join(',');if(queued.has(key))continue;queued.add(key);
      const entry=candidate(...pair);if(entry)heap.push(entry);
    }
    collapses++;
  }
  const used=new Set(faces.filter(f=>f.alive).flatMap(f=>f.ids)),map=new Map(),out=[];
  for(const i of used){map.set(i,out.length/3);out.push(...vertices[i].p);}
  return { positions:new Float32Array(out),indices:new Uint32Array(faces.filter(f=>f.alive).flatMap(f=>f.ids.map(i=>map.get(i)))),initialTriangles,triangles:triangleCount,targetTriangles,collapses,preserveBoundary,boundaryPositions,stoppedEarly:triangleCount>targetTriangles };
}
