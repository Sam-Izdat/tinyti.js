/// <reference types="dist" />
export declare enum TextureDimensionality {
    Dim2d = 0,
    Dim3d = 1,
    DimCube = 2,
    Dim2dArray = 3
}
export declare function getTextureCoordsNumComponents(dim: TextureDimensionality): number;
export declare abstract class TextureBase {
    abstract getGPUTextureFormat(): GPUTextureFormat;
    abstract canUseAsRengerTarget(): boolean;
    abstract getGPUTexture(): GPUTexture;
    abstract getGPUTextureView(): GPUTextureView;
    abstract getGPUTextureViewLod(lod: number): GPUTextureView;
    abstract generateMipmaps(): boolean;
    abstract getGPUSampler(): GPUSampler | null;
    abstract getTextureDimensionality(): TextureDimensionality;
    abstract getMipLevelCount(): number;
    /**
     * Release the GPU texture (and any ancillary GPU objects like multisampled
     * render targets). The runtime calls this for every registered texture in
     * destroy(). CanvasTexture delegates to the swapchain (no-op here; the
     * canvas context is owned by the canvas and destroyed by the browser).
     */
    abstract destroy(): void;
    /**
     * Set to true by concrete destroy() implementations once the underlying
     * GPU resources have been released. The JS object may still be referenced
     * (e.g. by Runtime.textures) after destruction, so consumers walking the
     * registry for memory accounting should skip destroyed entries.
     */
    destroyed: boolean;
    textureId: number;
    sampleCount: number;
}
export declare enum WrapMode {
    Repeat = "repeat",
    ClampToEdge = "clamp-to-edge",
    MirrorRepeat = "mirror-repeat"
}
export declare enum FilterMode {
    Linear = "linear",
    Nearest = "nearest"
}
export declare enum TextureDataType {
    float16 = 1,
    float32 = 2
}
export interface TextureSamplingOptions {
    wrapModeU?: WrapMode;
    wrapModeV?: WrapMode;
    wrapModeW?: WrapMode;
    magFilter?: FilterMode;
    minFilter?: FilterMode;
    mipmapFilter?: FilterMode;
}
export declare class Sampler {
    samplingOptions: TextureSamplingOptions;
    constructor(samplingOptions: TextureSamplingOptions);
    gpuSampler: GPUSampler;
}
export declare class Texture extends TextureBase {
    numComponents: number;
    dimensions: number[];
    constructor(numComponents: number, dimensions: number[], sampleCount: number, sampler?: Sampler | null, mipLevelCount?: number, dtype?: TextureDataType);
    private texture;
    private textureView;
    private mipLevelViews;
    private sampler;
    multiSampledRenderTexture: GPUTexture | null;
    private mipLevelCount;
    private dtype;
    getGPUTextureFormat(): GPUTextureFormat;
    canUseAsRengerTarget(): boolean;
    getGPUTexture(): GPUTexture;
    getGPUTextureView(): GPUTextureView;
    getGPUTextureViewLod(lod?: number): GPUTextureView;
    generateMipmaps(filter?: string): boolean;
    getGPUSampler(): GPUSampler | null;
    getTextureDimensionality(): TextureDimensionality;
    getMipLevelCount(): number;
    copyFrom(src: Texture): Promise<void>;
    static createFromBitmap(bitmap: ImageBitmap, sampleCount?: number, sampler?: Sampler, mipLevelCount?: number, dtype?: TextureDataType): Promise<Texture>;
    static createFromHtmlImage(image: HTMLImageElement, sampleCount?: number, sampler?: Sampler, mipLevelCount?: number, dtype?: TextureDataType): Promise<Texture>;
    static createFromURL(url: string, sampleCount?: number, sampler?: Sampler, mipLevelCount?: number, dtype?: TextureDataType): Promise<Texture>;
    destroy(): void;
}
export declare class TextureArray extends TextureBase {
    numComponents: number;
    width: number;
    height: number;
    layers: number;
    constructor(numComponents: number, width: number, height: number, layers: number, sampleCount?: number, sampler?: Sampler | null, mipLevelCount?: number, dtype?: TextureDataType);
    dimensions: number[];
    private texture;
    private textureView;
    private mipLevelViews;
    private sampler;
    private mipLevelCount;
    private dtype;
    getGPUTextureFormat(): GPUTextureFormat;
    canUseAsRengerTarget(): boolean;
    getGPUTexture(): GPUTexture;
    getGPUTextureView(): GPUTextureView;
    getGPUTextureViewLod(lod?: number): GPUTextureView;
    getTextureDimensionality(): TextureDimensionality;
    getMipLevelCount(): number;
    getGPUSampler(): GPUSampler | null;
    generateMipmaps(): boolean;
    destroy(): void;
}
export declare class CanvasTexture extends TextureBase {
    htmlCanvas: HTMLCanvasElement;
    constructor(htmlCanvas: HTMLCanvasElement, sampleCount: number);
    dimensions: number[];
    multiSampledRenderTexture: GPUTexture | null;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    private sampler;
    getGPUTextureFormat(): GPUTextureFormat;
    canUseAsRengerTarget(): boolean;
    getGPUTexture(): GPUTexture;
    getGPUTextureView(): GPUTextureView;
    getGPUTextureViewLod(lod?: number): GPUTextureView;
    generateMipmaps(): boolean;
    getGPUSampler(): GPUSampler;
    getTextureDimensionality(): TextureDimensionality;
    getMipLevelCount(): number;
    destroy(): void;
}
export declare class DepthTexture extends TextureBase {
    dimensions: number[];
    constructor(dimensions: number[], sampleCount: number);
    private texture;
    private textureView;
    private sampler;
    getGPUTextureFormat(): GPUTextureFormat;
    canUseAsRengerTarget(): boolean;
    getGPUTexture(): GPUTexture;
    getTextureDimensionality(): TextureDimensionality;
    getMipLevelCount(): number;
    getGPUTextureView(): GPUTextureView;
    getGPUTextureViewLod(lod?: number): GPUTextureView;
    generateMipmaps(): boolean;
    getGPUSampler(): GPUSampler;
    destroy(): void;
}
export declare class CubeTexture extends TextureBase {
    dimensions: number[];
    constructor(dimensions: number[]);
    private texture;
    private textureView;
    private sampler;
    getGPUTextureFormat(): GPUTextureFormat;
    canUseAsRengerTarget(): boolean;
    getGPUTexture(): GPUTexture;
    getTextureDimensionality(): TextureDimensionality;
    getMipLevelCount(): number;
    getGPUTextureView(): GPUTextureView;
    getGPUTextureViewLod(lod?: number): GPUTextureView;
    generateMipmaps(): boolean;
    getGPUSampler(): GPUSampler;
    static createFromBitmap(bitmaps: ImageBitmap[]): Promise<CubeTexture>;
    static createFromHtmlImage(images: HTMLImageElement[]): Promise<CubeTexture>;
    static createFromURL(urls: string[]): Promise<CubeTexture>;
    destroy(): void;
}
export declare function isTexture(x: any): boolean;
