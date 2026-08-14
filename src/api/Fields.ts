import { Program } from '../program/Program';
import { Field } from '../data/Field';
import { CanvasTexture, CubeTexture, DepthTexture, Texture } from '../data/Texture';
import { PrimitiveType, Type, ScalarType, VectorType, MatrixType, StructType } from '../language/frontend/Type';
import { product } from '../utils/Utils';
import { error } from '../utils/Logging';
import { FieldFactory } from '../data/FieldFactory';

export function field(
    type: PrimitiveType | Type,
    dimensions: number[] | number,
    fragmentShaderWritable: boolean = false
): Field {
    if (type === PrimitiveType.f32 || type === PrimitiveType.i32) {
        type = new ScalarType(type);
    }
    if (typeof dimensions === 'number') {
        dimensions = [dimensions];
    }
    return FieldFactory.createField(type, dimensions, fragmentShaderWritable);
}

export const Vector = {
    field: (
        n: number,
        primitiveType: PrimitiveType,
        dimensions: number[] | number,
        fragmentShaderWritable: boolean = false
    ): Field => {
        let elementType = new VectorType(primitiveType, n);
        return field(elementType, dimensions, fragmentShaderWritable);
    },
};

export const Matrix = {
    field: (
        n: number,
        m: number,
        primitiveType: PrimitiveType,
        dimensions: number[] | number,
        fragmentShaderWritable: boolean = false
    ): Field => {
        let elementType = new MatrixType(primitiveType, n, m);
        return field(elementType, dimensions, fragmentShaderWritable);
    },
};

export const Struct = {
    field: (members: any, dimensions: number[] | number, fragmentShaderWritable: boolean = false): Field => {
        let elementType = new StructType(members);
        return field(elementType, dimensions, fragmentShaderWritable);
    },
};

export function materializeFields() {
    Program.getCurrentProgram().materializeCurrentTree();
}

/** Destroy the tinyti runtime and release all GPU resources.
 *  After calling, `init()` must be called again before any other tinyti API use. */
export async function destroy() {
    Program.getCurrentProgram().destroyRuntime();
}

export async function toArrays(fields: Field[]): Promise<any[][]> {
    return Field.toArrays(fields);
}
