import { Runtime } from '../runtime/Runtime';
import { SNodeTree } from '../data/SNodeTree';
import { Scope } from '../language/frontend/Scope';
import { DepthTexture, TextureBase } from '../data/Texture';
import { PrimitiveType } from '../language/frontend/Type';

export interface ProgramOptions {
    printIR: boolean;
    printWGSL: boolean;
}

class Program {
    options: ProgramOptions = {
        printIR: false,
        printWGSL: false,
    };
    async init(options?: ProgramOptions) {
        if (options && options.printIR !== undefined) {
            this.options.printIR = options.printIR;
        }
        if (options && options.printWGSL !== undefined) {
            this.options.printWGSL = options.printWGSL;
        }
        await this.materializeRuntime();
        this.clearKernelScope();
    }

    runtime: Runtime | null = null;

    partialTree: SNodeTree;

    kernelScope: Scope;

    private static instance: Program;
    private constructor() {
        this.partialTree = new SNodeTree();
        this.partialTree.treeId = 0;
        this.kernelScope = new Scope();
    }

    public static getCurrentProgram(): Program {
        if (!Program.instance) {
            Program.instance = new Program();
        }
        return Program.instance;
    }

    getAllocCount(): number {
        return this.runtime ? this.runtime.allocCount : 0;
    }

    async materializeRuntime() {
        if (!this.runtime) {
            this.runtime = new Runtime();
            await this.runtime.init();
        }
    }
    materializeCurrentTree() {
        if (this.partialTree.size === 0) {
            return;
        }
        if (this.runtime == null) {
            this.materializeRuntime();
        }
        this.runtime!.materializeTree(this.partialTree);
        let nextId = this.partialTree.treeId + 1;
        this.partialTree = new SNodeTree();
        this.partialTree.treeId = nextId;
    }

    /**
     * Destroy the runtime and all GPU resources it owns: SNodeTree root buffers,
     * textures, global buffers, the device, and the adapter. Essential to
     * prevent unbounded GPU memory growth when re-initializing tinyti (e.g.
     * graph reload, device-loss recovery, or app teardown).
     * After calling, a fresh init() is required before any further API use.
     */
    destroyRuntime() {
        if (this.runtime) {
            this.runtime.destroy();
            this.runtime = null;
        }
        this.partialTree = new SNodeTree();
        this.partialTree.treeId = 0;
        this.kernelScope = new Scope();
    }
    addTexture(texture: TextureBase) {
        let id = this.runtime!.textures.length;
        texture.textureId = id;
        this.runtime!.addTexture(texture);
    }

    addToKernelScope(obj: any) {
        for (let name in obj) {
            this.kernelScope.addStored(name, obj[name]);
        }
    }

    clearKernelScope() {
        this.kernelScope = new Scope();
    }
}

export { Program };
