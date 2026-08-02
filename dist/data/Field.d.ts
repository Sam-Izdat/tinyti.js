import type { SNodeTree } from './SNodeTree';
import { Type } from '../language/frontend/Type';
declare class Field {
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
}
export { Field };
