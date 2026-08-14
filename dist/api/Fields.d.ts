import { Field } from '../data/Field';
import { PrimitiveType, Type } from '../language/frontend/Type';
export declare function field(type: PrimitiveType | Type, dimensions: number[] | number, fragmentShaderWritable?: boolean): Field;
export declare const Vector: {
    field: (n: number, primitiveType: PrimitiveType, dimensions: number[] | number, fragmentShaderWritable?: boolean) => Field;
};
export declare const Matrix: {
    field: (n: number, m: number, primitiveType: PrimitiveType, dimensions: number[] | number, fragmentShaderWritable?: boolean) => Field;
};
export declare const Struct: {
    field: (members: any, dimensions: number[] | number, fragmentShaderWritable?: boolean) => Field;
};
export declare function materializeFields(): void;
/** Destroy the tinyti runtime and release all GPU resources.
 *  After calling, `init()` must be called again before any other tinyti API use. */
export declare function destroy(): Promise<void>;
export declare function toArrays(fields: Field[]): Promise<any[][]>;
