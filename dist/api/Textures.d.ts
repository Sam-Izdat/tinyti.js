import { CanvasTexture, CubeTexture, DepthTexture, Texture, TextureArray, Sampler, TextureSamplingOptions, WrapMode, FilterMode, TextureDataType } from '../data/Texture';
declare let texture: (numComponents: number, dimensions: number[], sampleCount?: number, sampler?: Sampler | null, mipLevelCount?: number, dtype?: TextureDataType) => Texture;
declare let canvasTexture: (canvas: HTMLCanvasElement, sampleCount?: number) => CanvasTexture;
declare let depthTexture: (dimensions: number[], sampleCount?: number) => DepthTexture;
declare let textureArray: (numComponents: number, width: number, height: number, layers: number, sampleCount?: number, sampler?: Sampler | null, mipLevelCount?: number, dtype?: TextureDataType) => TextureArray;
export { texture, canvasTexture, depthTexture, textureArray, Texture, TextureArray, Sampler, CubeTexture, TextureSamplingOptions, WrapMode, FilterMode, TextureDataType };
