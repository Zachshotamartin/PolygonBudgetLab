import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { bufferGeometry, meshData, MAX_TRIANGLES } from './decimate.js';
import { PRESETS, createPreset } from './presets.js';

export const metadata = {
  id: 'polygon-budget-lab', title: 'Polygon Budget Lab',
  description: 'Reduce a mesh with real edge collapses, then inspect where its shape survives and where detail disappears.',
  technique: 'Area-weighted quadric error metrics, local manifold link checks, face-flip rejection and optional locked boundary vertices.',
  instructions: ['Pick a source mesh or load a small OBJ, then choose a triangle budget.', 'Simplify runs in a worker; the readout reports the achieved count, not an estimated target.', 'Compare both meshes, switch to wireframe, and export the actual reduced mesh.'],
  limitations: ['At most 12,000 source triangles and a 2 MB OBJ file; materials, UVs and skinning are not preserved.', 'Boundary locking can prevent the requested target. The actual count and early stopping are reported.', 'Local topology and face-flip checks are used; global self-intersections and feature semantics are not solved.'],
};

export function createExperiment(ctx) {
  const { THREE: T, root, ui } = ctx;
  let source, result, target = 1400, preserveBoundary = true, mode = 'Side by side', revision = 0, busy = false;
  const sourceMaterial = new T.MeshStandardMaterial({ color: 0xa6bab2, roughness: 0.46, metalness: 0.2, side: T.DoubleSide });
  const resultMaterial = new T.MeshStandardMaterial({ color: 0xd99976, roughness: 0.56, metalness: 0.05, side: T.DoubleSide });
  const original = new T.Mesh(new T.BufferGeometry(), sourceMaterial), reduced = new T.Mesh(new T.BufferGeometry(), resultMaterial); root.add(original, reduced);
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  function layout() {
    original.visible = mode !== 'Reduced only'; reduced.visible = mode !== 'Original only';
    original.position.x = mode === 'Side by side' ? -1.55 : 0; reduced.position.x = mode === 'Side by side' ? 1.55 : 0;
    // Hidden comparison meshes must not affect a single-mesh camera fit.
    ctx.fit(mode === 'Original only' ? original : mode === 'Reduced only' ? reduced : root);
    if (mode === 'Side by side') {
      const distance = ctx.camera.position.distanceTo(ctx.controls.target), target = ctx.controls.target;
      ctx.camera.position.set(target.x, target.y + distance * 0.14, target.z + distance); ctx.controls.update();
    }
    ctx.invalidate();
  }
  function report() {
    const count = result.indices.length / 3, total = source.indices.length / 3;
    ctx.setStatus(`Original ${total.toLocaleString()} triangles · reduced ${count.toLocaleString()} · ${(100 * (1 - count / total)).toFixed(1)}% fewer${result.stoppedEarly ? ' · stopped to preserve valid topology / boundaries' : ''}`);
  }
  function simplify() {
    if (!source || busy) return;
    busy = true; simplifyButton.disabled = true; exportButton.disabled = true;
    const id = ++revision; ctx.setStatus(`Simplifying ${source.indices.length / 3} triangles toward ${target}…`);
    const mesh = { positions: source.positions.slice(), indices: source.indices.slice() };
    worker.postMessage({ id, mesh, target, preserveBoundary }, [mesh.positions.buffer, mesh.indices.buffer]);
  }
  function load(mesh) {
    revision++; busy = false; source = mesh; result = { ...mesh }; target = Math.max(4, Math.round(mesh.indices.length / 3 * 0.3));
    targetInput.max = String(mesh.indices.length / 3); targetInput.value = String(target); targetInput.dispatchEvent(new Event('input'));
    original.geometry.dispose(); reduced.geometry.dispose(); original.geometry = bufferGeometry(source); reduced.geometry = bufferGeometry(result);
    simplifyButton.disabled = false; layout(); simplify();
  }
  ui.section('Mesh source');
  ui.select('Preset', PRESETS, PRESETS[0], value => load(createPreset(value)));
  ui.file('Load OBJ (up to 2 MB)', async file => {
    if (file.size > 2 * 1024 * 1024) throw new RangeError('OBJ uploads are limited to 2 MB.');
    const object = new OBJLoader().parse(await file.text()); object.updateMatrixWorld(true);
    const positions = [], indices = []; let count = 0;
    try {
      object.traverse(child => {
        if (!child.isMesh) return;
        const g = child.geometry.clone().applyMatrix4(child.matrixWorld), mesh = meshData(g); g.dispose();
        count += mesh.indices.length / 3; if (count > MAX_TRIANGLES) throw new RangeError(`Use an OBJ with at most ${MAX_TRIANGLES.toLocaleString()} triangles.`);
        const base = positions.length / 3; for (const value of mesh.positions) positions.push(value); for (const index of mesh.indices) indices.push(index + base);
      });
      if (indices.length < 12 || !positions.every(Number.isFinite)) throw new RangeError('The OBJ needs at least four finite triangles.');
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      positions.forEach((value,i)=>{min[i%3]=Math.min(min[i%3],value);max[i%3]=Math.max(max[i%3],value);});
      const extent=Math.max(...max.map((v,i)=>v-min[i])); if(extent<1e-8)throw new RangeError('The OBJ has no usable spatial extent.');
      load({positions:new Float32Array(positions.map((v,i)=>(v-(min[i%3]+max[i%3])/2)/extent*2.4)),indices:new Uint32Array(indices)});
    } finally { object.traverse(child=>{child.geometry?.dispose();for(const m of Array.isArray(child.material)?child.material:child.material?[child.material]:[])m.dispose();}); }
  }, { accept: '.obj,text/plain' });
  ui.section('Reduction budget');
  const targetInput = ui.range('Target triangles', { min: 4, max: 12000, step: 1, value: target, onChange: value => { target = Math.max(4, Math.round(value)); } });
  ui.toggle('Lock open boundaries', preserveBoundary, value => { preserveBoundary = value; });
  const simplifyButton = ui.button('Simplify mesh', simplify, { primary: true });
  ui.section('Comparison');
  ui.select('View', ['Side by side', 'Original only', 'Reduced only'], mode, value => { mode = value; layout(); });
  ui.toggle('Wireframe', false, value => { sourceMaterial.wireframe = resultMaterial.wireframe = value; ctx.invalidate(); });
  ui.button('Align comparison', layout);
  const exportButton = ui.button('Export reduced OBJ', () => { const exportMesh = reduced.clone(); exportMesh.position.set(0,0,0); ctx.exportOBJ(exportMesh, 'reduced-mesh.obj'); });
  ui.note('Left: original in silver. Right: reduced in terracotta. Locked rims stay fixed; a tight budget may be unreachable without breaking them.');
  ctx.listen(worker, 'message', event => {
    if (event.data.id !== revision) return;
    busy = false; simplifyButton.disabled = false;
    if (event.data.error) { ctx.setStatus(`Unable to simplify: ${event.data.error}`); exportButton.disabled = false; return; }
    result = event.data.result; reduced.geometry.dispose(); reduced.geometry = bufferGeometry(result); exportButton.disabled = false; report(); ctx.invalidate();
  });
  ctx.listen(worker, 'error', event => { busy = false; simplifyButton.disabled = false; ctx.setStatus(`Worker failed: ${event.message || 'reload this tool and try again'}`); });
  load(createPreset());
  let initialView = true;
  const stop = ctx.onFrame(() => { if (initialView) { initialView = false; layout(); } });
  return { dispose() { revision++; stop(); worker.terminate(); } };
}
