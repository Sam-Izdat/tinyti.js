import { Program } from '../program/Program';
import { assert, error } from '../utils/Logging';
import { WebGPUSinglePassDownsampler, SPDFilters } from '../vendor/wgpuspd';

export enum TextureDimensionality {
    Dim2d,
    Dim3d,
    DimCube,
    Dim2dArray,
}

const downsampler = new WebGPUSinglePassDownsampler(null);

export function getTextureCoordsNumComponents(dim: TextureDimensionality): number {
    switch (dim) {
        case TextureDimensionality.Dim2d: {
            return 2;
        }
        case TextureDimensionality.Dim2dArray: {
            // uv stays a vec2; the layer rides a separate scalar operand
            // (WGSL textureSampleLevel(t, s, uv, layer, lod) form).
            return 2;
        }
        case TextureDimensionality.DimCube: {
            return 3;
        }
        case TextureDimensionality.Dim3d: {
            return 3;
        }
        default: {
            error('unrecognized dimensionality');
            return 2;
        }
    }
}

export abstract class TextureBase {
    abstract getGPUTextureFormat(): GPUTextureFormat;
    abstract canUseAsRengerTarget(): boolean;
    abstract getGPUTexture(): GPUTexture;
    abstract getGPUTextureView(): GPUTextureView;
    abstract getGPUTextureViewLod(lod:number): GPUTextureView;
    abstract generateMipmaps(): boolean;
    abstract getGPUSampler(): GPUSampler | null; // TODO rethink this... samplers and texture probably should be decoupled?
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
    destroyed: boolean = false;
    textureId: number = -1;
    sampleCount: number = 1;
}

export enum WrapMode {
    Repeat = 'repeat',
    ClampToEdge = 'clamp-to-edge',
    MirrorRepeat = 'mirror-repeat',
}

export enum FilterMode {
    Linear = 'linear',
    Nearest = 'nearest',
}

export enum TextureDataType {
    float16 = 1,
    float32 = 2,
}

export interface TextureSamplingOptions {
    wrapModeU?: WrapMode;
    wrapModeV?: WrapMode;
    wrapModeW?: WrapMode;
    magFilter?: FilterMode;
    minFilter?: FilterMode;
    mipmapFilter?: FilterMode;
}

export class Sampler {
    constructor(public samplingOptions: TextureSamplingOptions) {
        this.gpuSampler = Program.getCurrentProgram().runtime!.createGPUSampler(false, samplingOptions);
    }
    public gpuSampler: GPUSampler;
}

export class Texture extends TextureBase {
    constructor(
        public numComponents: number,
        public dimensions: number[],
        sampleCount: number,
        sampler?: Sampler | null,
        mipLevelCount: number = 1,
        dtype: TextureDataType = TextureDataType.float16,
    ) {
        super();
        this.sampleCount = sampleCount;
        this.mipLevelCount = mipLevelCount;
        this.dtype = dtype;
        assert(dimensions.length <= 3 && dimensions.length >= 1, 'texture dimensions must be >= 1 and <= 3');
        assert(
            numComponents === 1 || numComponents === 2 || numComponents === 4,
            'texture component count must be 1, 2, or 4'
        );

        this.texture = Program.getCurrentProgram().runtime!.createGPUTexture(
            dimensions,
            this.getTextureDimensionality(),
            this.getGPUTextureFormat(),
            this.canUseAsRengerTarget(),
            true,
            1,
            mipLevelCount
        );
        if (this.sampleCount > 1) {
            this.multiSampledRenderTexture = Program.getCurrentProgram().runtime!.createGPUTexture(
                dimensions,
                this.getTextureDimensionality(),
                this.getGPUTextureFormat(),
                this.canUseAsRengerTarget(),
                false,
                sampleCount,
                mipLevelCount
            );
        }
        
        Program.getCurrentProgram().addTexture(this);
        this.textureView = this.texture.createView();
        this.mipLevelViews = []
        for (let i = 0; i < this.mipLevelCount; i++) {
            this.mipLevelViews.push(this.texture.createView({
                baseMipLevel: i,
                mipLevelCount: 1,
            }));
        }
        // this.sampler = Program.getCurrentProgram().runtime!.createGPUSampler(false, samplingOptions);
        this.sampler = sampler?.gpuSampler ?? null;
    }

    private texture: GPUTexture;
    private textureView: GPUTextureView;
    private mipLevelViews: GPUTextureView[];
    private sampler: GPUSampler | null = null;
    multiSampledRenderTexture: GPUTexture | null = null;
    private mipLevelCount: number;
    private dtype: TextureDataType;

    getGPUTextureFormat(): GPUTextureFormat {
        if (this.dtype == TextureDataType.float16){
            switch (this.numComponents) {
                // 32bit float types cannot be filtered (and thus sampled)
                case 1:
                    return 'r16float';
                case 2:
                    return 'rg16float';
                case 4:
                    return 'rgba16float';
                default:
                    error('unsupported component count');
                    return 'rgba16float';
            }   
        } else if (this.dtype == TextureDataType.float32) {
            switch (this.numComponents) {
                // 32bit float types cannot be filtered (and thus sampled)
                case 1:
                    return 'r32float';
                case 2:
                    return 'rg32float';
                case 4:
                    return 'rgba32float';
                default:
                    error('unsupported component count');
                    return 'rgba32float';
            }
        }

        return 'rgba16float';
    }

    canUseAsRengerTarget() {
        return true;
    }

    getGPUTexture(): GPUTexture {
        return this.texture;
    }

    getGPUTextureView(): GPUTextureView {
        return this.textureView;
    }

    getGPUTextureViewLod(lod: number = 0): GPUTextureView {
        return this.mipLevelViews[lod];
    }

    generateMipmaps(filter: string = 'average') {
        let filterID = SPDFilters.Average;
        if (filter == 'max'){
            filterID = SPDFilters.Max;
        } else if (filter == 'min') {
            filterID = SPDFilters.Min;
        } else if (filter == 'minmax') {
            filterID = SPDFilters.MinMax;
        }
        downsampler.generateMipmaps(Program.getCurrentProgram().runtime!.device!, this.texture, {filter: filterID});
        return true;
    }

    getGPUSampler(): GPUSampler | null {
        return this.sampler;
    }

    getTextureDimensionality(): TextureDimensionality {
        switch (this.dimensions.length) {
            case 2:
                return TextureDimensionality.Dim2d;
            case 3:
                return TextureDimensionality.Dim3d;
            default:
                error('unsupported dimensionality');
                return TextureDimensionality.Dim2d;
        }
    }

    getMipLevelCount(): number {
        return this.mipLevelCount;
    }

    async copyFrom(src: Texture) {
        assert(this.getTextureDimensionality() === src.getTextureDimensionality(), 'texture dimensionality mismatch');
        for (let i = 0; i < this.dimensions.length; ++i) {
            assert(this.dimensions[i] === src.dimensions[i], 'texture shape mismatch');
        }
        await Program.getCurrentProgram().runtime!.copyTextureToTexture(
            src.getGPUTexture(),
            this.getGPUTexture(),
            this.dimensions
        );
    }

    static async createFromBitmap(
        bitmap: ImageBitmap, 
        sampleCount: number = 1, 
        sampler: Sampler = new Sampler({}), 
        mipLevelCount: number = 1,
        dtype: TextureDataType = TextureDataType.float16) {
        let dimensions = [bitmap.width, bitmap.height];
        let texture = new Texture(4, dimensions, sampleCount, sampler, mipLevelCount, dtype);
        await Program.getCurrentProgram().runtime!.copyImageBitmapToTexture(bitmap, texture.getGPUTexture());
        return texture;
    }

    static async createFromHtmlImage(
        image: HTMLImageElement, 
        sampleCount: number = 1, 
        sampler: Sampler = new Sampler({}), 
        mipLevelCount: number = 1,
        dtype: TextureDataType = TextureDataType.float16) {
        let bitmap = await createImageBitmap(image);
        return await this.createFromBitmap(bitmap, sampleCount, sampler, mipLevelCount, dtype);
    }
    static async createFromURL(
        url: string, 
        sampleCount: number = 1, 
        sampler: Sampler = new Sampler({}), 
        mipLevelCount: number = 1,
        dtype: TextureDataType = TextureDataType.float16): Promise<Texture> {
        let img = new Image();
        img.src = url;
        await img.decode();
        return await this.createFromHtmlImage(img, sampleCount, sampler, mipLevelCount, dtype);
    }

    destroy() {
        this.texture.destroy();
        this.multiSampledRenderTexture?.destroy();
        this.multiSampledRenderTexture = null;
        this.destroyed = true;
    }
}

// 2D texture array (ilmato premium tier, tinyti 0.1.9): ONE binding for N
// same-size layers — no atlas gutters, no per-texture bindings. All layers
// share dims/format/mips; each layer is an independent mip chain.
// Uploads are explicit per-(layer, lod) kernel stores
// (textureStoreArrayLod); sampling is explicit-LOD
// (textureSampleArrayLod) so residency clamping stays host-driven.
// Multisampling and auto-mipgen are v1 out of scope (asserted).
export class TextureArray extends TextureBase {
    constructor(
        public numComponents: number,
        public width: number,
        public height: number,
        public layers: number,
        sampleCount: number = 1,
        sampler?: Sampler | null,
        mipLevelCount: number = 1,
        dtype: TextureDataType = TextureDataType.float16,
    ) {
        super();
        assert(Number.isInteger(width) && width > 0, 'array width must be a positive int');
        assert(Number.isInteger(height) && height > 0, 'array height must be a positive int');
        assert(Number.isInteger(layers) && layers > 0, 'array layer count must be a positive int');
        assert(sampleCount === 1, 'multisampled texture arrays not supported yet');
        assert(
            numComponents === 1 || numComponents === 2 || numComponents === 4,
            'texture component count must be 1, 2, or 4'
        );
        this.sampleCount = sampleCount;
        this.mipLevelCount = mipLevelCount;
        this.dtype = dtype;
        this.dimensions = [width, height];

        this.texture = Program.getCurrentProgram().runtime!.createGPUTexture(
            this.dimensions,
            this.getTextureDimensionality(),
            this.getGPUTextureFormat(),
            this.canUseAsRengerTarget(),
            true,
            1,
            mipLevelCount,
            layers
        );
        Program.getCurrentProgram().addTexture(this);
        this.textureView = this.texture.createView({ dimension: '2d-array' });
        this.mipLevelViews = [];
        for (let i = 0; i < this.mipLevelCount; i++) {
            this.mipLevelViews.push(this.texture.createView({
                dimension: '2d-array',
                baseMipLevel: i,
                mipLevelCount: 1,
            }));
        }
        this.sampler = sampler?.gpuSampler ?? null;
    }

    dimensions: number[];
    private texture: GPUTexture;
    private textureView: GPUTextureView;
    private mipLevelViews: GPUTextureView[];
    private sampler: GPUSampler | null = null;
    private mipLevelCount: number;
    private dtype: TextureDataType;

    getGPUTextureFormat(): GPUTextureFormat {
        if (this.dtype == TextureDataType.float16) {
            switch (this.numComponents) {
                case 1:
                    return 'r16float';
                case 2:
                    return 'rg16float';
                case 4:
                    return 'rgba16float';
                default:
                    error('unsupported component count');
                    return 'rgba16float';
            }
        } else if (this.dtype == TextureDataType.float32) {
            switch (this.numComponents) {
                case 1:
                    return 'r32float';
                case 2:
                    return 'rg32float';
                case 4:
                    return 'rgba32float';
                default:
                    error('unsupported component count');
                    return 'rgba32float';
            }
        }
        return 'rgba16float';
    }

    canUseAsRengerTarget() {
        return true;
    }

    getGPUTexture(): GPUTexture {
        return this.texture;
    }

    getGPUTextureView(): GPUTextureView {
        return this.textureView;
    }

    getGPUTextureViewLod(lod: number = 0): GPUTextureView {
        return this.mipLevelViews[lod];
    }

    getTextureDimensionality(): TextureDimensionality {
        return TextureDimensionality.Dim2dArray;
    }

    getMipLevelCount(): number {
        return this.mipLevelCount;
    }

    getGPUSampler(): GPUSampler | null {
        return this.sampler;
    }

    generateMipmaps(filter: string = 'average'): boolean {
        // In-place single-pass downsample: the vendored SPD core iterates
        // array layers itself (2d-array views with baseArrayLayer strides),
        // so one call covers every layer. Fallback path only — the primary
        // premium-tier upload is explicit per-mip stores from the RAM
        // pyramid (authored Kaiser quality, parity with the bulk tier).
        let filterID = SPDFilters.Average;
        if (filter == 'max') {
            filterID = SPDFilters.Max;
        } else if (filter == 'min') {
            filterID = SPDFilters.Min;
        } else if (filter == 'minmax') {
            filterID = SPDFilters.MinMax;
        }
        downsampler.generateMipmaps(Program.getCurrentProgram().runtime!.device!, this.texture, { filter: filterID });
        return true;
    }

    destroy() {
        this.texture.destroy();
        this.destroyed = true;
    }
}

export class CanvasTexture extends TextureBase {
    constructor(public htmlCanvas: HTMLCanvasElement, sampleCount: number) {
        super();
        let contextAndFormat = Program.getCurrentProgram().runtime!.createGPUCanvasContext(htmlCanvas);
        this.context = contextAndFormat[0];
        this.format = contextAndFormat[1];
        Program.getCurrentProgram().addTexture(this);
        this.sampler = Program.getCurrentProgram().runtime!.createGPUSampler(false, {});
        this.sampleCount = sampleCount;
        this.dimensions = [htmlCanvas.width, htmlCanvas.height];
        if (this.sampleCount > 1) {
            this.multiSampledRenderTexture = Program.getCurrentProgram().runtime!.createGPUTexture(
                this.dimensions,
                this.getTextureDimensionality(),
                this.getGPUTextureFormat(),
                this.canUseAsRengerTarget(),
                false,
                sampleCount
            );
        }
    }
    dimensions: number[];
    multiSampledRenderTexture: GPUTexture | null = null;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    private sampler: GPUSampler;

    getGPUTextureFormat(): GPUTextureFormat {
        return this.format;
    }

    canUseAsRengerTarget() {
        return true;
    }

    getGPUTexture(): GPUTexture {
        return this.context.getCurrentTexture();
    }

    getGPUTextureView(): GPUTextureView {
        return this.context.getCurrentTexture().createView();
    }

    getGPUTextureViewLod(lod:number = 0): GPUTextureView {
        return this.context.getCurrentTexture().createView();
    }

    generateMipmaps() {
        return false;
    }

    getGPUSampler(): GPUSampler {
        return this.sampler;
    }

    getTextureDimensionality(): TextureDimensionality {
        return TextureDimensionality.Dim2d;
    }

    getMipLevelCount(): number {
        return 1;
    }

    destroy() {
        this.multiSampledRenderTexture?.destroy();
        this.multiSampledRenderTexture = null;
        // CanvasTexture's GPUTexture is the swapchain-backed current texture;
        // its lifetime is tied to the canvas context. We don't destroy it
        // here (would break ongoing presentation). The context itself is
        // managed by the canvas element.
        this.destroyed = true;
    }
}

export class DepthTexture extends TextureBase {
    constructor(public dimensions: number[], sampleCount: number) {
        super();
        assert(dimensions.length === 2, 'depth texture must be 2D');
        this.texture = Program.getCurrentProgram().runtime!.createGPUTexture(
            dimensions,
            this.getTextureDimensionality(),
            this.getGPUTextureFormat(),
            this.canUseAsRengerTarget(),
            false,
            sampleCount
        );
        Program.getCurrentProgram().addTexture(this);
        this.textureView = this.texture.createView();
        this.sampler = Program.getCurrentProgram().runtime!.createGPUSampler(true, {});
        this.sampleCount = sampleCount;
    }

    private texture: GPUTexture;
    private textureView: GPUTextureView;
    private sampler: GPUSampler;

    getGPUTextureFormat(): GPUTextureFormat {
        return 'depth32float';
    }

    canUseAsRengerTarget() {
        return true;
    }

    getGPUTexture(): GPUTexture {
        return this.texture;
    }
    getTextureDimensionality(): TextureDimensionality {
        return TextureDimensionality.Dim2d;
    }
    getMipLevelCount(): number {
        return 1;
    }
    getGPUTextureView(): GPUTextureView {
        return this.textureView;
    }
    getGPUTextureViewLod(lod:number = 0): GPUTextureView {
        return this.textureView;
    }
    generateMipmaps() {
        // If mip support is added, min/max filter can be used like this:
        // downsampler.generateMipmaps(Program.getCurrentProgram().runtime!.device!, this.texture, {filter: SPDFilters.Max});
        return false;
    }
    getGPUSampler(): GPUSampler {
        return this.sampler;
    }

    destroy() {
        this.texture.destroy();
        this.destroyed = true;
    }
}

export class CubeTexture extends TextureBase {
    constructor(public dimensions: number[]) {
        super();
        assert(dimensions.length === 2, 'cube texture must be 2D');
        this.texture = Program.getCurrentProgram().runtime!.createGPUTexture(
            dimensions,
            this.getTextureDimensionality(),
            this.getGPUTextureFormat(),
            this.canUseAsRengerTarget(),
            false,
            1
        );
        Program.getCurrentProgram().addTexture(this);
        this.textureView = this.texture.createView({ dimension: 'cube' });
        this.sampler = Program.getCurrentProgram().runtime!.createGPUSampler(false, {});
        this.sampleCount = 1;
    }

    private texture: GPUTexture;
    private textureView: GPUTextureView;
    private sampler: GPUSampler;

    getGPUTextureFormat(): GPUTextureFormat {
        return 'rgba16float';
    }

    canUseAsRengerTarget() {
        return true;
    }

    getGPUTexture(): GPUTexture {
        return this.texture;
    }
    getTextureDimensionality(): TextureDimensionality {
        return TextureDimensionality.DimCube;
    }
    getMipLevelCount(): number {
        return 1;
    }
    getGPUTextureView(): GPUTextureView {
        return this.textureView;
    }
    getGPUTextureViewLod(lod:number = 0): GPUTextureView {
        return this.textureView;
    }
    generateMipmaps() {
        return false;
    }
    getGPUSampler(): GPUSampler {
        return this.sampler;
    }
    static async createFromBitmap(bitmaps: ImageBitmap[]): Promise<CubeTexture> {
        for (let bitmap of bitmaps) {
            assert(
                bitmap.width === bitmaps[0].width && bitmap.height === bitmaps[0].height,
                'all 6 images in a cube texture must have identical dimensions'
            );
        }

        let dimensions = [bitmaps[0].width, bitmaps[0].height];
        let texture = new CubeTexture(dimensions);
        await Program.getCurrentProgram().runtime!.copyImageBitmapsToCubeTexture(bitmaps, texture.getGPUTexture());
        return texture;
    }
    static async createFromHtmlImage(images: HTMLImageElement[]): Promise<CubeTexture> {
        let bitmaps: ImageBitmap[] = [];
        for (let img of images) {
            bitmaps.push(await createImageBitmap(img));
        }
        return await this.createFromBitmap(bitmaps);
    }
    static async createFromURL(urls: string[]): Promise<CubeTexture> {
        let imgs: HTMLImageElement[] = [];
        for (let url of urls) {
            let img = new Image();
            img.src = url;
            await img.decode();
            imgs.push(img);
        }
        return await this.createFromHtmlImage(imgs);
    }

    destroy() {
        this.texture.destroy();
        this.destroyed = true;
    }
}

export function isTexture(x: any) {
    return x instanceof Sampler || x instanceof Texture || x instanceof TextureArray || x instanceof CanvasTexture || x instanceof DepthTexture || x instanceof CubeTexture;
}
