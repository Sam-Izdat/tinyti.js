# BUG: kernel texture stores silently dropped when first storage-buffer
#      reference follows texture fetches

Found 2026-08-21 via ilmato (deferred texturing). Repro + context below.
Status: worked around downstream; not yet minimized.

## Symptom

A compute kernel compiled from a class-kernel (`ti.classKernel(ctx, spec, fn)`)
dispatches without error, no validation errors, no device loss — but **none of
its `textureStore` writes land**. Readback of the target texture shows stale
content. Adding a reference to ANY storage buffer BEFORE the first texture
fetch in the body makes all stores work again. Removing it reproduces
deterministically.

## Minimal-ish shape (from ilmato shade_sv2)

Body that FAILS (all stores lost):
```
(t, fs, ca) => {
  for (...cells...) {
    let id_pos   = ti.textureLoadLod(this.gbuffer.id_pos, [x, y], 0);  // texture fetch FIRST
    ...
    let mi = this.scene_data.material_info_buffer[id];                 // storage buffer AFTER textures
    ...textureStoreLod(this.output_buffer.diffuse, ...)...
  }
}
```
Body that WORKS: identical, plus one storage-buffer touch before any texture
fetch, e.g.:
```
let sdata_first = this.scene_data.material_info_buffer[0];
```
The early reference does not need to be *used* downstream to fix it (though
DCE-safety suggests keeping it live).

## Context / differentiators

- Kernel ctx holds multiple textures (several Texture2D wrappers), two i32
  fields (mat_occ field + __fix), one struct storage buffer (scene_data),
  plain-number constants.
- Kernels are recompiled per material (per-kernel compilation against flat ctx
  objects); failure appears regardless of which iteration.
- Not device loss: watchdog on `device.lost` stays quiet; reads work; raster
  (render-pipeline) writes unaffected.
- Same-page other kernels (different bodies) are unaffected → per-kernel issue,
  not global queue state.

## Suspected mechanism

WgslCodegen assigns `@binding(N)` points by **first-use order during IR
traversal** (ResourceBindingMap.add called from visit* handlers, e.g. lines
~1234/1387/1477). If the runtime-side bind-group entry collection
(Runtime.ts `getGPUBindGroupEntries`, fed by `task.params.bindings`) orders or
dedupes resources differently than codegen's first-use order, same-typed
resources (two storage buffers, or two texture views) swap silently — WebGPU
layout validation passes because the *shapes* match. An early storage-buffer
read changes first-use order such that the assignment coincidentally aligns.

Suggested investigation:
1. Dump generated WGSL @binding numbers vs `task.params.bindings` order for a
   failing body; look for a buffer↔texture interleaving mismatch.
2. Check whether `ResourceInfo.equals()` can conflate distinct resources.
3. Check dead-code elimination of the trailing unused buffer read in the
   failing variant (binding may be allocated then DCE'd from WGSL while BG
   still expects it, shifting subsequent entries).

## Downstream workaround

ilmato `src/builtin/pass/shading/shade.js`: every per-material kernel begins
with `let sdata_first = this.scene_data.material_info_buffer[0];` marked
"WORKAROUND (do not remove)". Remove only after an upstream fix + regression
test here.
