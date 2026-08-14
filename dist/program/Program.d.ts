import { Runtime } from '../runtime/Runtime';
import { SNodeTree } from '../data/SNodeTree';
import { Scope } from '../language/frontend/Scope';
import { TextureBase } from '../data/Texture';
export interface ProgramOptions {
    printIR: boolean;
    printWGSL: boolean;
}
declare class Program {
    options: ProgramOptions;
    init(options?: ProgramOptions): Promise<void>;
    runtime: Runtime | null;
    partialTree: SNodeTree;
    kernelScope: Scope;
    private static instance;
    private constructor();
    static getCurrentProgram(): Program;
    materializeRuntime(): Promise<void>;
    materializeCurrentTree(): void;
    /**
     * Destroy the runtime and all GPU resources it owns: SNodeTree root buffers,
     * textures, global buffers, the device, and the adapter. Essential to
     * prevent unbounded GPU memory growth when re-initializing tinyti (e.g.
     * graph reload, device-loss recovery, or app teardown).
     * After calling, a fresh init() is required before any further API use.
     */
    destroyRuntime(): void;
    addTexture(texture: TextureBase): void;
    addToKernelScope(obj: any): void;
    clearKernelScope(): void;
}
export { Program };
