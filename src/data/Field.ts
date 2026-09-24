import type { SNodeTree } from './SNodeTree';
import { PrimitiveType, Type, TypeUtils } from '../language/frontend/Type';
import { Program } from '../program/Program';
import { assert, error } from '../utils/Logging';
import { elementToInt32Array, groupElements, reshape, toElement } from '../utils/Utils';

export class Field {
    constructor(
        public snodeTree: SNodeTree,
        public offsetBytes: number,
        public sizeBytes: number,
        public dimensions: number[],
        public elementType: Type
    ) {}

    async toArray1D(): Promise<number[]> {
        if (TypeUtils.isTensorType(this.elementType)) {
            let copy = await Program.getCurrentProgram().runtime!.deviceToHost(this);
            if (TypeUtils.getPrimitiveType(this.elementType) === PrimitiveType.f32) {
                return Array.from(copy.floatArray);
            } else {
                return Array.from(copy.intArray);
            }
        } else {
            error('toArray1D can only be used for scalar/vector/matrix fields');
            return [];
        }
    }

    async toInt32Array(): Promise<number[]> {
        let copy = await Program.getCurrentProgram().runtime!.deviceToHost(this);
        return Array.from(copy.intArray);
    }

    /** Returns the raw Float32Array without JS array conversion. Faster than toArray1D(). */
    async toFloat32Array(): Promise<Float32Array> {
        if (TypeUtils.isTensorType(this.elementType)) {
            let copy = await Program.getCurrentProgram().runtime!.deviceToHost(this);
            return copy.floatArray;
        } else {
            error('toFloat32Array can only be used for scalar/vector/matrix fields');
            return new Float32Array(0);
        }
    }

    /** Returns the raw Int32Array without JS array conversion. Faster than toInt32Array(). */
    async toTypedInt32Array(): Promise<Int32Array> {
        let copy = await Program.getCurrentProgram().runtime!.deviceToHost(this);
        return copy.intArray;
    }

    /**
     * Raw-buffer one-shot host->device upload. Skips BOTH JS number-array
     * stages the fromArray1D path pays (values: number[] allocation, then
     * Float32Array.from) — hands hostToDevice the incoming Float32Array's
     * buffer as an Int32Array view directly, so upload cost is one memcpy
     * into mapped staging. The write-side twin of toFloat32Array().
     */
    async fromFloat32Array(data: Float32Array, offsetBytes: number = 0) {
        this.ensureMaterialized();
        if (!TypeUtils.isTensorType(this.elementType)) {
            error('fromFloat32Array can only be used for scalar/vector/matrix fields');
            return;
        }
        if (data.byteLength + offsetBytes > this.sizeBytes) {
            error(`fromFloat32Array: ${data.byteLength}B + offset ${offsetBytes}B exceeds field size ${this.sizeBytes}B`);
        }
        let intArray = new Int32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
        await Program.getCurrentProgram().runtime!.hostToDevice(this, intArray, offsetBytes);
    }

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
    async fromFloat32ArrayAsync(data: Float32Array, offsetBytes: number = 0) {
        this.ensureMaterialized();
        if (!TypeUtils.isTensorType(this.elementType)) {
            error('fromFloat32ArrayAsync can only be used for scalar/vector/matrix fields');
            return;
        }
        if (data.byteLength + offsetBytes > this.sizeBytes) {
            error(`fromFloat32ArrayAsync: ${data.byteLength}B + offset ${offsetBytes}B exceeds field size ${this.sizeBytes}B`);
        }
        let intArray = new Int32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
        Program.getCurrentProgram().runtime!.hostToDeviceAsync(this, intArray, offsetBytes);
    }

    private ensureMaterialized() {
        Program.getCurrentProgram().materializeCurrentTree();
    }

    async toArray(): Promise<any[]> {
        this.ensureMaterialized();
        let copy = await Program.getCurrentProgram().runtime!.deviceToHost(this);
        let elements1D = groupElements(copy.intArray, copy.floatArray, this.elementType);
        return reshape(elements1D, this.dimensions);
    }

    static async toArrays(fields: Field[]): Promise<any[][]> {
        if (fields.length === 0) {
            return [];
        }
        for (let field of fields) {
            field.ensureMaterialized();
        }
        let copies = await Program.getCurrentProgram().runtime!.deviceToHostMultiple(fields);
        let results: any[][] = [];
        for (let i = 0; i < fields.length; ++i) {
            let copy = copies[i];
            let elements1D = groupElements(copy.intArray, copy.floatArray, fields[i].elementType);
            results.push(reshape(elements1D, fields[i].dimensions));
        }
        return results;
    }

    async get(indices: number[]): Promise<any> {
        this.ensureMaterialized();
        if (indices.length !== this.dimensions.length) {
            error(`indices dimensions mismatch, expecting ${this.dimensions.length}, received ${indices.length}`);
        }
        for (let i = 0; i < indices.length; ++i) {
            assert(indices[i] < this.dimensions[i], 'index out of bounds');
        }
        let index = 0;
        for (let i = 0; i < indices.length - 1; ++i) {
            index = (index + indices[i]) * this.dimensions[i + 1];
        }
        index += indices[indices.length - 1];
        let elementSizeBytes = this.elementType.getPrimitivesList().length * 4;
        let offsetBytes = elementSizeBytes * index;
        let copy = await Program.getCurrentProgram().runtime!.deviceToHost(this, offsetBytes, elementSizeBytes);
        return toElement(copy.intArray, copy.floatArray, this.elementType);
    }

    async fromArray1D(values: number[] | Int32Array, offsetBytes: number = 0) {
        assert(
            TypeUtils.isTensorType(this.elementType),
            'fromArray1D can only be used on fields of scalar/vector/matrix types'
        );
        this.ensureMaterialized();
        // Full upload keeps the historical exact-size check; scoped
        // uploads (any offset, including 0 for leading rows) must fit
        // inside the field. Int32Array input skips a copy on i32 fields.
        if (offsetBytes === 0 && values.length * 4 === this.sizeBytes) {
            // full upload — nothing more to check
        } else {
            assert(offsetBytes + values.length * 4 <= this.sizeBytes, 'scoped upload out of bounds');
        }

        if (TypeUtils.getPrimitiveType(this.elementType) === PrimitiveType.i32) {
            let intArray = values instanceof Int32Array ? values : Int32Array.from(values);
            await Program.getCurrentProgram().runtime!.hostToDevice(this, intArray, offsetBytes);
        } else {
            // Numeric conversion either way (Int32Array input converts
            // int->float per element, never reinterprets bits).
            let floatArray = Float32Array.from(values as any);
            let intArray = new Int32Array(floatArray.buffer);
            await Program.getCurrentProgram().runtime!.hostToDevice(this, intArray, offsetBytes);
        }
    }

    /**
     * Row-scoped struct-field write (ilmato #93): converts + uploads a
     * contiguous run of top-level rows starting at startIndex, instead of
     * the whole field. Same per-row conversion as fromArray, but only over
     * the slice — the fix for per-tick full re-uploads of descriptor
     * buffers where 1–2 rows change. offsetBytes covers the preceding rows.
     */
    async fromRows(values: any[], startIndex: number) {
        this.ensureMaterialized();
        assert(Array.isArray(values) && values.length > 0, 'fromRows needs a non-empty row array');
        assert(Number.isInteger(startIndex) && startIndex >= 0, 'fromRows needs a valid startIndex');
        assert(
            startIndex + values.length <= this.dimensions[0],
            'fromRows range out of bounds'
        );
        // Validate nesting depth against the field dimensions (first row is
        // representative; the converter enforces per-row shape after this).
        let curr: any = values[0];
        for (let i = 1; i < this.dimensions.length; ++i) {
            if (!Array.isArray(curr)) {
                error('expecting array');
            }
            curr = curr[0];
        }
        let values1D = values.flat(this.dimensions.length - 1);

        let int32Arrays: Int32Array[] = [];
        for (let val of values1D) {
            int32Arrays.push(elementToInt32Array(val, this.elementType));
        }

        let elementLength = int32Arrays[0].length;
        let totalLength = int32Arrays.length * elementLength;
        let result = new Int32Array(totalLength);
        for (let i = 0; i < int32Arrays.length; i++) {
            result.set(int32Arrays[i], i * elementLength);
        }

        let offsetBytes = startIndex * elementLength * 4;
        await Program.getCurrentProgram().runtime!.hostToDevice(this, result, offsetBytes);
    }

    async fromArray(values: any) {
        this.ensureMaterialized();
        let curr = values;
        for (let i = 0; i < this.dimensions.length; ++i) {
            if (!Array.isArray(curr)) {
                error('expecting array');
            }
            if (curr.length !== this.dimensions[i]) {
                error('array size mismatch');
            }
            curr = curr[0];
        }
        let values1D = values.flat(this.dimensions.length - 1);

        let int32Arrays: Int32Array[] = [];
        // slow. hmm. fix later
        for (let val of values1D) {
            int32Arrays.push(elementToInt32Array(val, this.elementType));
        }

        let elementLength = int32Arrays[0].length;
        let totalLength = int32Arrays.length * elementLength;
        let result = new Int32Array(totalLength);
        for (let i = 0; i < int32Arrays.length; ++i) {
            result.set(int32Arrays[i], i * elementLength);
        }

        await Program.getCurrentProgram().runtime!.hostToDevice(this, result);
    }

    async fromArrayScoped(values: any, startIndex: number | null = null, endIndex: number | null = null) {
        // like slice, extracts up to but not including end index
        this.ensureMaterialized();
        let curr = values;
        for (let i = 0; i < this.dimensions.length; ++i) {
            if (!Array.isArray(curr)) {
                error('expecting array');
            }
            if (curr.length !== this.dimensions[i]) {
                error('array size mismatch');
            }
            curr = curr[0];
        }
        endIndex = endIndex ?? values.length;
        startIndex = startIndex ?? 0;
        let values1D = values.slice(startIndex, endIndex).flat(curr.length - 1);

        let int32Arrays: Int32Array[] = [];

        for (let val of values1D) {
            int32Arrays.push(elementToInt32Array(val, this.elementType));
        }

        let elementLength = int32Arrays[0].length;
        // let totalLength = (endIndex - startIndex) * elementLength;
        let totalLength = int32Arrays.length * elementLength;
        let result = new Int32Array(totalLength);

        for (let i = 0; i < int32Arrays.length; i++) {
            result.set(int32Arrays[i], i * elementLength);
        }

        let offsetBytes = startIndex * elementLength;

        await Program.getCurrentProgram().runtime!.hostToDevice(this, result, offsetBytes);
    }
    
    async set(indices: number[], value: any) {
        this.ensureMaterialized();
        if (indices.length !== this.dimensions.length) {
            error(`indices dimensions mismatch, expecting ${this.dimensions.length}, received ${indices.length}`);
        }
        for (let i = 0; i < indices.length; ++i) {
            assert(indices[i] < this.dimensions[i], 'index out of bounds');
        }
        let index = 0;
        for (let i = 0; i < indices.length - 1; ++i) {
            index = (index + indices[i]) * this.dimensions[i + 1];
        }
        index += indices[indices.length - 1];
        let elementSizeBytes = this.elementType.getPrimitivesList().length * 4;
        let offsetBytes = elementSizeBytes * index;

        let intArray = elementToInt32Array(value, this.elementType);
        await Program.getCurrentProgram().runtime!.hostToDevice(this, intArray, offsetBytes);
    }

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
    destroy() {
        this.snodeTree?.destroy();
    }
}
