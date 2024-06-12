/**
 * Returns the maximum number of mip levels for a given n-dimensional size.
 * @param size The size to compute the maximum number of mip levels for
 * @returns The maximum number of mip levels for the given size
 */
export function maxMipLevelCount(...size: any[]): number;
/**
 * The names of all predefined filters of {@link WebGPUSinglePassDownsampler}.
 * Custom ones can be registered with an instance of {@link WebGPUSinglePassDownsampler} using {@link WebGPUSinglePassDownsampler.registerFilter}.
 */
export const SPDFilters: any;
/**
 * A compute pass for downsampling a texture.
 */
export class SPDPass {
    /** @ignore */
    constructor(passes: any, target: any);
    passes: any;
    /**
     * The texture the mipmaps will be written to by this {@link SPDPass}, once {@link SPDPass.encode} is called.
     */
    target: any;
    /**
     * Encodes the configured mipmap generation pass(es) with the given {@link GPUComputePassEncoder}.
     * All bind groups indices used by {@link SPDPass} are reset to `null` to prevent unintentional bindings of internal bind groups for subsequent pipelines encoded in the same {@link GPUComputePassEncoder}.
     * @param computePassEncoder The {@link GPUComputePassEncoder} to encode this mipmap generation pass with.
     * @returns The {@link computePassEncoder}
     */
    encode(computePassEncoder: any): any;
    /**
     * Returns the number of passes that will be encoded by calling this instance's {@link SPDPass.encode} method.
     */
    get numPasses(): any;
}
/**
 * A helper class for downsampling 2D {@link GPUTexture} (& arrays) using as few passes as possible on a {@link GPUDevice} depending on its {@link GPUSupportedLimits}.
 * Up to 12 mip levels can be generated within a single pass, if {@link GPUSupportedLimits.maxStorageTexturesPerShaderStage} supports it.
 */
export class WebGPUSinglePassDownsampler {
    /**
     * Sets the preferred device limits for {@link WebGPUSinglePassDownsampler} in a given record of limits.
     * Existing preferred device limits are either increased or left untouched.
     * If {@link limits} is undefined, creates a new record of preferred device limits for {@link WebGPUSinglePassDownsampler}.
     * The result can be used to set {@link GPUDeviceDescriptor.requiredLimits} when requesting a device.
     * @param limits A record of device limits set to update with the preferred limits for {@link WebGPUSinglePassDownsampler}
     * @param adapter If this is set, the preferred limits that are set by this function will be clamped to {@link GPUAdapter.limits}.
     * @returns The updated or created set of device limits with all preferred limits for {@link WebGPUSinglePassDownsampler} set
     */
    static setPreferredLimits(limits: any, adapter: any): any;
    /**
     * Creates a new {@link WebGPUSinglePassDownsampler}.
     * On its own, {@link WebGPUSinglePassDownsampler} does not allocate any GPU resources.
     * Optionally, prepare GPU resources for a given {@link SPDPrepareDeviceDescriptor}.
     * @param prepareDescriptor An optional descriptor for preparing GPU resources
     * @see WebGPUSinglePassDownsampler.prepareDeviceResources
     */
    constructor(prepareDescriptor: any);
    filters: Map<any, string>;
    devicePipelines: Map<any, any>;
    /**
     * The set of formats supported by WebGPU SPD.
     *
     * Note that `bgra8unorm` is only supported if the device feature `bgra8unorm-storage` is enabled.
     */
    supportedFormats: Set<string>;
    /**
     * Prepares GPU resources required by {@link WebGPUSinglePassDownsampler} to downsample textures for a given {@link SPDPrepareDeviceDescriptor}.
     * @param prepareDescriptor a descriptor for preparing GPU resources
     */
    prepareDeviceResources(prepareDescriptor: any): void;
    getOrCreateDevicePipelines(device: any, maxArrayLayers: any, maxMipsPerPass: any): any;
    /**
     * Deregisters all resources stored for a given device.
     * @param device The device resources should be deregistered for
     */
    deregisterDevice(device: any): void;
    /**
     * Registers a new downsampling filter operation that can be injected into the downsampling shader for new pipelines.
     *
     * The given WGSL code must (at least) specify a function to reduce four values into one with the following name and signature:
     *
     *   `spd_reduce_4(v0: vec4<SPDScalar>, v1: vec4<SPDScalar>, v2: vec4<SPDScalar>, v3: vec4<SPDScalar>) -> vec4<SPDScalar>`
     *
     * @param name The unique name of the filter operation
     * @param wgsl The WGSL code to inject into the downsampling shader as the filter operation
     */
    registerFilter(name: any, wgsl: any): void;
    /**
     * Prepares a pass to downsample a 2d texture / 2d texture array.
     * The produced {@link SPDPass} can be used multiple times to repeatedly downsampling a texture, e.g., for downsampling the depth buffer each frame.
     * For one-time use, {@link WebGPUSinglePassDownsampler.generateMipmaps} can be used instead.
     *
     * By default, the texture is downsampled `texture.mipLevelCount - 1` times using an averaging filter, i.e., 4 pixel values from the parent level are averaged to produce a single pixel in the current mip level.
     * This behavior can be configured using the optional {@link config} parameter.
     * For example, instead of writing the mip levels into the input texture itself, a separate target texture can be specified using {@link SPDPassConfig.target}.
     * Other configuration options include using a different (possibly custom) filter, only downsampling a subregion of the input texture, and limiting the number of mip levels to generate, e.g., if a min-max pyramid is only needed up to a certain tile resolution.
     * If the given filter does not exist, an averaging filter will be used as a fallback.
     * The image region to downsample and the number of mip levels to generate are clamped to the input texture's size, and the output texture's `mipLevelCount`.
     *
     * Depending on the number of mip levels to generate and the device's `maxStorageTexturesPerShaderStage` limit, the {@link SPDPass} will internally consist of multiple passes, each generating up to `min(maxStorageTexturesPerShaderStage, 12)` mip levels.
     *
     * @param device The device the {@link SPDPass} should be prepared for
     * @param texture The texture that is to be processed by the {@link SPDPass}. Must support generating a {@link GPUTextureView} with {@link GPUTextureViewDimension:"2d-array"}. Must support {@link GPUTextureUsage.TEXTURE_BINDING}, and, if no other target is given, {@link GPUTextureUsage.STORAGE_BINDING}.
     * @param config The config for the {@link SPDPass}
     * @returns The prepared {@link SPDPass} or undefined if preparation failed or if no mipmaps would be generated.
     * @throws If the {@link GPUTextureFormat} of {@link SPDPassConfig.target} is not supported (does not support {@link GPUStorageTextureAccess:"write-only"} on the given {@link device}).
     * @throws If the size of {@link SPDPassConfig.target} is too small to store the first mip level generated for {@link texture}
     * @throws If {@link texture} or {@link SPDPassConfig.target} is not a 2d texture.
     * @see WebGPUSinglePassDownsampler.generateMipmaps
     * @see WebGPUSinglePassDownsampler.registerFilter
     * @see WebGPUSinglePassDownsampler.setPreferredLimits
     */
    preparePass(device: any, texture: any, config: any): any;
    /**
     * Generates mipmaps for the given texture.
     * For textures that will be downsampled more than once, consider generating a {@link SPDPass} using {@link WebGPUSinglePassDownsampler.preparePass} and calling its {@link SPDPass.encode} method.
     * This way, allocated GPU resources for downsampling the texture can be reused.
     * @param device The device to use for downsampling the texture
     * @param texture The texture to generate mipmaps for. Must support generating a {@link GPUTextureView} with {@link GPUTextureViewDimension:"2d-array"}.
     * @param config The config for mipmap generation
     * @returns True if mipmaps were generated, false otherwise
     * @throws If {@link WebGPUSinglePassDownsampler.preparePass} threw an error.
     * @see WebGPUSinglePassDownsampler.preparePass
     */
    generateMipmaps(device: any, texture: any, config: any): boolean;
}
