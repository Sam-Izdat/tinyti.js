import type { SNodeTree } from './SNodeTree';
import { Type } from '../language/frontend/Type';
export declare class Field {
    snodeTree: SNodeTree;
    offsetBytes: number;
    sizeBytes: number;
    dimensions: number[];
    elementType: Type;
    constructor(snodeTree: SNodeTree, offsetBytes: number, sizeBytes: number, dimensions: number[], elementType: Type);
    toArray1D(): Promise<number[]>;
    toInt32Array(): Promise<number[]>;
    /** Returns the raw Float32Array without JS array conversion. Faster than toArray1D(). */
    toFloat32Array(): Promise<Float32Array>;
    /** Returns the raw Int32Array without JS array conversion. Faster than toInt32Array(). */
    toTypedInt32Array(): Promise<Int32Array>;
    private ensureMaterialized;
    toArray(): Promise<any[]>;
    static toArrays(fields: Field[]): Promise<any[][]>;
    get(indices: number[]): Promise<any>;
    fromArray1D(values: number[]): Promise<void>;
    fromArray(values: any): Promise<void>;
    fromArrayScoped(values: any, startIndex?: number | null, endIndex?: number | null): Promise<void>;
    set(indices: number[], value: any): Promise<void>;
    /**
     * Release the GPU buffer backing this field's SNodeTree. Frees the
     * rootBuffer's GPU memory via SNodeTree.destroy().
     *
     * Safe because template kernels cache by field identity (templateArgs
     * in KernelFactory). A destroyed field is never dispatched again — the
     * caller has replaced it with a new field (new SNodeTree, new treeId,
     * new kernel instance). The tombstoned tree stays in
     * materializedTrees[] at its original index, but no live dispatch
     * references it.
     */
    destroy(): void;
}
