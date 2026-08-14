/// <reference types="dist" />
import { Field } from './Field';
import { Type } from '../language/frontend/Type';
declare class SNodeTree {
    treeId: number;
    fields: Field[];
    size: number;
    rootBuffer: GPUBuffer | null;
    fragmentShaderWritable: boolean;
    constructor();
    addNaiveDenseField(elementType: Type, dimensionsArg: number[] | number): Field;
    /**
     * Explicitly free the root GPU buffer backing this tree's fields.
     * tinyti has no GC for GPU buffers — SNodeTrees are pushed onto
     * Runtime.materializedTrees[] and accumulate forever unless explicitly
     * destroyed. Called by Runtime.destroy() and FFA lifecycle management.
     */
    destroy(): void;
}
export { SNodeTree };
