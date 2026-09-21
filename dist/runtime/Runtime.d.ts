/// <reference types="dist" />
import { CompiledKernel, KernelParams, ResourceBinding } from './Kernel';
import { SNodeTree } from '../data/SNodeTree';
import { Field } from '../data/Field';
import { TextureBase, TextureDimensionality, TextureSamplingOptions } from '../data/Texture';
declare class Runtime {
    adapter: GPUAdapter | null;
    device: GPUDevice | null;
    kernels: CompiledKernel[];
    materializedTrees: SNodeTree[];
    textures: TextureBase[];
    allocCount: number;
    private globalTmpsBuffer;
    private randStatesBuffer;
    private pipelineCache;
    constructor();
    init(): Promise<void>;
    createDevice(): Promise<void>;
    createKernel(params: KernelParams): CompiledKernel;
    sync(): Promise<void>;
    launchKernel(kernel: CompiledKernel, ...args: any[]): Promise<any>;
    private addArgsBuffer;
    private recycleArgsBuffer;
    private createGlobalTmpsBuffer;
    private createRandStatesBuffer;
    getGPUBindGroupEntries(bindings: ResourceBinding[], argsBuffer: GPUBuffer | undefined, retsBuffer: GPUBuffer | undefined): GPUBindGroupEntry[];
    materializeTree(tree: SNodeTree): void;
    addTexture(texture: TextureBase): void;
    createGPUTexture(dimensions: number[], dimensionality: TextureDimensionality, format: GPUTextureFormat, renderAttachment: boolean, requiresStorage: boolean, sampleCount: number, mipLevelCount?: number, arrayLayers?: number): GPUTexture;
    createGPUSampler(depth: boolean, samplingOptions: TextureSamplingOptions): GPUSampler;
    createGPUCanvasContext(htmlCanvas: HTMLCanvasElement): [
        GPUCanvasContext,
        GPUTextureFormat
    ];
    deviceToHost(field: Field, offsetBytes?: number, sizeBytes?: number): Promise<FieldHostSideCopy>;
    deviceToHostMultiple(fields: Field[]): Promise<FieldHostSideCopy[]>;
    hostToDevice(field: Field, hostArray: Int32Array, offsetBytes?: number, transferBytes?: number | null): Promise<void>;
    /**
     * hostToDevice without the trailing onSubmittedWorkDone await — the
     * staging copy is enqueued in-order and the caller's later global sync
     * guarantees it landed. Assumes a dedicated staging buffer per call
     * (reuse would race the earlier copy); Field.fromFloat32ArrayAsync wraps
     * this for that contract.
     */
    hostToDeviceAsync(field: Field, hostArray: Int32Array, offsetBytes?: number, transferBytes?: number | null): Promise<void>;
    getRootBuffer(treeId: number): GPUBuffer;
    copyImageBitmapToTexture(bitmap: ImageBitmap, texture: GPUTexture): Promise<void>;
    copyImageBitmapsToCubeTexture(bitmaps: ImageBitmap[], texture: GPUTexture): Promise<void>;
    copyTextureToTexture(src: GPUTexture, dest: GPUTexture, dimensions: number[]): Promise<void>;
    getGPUShaderModule(code: string): GPUShaderModule;
    getGPUComputePipeline(desc: GPUComputePipelineDescriptor): GPUComputePipeline;
    getGPURenderPipeline(desc: GPURenderPipelineDescriptor): GPURenderPipeline;
    private supportsIndirectFirstInstance;
    /**
     * Tear down all GPU resources owned by this runtime. Essential to prevent
     * GPU memory leaks: SNodeTree rootBuffers, textures, and the device/adapter
     * are never GC'd by the JS engine. Call before re-init or on page teardown.
     */
    destroy(): void;
}
declare class FieldHostSideCopy {
    intArray: Int32Array;
    floatArray: Float32Array;
    constructor(intArray: Int32Array, floatArray: Float32Array);
}
export { Runtime };
