import { Field } from '../../data/Field';
import { CanvasTexture, DepthTexture, Texture } from '../../data/Texture';
declare class SetImage {
    htmlCanvas: HTMLCanvasElement;
    VBO: Field;
    IBO: Field;
    renderTarget: CanvasTexture;
    renderFieldKernel: (...args: any[]) => any;
    renderTextureKernel: (...args: any[]) => any;
    renderDepthTextureKernel: (...args: any[]) => any;
    constructor(htmlCanvas: HTMLCanvasElement);
    render(image: Field | Texture | DepthTexture): Promise<void>;
    private destroyed;
    /**
     * Release every GPU resource this helper owns: the fullscreen-quad vertex/
     * index fields (each backed by its own SNodeTree) and the canvas render
     * target texture. The compiled kernels stay in the program's kernel cache
     * (they are program-scoped, not per-canvas). Idempotent.
     */
    destroy(): void;
}
export { SetImage };
