import { CanvasTexture, CubeTexture, DepthTexture, Texture, Sampler, TextureSamplingOptions, WrapMode, FilterMode } from '../data/Texture';
declare let texture: (numComponents: number, dimensions: number[], sampleCount?: number, sampler?: Sampler, mipLevelCount?: number) => Texture;
declare let canvasTexture: (canvas: HTMLCanvasElement, sampleCount?: number) => CanvasTexture;
declare let depthTexture: (dimensions: number[], sampleCount?: number) => DepthTexture;
export { texture, canvasTexture, depthTexture, Texture, Sampler, CubeTexture, TextureSamplingOptions, WrapMode, FilterMode };
