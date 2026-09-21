export { init } from './api/Init';

export * from './api/Kernels';
export * from './api/Fields';
export {
    texture,
    canvasTexture,
    depthTexture,
    textureArray,
    Sampler,
    Texture,
    TextureArray,
    CubeTexture,
    TextureSamplingOptions,
    WrapMode,
    FilterMode,
    TextureDataType,
} from './api/Textures';
export { Canvas } from './api/ui/Canvas';
export { Timer } from './utils/Timer';
export * from './api/KernelScopeBuiltin';
export { Program } from './program/Program';

import * as types from './api/Types';
export { types };

export { runAllTests } from './tests/All';

import * as ti from './taichi';

declare module globalThis {
    let ti: any;
}
globalThis.ti = ti;
