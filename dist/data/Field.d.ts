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
    /**
     * Raw-buffer one-shot host->device upload. Skips BOTH JS number-array
     * stages the fromArray1D path pays (values: number[] allocation, then
     * Float32Array.from) — hands hostToDevice the incoming Float32Array's
     * buffer as an Int32Array view directly, so upload cost is one memcpy
     * into mapped staging. The write-side twin of toFloat32Array().
     */
    fromFloat32Array(data: Float32Array, offsetBytes?: number): Promise<void>;
    /**
     * Fire-and-forget fromFloat32Array: submits the staging copy but does
     * NOT await onSubmittedWorkDone, so a pipeline of per-level uploads can
     * run ahead of the GPU (one final ti.sync at the sink call instead of
     * one per level). SAFE ONLY for fields the caller never re-writes until
     * after a later global sync — reuse of the same field (hostToDevice
     * staging overwrite while an earlier copy reads it) needs the awaited
     * variant. The write is ordered on the same queue, so fusing the drain
     * tail's sync is correct.
     */
    fromFloat32ArrayAsync(data: Float32Array, offsetBytes?: number): Promise<void>;
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
