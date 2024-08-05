import { CanvasTexture, CubeTexture, DepthTexture, Texture, Sampler, TextureSamplingOptions, WrapMode, FilterMode, TextureDataType } from '../data/Texture';
declare let texture: (numComponents: number, dimensions: number[], sampleCount?: number, sampler?: Sampler | null, mipLevelCount?: number, dtype?: TextureDataType) => Texture;
declare let canvasTexture: (canvas: HTMLCanvasElement, sampleCount?: number) => CanvasTexture;
declare let depthTexture: (dimensions: number[], sampleCount?: number) => DepthTexture;
export { texture, canvasTexture, depthTexture, Texture, Sampler, CubeTexture, TextureSamplingOptions, WrapMode, FilterMode, TextureDataType };
