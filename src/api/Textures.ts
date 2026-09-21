import { Program } from '../program/Program';
import { Field } from '../data/Field';
import { CanvasTexture, CubeTexture, DepthTexture, Texture, TextureArray, Sampler, TextureSamplingOptions, WrapMode, FilterMode, TextureDataType } from '../data/Texture';
import { PrimitiveType, Type, ScalarType, VectorType, MatrixType, StructType } from '../language/frontend/Type';
import { product } from '../utils/Utils';
import { error } from '../utils/Logging';
import { FieldFactory } from '../data/FieldFactory';

let texture = (
    numComponents: number,
    dimensions: number[],
    sampleCount: number = 1,
    sampler: Sampler | null = new Sampler({}),
    mipLevelCount: number = 1,
    dtype: TextureDataType = TextureDataType.float16,
) => {
    return new Texture(numComponents, dimensions, sampleCount, sampler, mipLevelCount, dtype);
};

let canvasTexture = (canvas: HTMLCanvasElement, sampleCount: number = 1) => {
    return new CanvasTexture(canvas, sampleCount);
};

let depthTexture = (dimensions: number[], sampleCount: number = 1) => {
    return new DepthTexture(dimensions, sampleCount);
};

let textureArray = (
    numComponents: number,
    width: number,
    height: number,
    layers: number,
    sampleCount: number = 1,
    sampler: Sampler | null = new Sampler({}),
    mipLevelCount: number = 1,
    dtype: TextureDataType = TextureDataType.float16,
) => {
    return new TextureArray(numComponents, width, height, layers, sampleCount, sampler, mipLevelCount, dtype);
};

export { texture, canvasTexture, depthTexture, textureArray, Texture, TextureArray, Sampler, CubeTexture, TextureSamplingOptions, WrapMode, FilterMode, TextureDataType};
