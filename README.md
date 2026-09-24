# tinyti.js

This is a fork of AmesingFlank's [taichi.js](https://github.com/AmesingFlank/taichi.js) which is, in turn, a Javascript version of the Python library [Taichi](https://github.com/taichi-dev/taichi).

This fork:

- Implements mipmap generation and LOD sampling. (mipmaps generated w/ webgpu-spd)
- Removes the "engine" components of taichi.js. (rendering has been moved to tinymarch)
- Adds and fixes various builtin operations.
- Optimizes GPU→CPU readback performance (see below).
- Adds `toFloat32Array()` and `toTypedInt32Array()` field methods for zero-copy typed array readbacks.

See the forked repo and site for documentation.

## Readback Performance

GPU→CPU field readback (`toArray`, `toArray1D`, `get`, etc.) has been optimized in three ways:

1. **Removed redundant GPU sync.** The original code called `onSubmittedWorkDone()` before `mapAsync()` — both wait for the GPU, so the first was redundant. Removing it eliminates an extra full GPU round-trip on every readback.

2. **Eliminated heap-heavy `Array.from()` conversions.** Mapped GPU data is now copied into a single `ArrayBuffer` with two typed array views (`Int32Array` + `Float32Array`) sharing it, instead of creating two separate JS `number[]` arrays via `Array.from()`.

3. **Index-based element extraction.** `groupElements` no longer splits arrays into O(N) sub-arrays via `groupByN`. For scalar fields (the common case), each element is read with a single typed array index — zero intermediate allocations.

### New Methods

For callers who want maximum readback throughput, two new `Field` methods skip the final `Array.from` conversion entirely:

| Method | Returns | Use case |
|---|---|---|
| `field.toFloat32Array()` | `Promise<Float32Array>` | Fast readback of f32 scalar/vector/matrix fields |
| `field.toTypedInt32Array()` | `Promise<Int32Array>` | Fast readback of i32 fields |

All existing methods (`toArray`, `toArray1D`, `toInt32Array`, `get`, `set`, `fromArray`, etc.) remain backward-compatible.

### Batch Readbacks

For applications reading back multiple fields per frame (e.g., position, velocity, and density), you can batch the readbacks to avoid multiple individual GPU submissions and sequential sync waits:

```javascript
// Batch reads multiple fields concurrently
let [pos, vel, density] = await ti.toArrays([posField, velField, densityField]);
```

This merges the buffer copy commands into a single GPU command queue submission and executes the `mapAsync` calls concurrently using `Promise.all`.

## Upload Performance

Host→device field upload (`fromArray`, `fromArray1D`) pays two JS-side costs before the GPU copy: building a `number[]` and converting it with `Float32Array.from`. For callers staging large buffers (texture chains, arena uploads), two new `Field` methods hand the runtime a typed array directly:

| Method | Behavior | Use case |
|---|---|---|
| `field.fromFloat32Array(data, offsetBytes?)` | Raw-buffer upload; awaits work-done | One-shot bulk upload with no JS array round-trip |
| `field.fromFloat32ArrayAsync(data, offsetBytes?)` | Same staging copy, fire-and-forget (no `onSubmittedWorkDone` await) | Upload pipelines that fence once at the sink (`ti.sync`) instead of per upload |

`fromFloat32ArrayAsync` is safe only for fields the caller never re-writes before the later global sync (it allocates a dedicated staging buffer per call; reusing the field early races the in-flight copy). Both wrap `Runtime.hostToDevice[Async]`.

## Texture Uploads (0.1.11)

Buffer-source texture upload (`Runtime.uploadBufferToTexture`, also exposed as `texture.uploadBytes(...)` on any `TextureBase`) stages host bytes into a pooled, grown-only two-buffer staging ring and issues a 256-aligned `copyBufferToTexture`. No per-call device buffer allocation, so it is safe in per-mip decode/stream storms.

| Call | Use case |
|---|---|
| `texture.uploadBytes(bytes, mip, { size, origin, bytesPerRow, rowsPerImage })` | Raw rows into any texture mip |
| BC formats (`TextureDataType.bc1/bc2/bc3/bc7`) | Size must be block-rounded (multiple of 4); block-row stride is derived from the format, `origin[2]` selects the array layer on `TextureArray` |

Block-compressed textures admit exactly `COPY_DST | TEXTURE_BINDING` usage — the runtime never requests STORAGE/RENDER_ATTACHMENT/COPY_SRC on compressed formats.

## Device Limits (0.1.12)

`createDevice` requests the adapter maximum for `maxStorageBufferBindingSize`, `maxBufferSize`, and `maxTextureArrayLayers` (the latter new in 0.1.12 — array-pool layers exceed the 256 default on Bistro-class scenes). Requesting the adapter's own maxima is always legal; weaker adapters just report lower limits.