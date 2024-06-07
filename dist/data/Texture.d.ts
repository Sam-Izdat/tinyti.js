/// <reference types="dist" />
export declare enum TextureDimensionality {
    Dim2d = 0,
    Dim3d = 1,
    DimCube = 2
}
export declare function getTextureCoordsNumComponents(dim: TextureDimensionality): number;
export declare abstract class TextureBase {
    abstract getGPUTextureFormat(): GPUTextureFormat;
    abstract canUseAsRengerTarget(): boolean;
    abstract getGPUTexture(): GPUTexture;
    abstract getGPUTextureView(): GPUTextureView;
    abstract getGPUTextureViewLod(lod: number): GPUTextureView;
    abstract generateMipmaps(): boolean;
    abstract getGPUSampler(): GPUSampler;
    abstract getTextureDimensionality(): TextureDimensionality;
    abstract getMipLevelCount(): number;
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
    constructor(numComponents: number, dimensions: number[], sampleCount: number, sampler: Sampler, mipLevelCount?: number);
    private texture;
    private textureView;
    private mipLevelViews;
    private sampler;
    multiSampledRenderTexture: GPUTexture | null;
    private mipLevelCount;
    getGPUTextureFormat(): GPUTextureFormat;
    canUseAsRengerTarget(): boolean;
    getGPUTexture(): GPUTexture;
    getGPUTextureView(): GPUTextureView;
    getGPUTextureViewLod(lod?: number): GPUTextureView;
    generateMipmaps(): boolean;
    getGPUSampler(): GPUSampler;
    getTextureDimensionality(): TextureDimensionality;
    getMipLevelCount(): number;
    copyFrom(src: Texture): Promise<void>;
    static createFromBitmap(bitmap: ImageBitmap, sampleCount?: number, sampler?: Sampler, mipLevelCount?: number): Promise<Texture>;
    static createFromHtmlImage(image: HTMLImageElement, sampleCount?: number, sampler?: Sampler, mipLevelCount?: number): Promise<Texture>;
    static createFromURL(url: string, sampleCount?: number, sampler?: Sampler, mipLevelCount?: number): Promise<Texture>;
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
}
export declare function isTexture(x: any): boolean;
