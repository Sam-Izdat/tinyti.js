import { Field } from '../../data/Field';
import { Texture } from '../Textures';
import { DepthTexture } from '../../data/Texture';
declare class Canvas {
    htmlCanvas: HTMLCanvasElement;
    constructor(htmlCanvas: HTMLCanvasElement);
    private setImageObj;
    setImage(image: Field | Texture | DepthTexture): Promise<void>;
    /**
     * Release the GPU resources backing this canvas (vertex/index fields and
     * the render-target texture). The canvas element itself and its WebGPU
     * context remain owned by the caller/browser. Idempotent.
     */
    destroy(): void;
}
export { Canvas };
