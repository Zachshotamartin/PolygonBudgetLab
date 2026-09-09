# Verification

- `npm test`: 3 tests pass. They verify actual triangle reduction, closed manifold edge incidence, unchanged input, exact locked boundary positions, deterministic results, and honest termination when constraints prevent the requested budget.
- `npm run build`: passes, producing a separate simplification worker.
- Chromium: reduced the 4,608-triangle knot to 450, reduced the terrain to 700, enabled wireframe, exported OBJ and counted exactly 700 faces, then loaded that exported file and simplified it again. No JavaScript errors.
- At 390 × 844, the document has no horizontal overflow.

## Recorded examples

`examples/01.png` compares the knot at 4,608 and 450 triangles. `examples/02.png` compares the terrain with locked rim vertices at the original and reduced budgets. These are actual worker results, not manually authored low-poly replacements. Captions and steps are in `examples/manifest.json`.

The worker is constructed with `new URL('./worker.js', import.meta.url)`. Bundlers must process that URL so the installed package retains its worker asset. The portfolio integration should exercise a real simplify operation after its production build.

OBJ input is bounded at 2 MB and 12,000 triangles. Materials and UVs are not preserved. Boundary or topology constraints can prevent reaching the target; the status reports the actual triangle count.
