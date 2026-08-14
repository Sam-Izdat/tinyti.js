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
     * Release the root GPU buffer and tombstone this tree. We do NOT remove
     * the tree from Runtime.materializedTrees[] — that array is indexed by
     * resourceID in compiled kernels, and splicing would shift all later
     * trees' indices, breaking bindings. Instead we free the real buffer
     * and replace it with a 1-byte dummy so the array slot stays valid
     * (kernels may still reference the ID, but the data is gone).
     */
    destroy(): void;
}
export { SNodeTree };
