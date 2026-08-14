/// <reference types="dist" />
export declare class PipelineCache {
    device: GPUDevice;
    constructor(device: GPUDevice);
    private shaderModuleCache;
    getOrCreateShaderModule(code: string): GPUShaderModule;
    private equals;
    private computePipelineCache;
    getOrCreateComputePipeline(desc: GPUComputePipelineDescriptor): GPUComputePipeline;
    private RenderPipelineCache;
    getOrCreateRenderPipeline(desc: GPURenderPipelineDescriptor): GPURenderPipeline;
    /** Clear caches. Pipelines and shader modules are released by the device
     *  on destroy(); this just drops references to avoid retaining them. */
    destroy(): void;
}
