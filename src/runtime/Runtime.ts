import {
    CompiledTask,
    CompiledKernel,
    TaskParams,
    ResourceType,
    KernelParams,
    ResourceBinding,
    CompiledRenderPipeline,
    RenderPipelineParams,
    CompiledRenderPassInfo,
} from './Kernel';
import { SNodeTree } from '../data/SNodeTree';
import { divUp, elementToInt32Array, int32ArrayToElement } from '../utils/Utils';
import { assert, error } from '../utils/Logging';
import { Field } from '../data/Field';
import { TypeCategory } from '../language/frontend/Type';
import { TextureBase, TextureDimensionality, TextureSamplingOptions, isBlockCompressedFormat } from '../data/Texture';
import { PipelineCache } from './PipelineCache';
import { BufferPool, PooledBuffer } from './BufferPool';

class Runtime {
    adapter: GPUAdapter | null = null;
    device: GPUDevice | null = null;
    kernels: CompiledKernel[] = [];
    materializedTrees: SNodeTree[] = [];
    textures: TextureBase[] = [];
    allocCount: number = 0;

    private globalTmpsBuffer: GPUBuffer | null = null;
    private randStatesBuffer: GPUBuffer | null = null;
    private pipelineCache: PipelineCache | null = null;

    constructor() {}

    async init() {
        await this.createDevice();
        this.createGlobalTmpsBuffer();
        this.createRandStatesBuffer();
    }

    async createDevice() {
        let alertWebGPUError = () => {
            alert(`Webgpu not supported. Please ensure that you have Chrome v113+`);
        };
        if (!navigator.gpu) {
            alertWebGPUError();
        }
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance',
        });
        if (!adapter) {
            alertWebGPUError();
        }
        const requiredFeatures: GPUFeatureName[] = [];
        if (adapter!.features.has('indirect-first-instance')) {
            requiredFeatures.push('indirect-first-instance');
        }
        // Block-compressed source textures (DDS ingestion): desktop-universal,
        // but must be requested — unrequested, BC texture creation throws.
        if (adapter!.features.has('texture-compression-bc')) {
            requiredFeatures.push('texture-compression-bc');
        }

        const device = await adapter!.requestDevice({
            requiredFeatures,
            // ilmato 2026-09-19: large scenes (sponza-class) exceed the 128MB
            // default maxStorageBufferBindingSize (a 24-texture field arena
            // is ~216MB) and can exceed the 256MB default maxBufferSize.
            // Request the adapter max for both — always legal (min), never a
            // regression on weak adapters (they just report lower).
            // `as any`: the vendored TS lib predates these limit names.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            requiredLimits: {
                maxStorageBufferBindingSize: (adapter!.limits as any).maxStorageBufferBindingSize,
                maxBufferSize: (adapter!.limits as any).maxBufferSize,
                // ilmato 2026-09-24: array-pool layers exceed the 256 default
                // maxTextureArrayLayers (bistro-class needs ~300/class).
                // Request the adapter max — always legal (min), weak adapters
                // just report lower (callers spill to constants, never black).
                maxTextureArrayLayers: (adapter!.limits as any).maxTextureArrayLayers,
            },
        });
        if (!device) {
            alertWebGPUError();
        }
        this.device = device;
        this.adapter = adapter;
        this.pipelineCache = new PipelineCache(device);
    }

    createKernel(params: KernelParams): CompiledKernel {
        let kernel = new CompiledKernel();
        for (let taskParams of params.tasksParams) {
            if (taskParams instanceof TaskParams) {
                let task = new CompiledTask(taskParams, this);
                kernel.tasks.push(task);
            } else if (taskParams instanceof RenderPipelineParams) {
                assert(params.renderPassParams !== null);
                let task = new CompiledRenderPipeline(taskParams, params.renderPassParams!, this);
                kernel.tasks.push(task);
            }
        }
        if (params.renderPassParams !== null) {
            kernel.renderPassInfo = new CompiledRenderPassInfo(params.renderPassParams);
        }
        kernel.argTypes = params.argTypes;
        kernel.returnType = params.returnType;
        return kernel;
    }

    async sync() {
        await this.device!.queue.onSubmittedWorkDone();
    }

    async launchKernel(kernel: CompiledKernel, ...args: any[]): Promise<any> {
        assert(
            args.length === kernel.argTypes.length,
            `Kernel requires ${kernel.argTypes.length} arguments, but ${args.length} is provided`
        );

        let requiresArgsBuffer = false;
        let requiresRetsBuffer = false;
        let thisArgsBuffer: GPUBuffer | undefined = undefined;
        let thisRetsBufferGPU: PooledBuffer | undefined = undefined;
        let thisRetsBufferCPU: PooledBuffer | undefined = undefined;
        let argsSize: number = 0;
        let retsSize: number = 0;
        for (let task of kernel.tasks) {
            for (let binding of task.params.bindings) {
                if (binding.info.resourceType === ResourceType.Args) {
                    requiresArgsBuffer = true;
                }
                if (binding.info.resourceType === ResourceType.Rets) {
                    requiresRetsBuffer = true;
                }
            }
        }
        if (requiresArgsBuffer) {
            let numArgPrims = 0;
            for (let type of kernel.argTypes) {
                numArgPrims += type.getPrimitivesList().length;
            }

            let argData = new Int32Array(numArgPrims);
            let offset = 0;
            for (let i = 0; i < args.length; ++i) {
                let type = kernel.argTypes[i];
                let thisArgData = elementToInt32Array(args[i], type);
                argData.set(thisArgData, offset);
                offset += type.getPrimitivesList().length;
            }
            argsSize = numArgPrims * 4;
            thisArgsBuffer = this.addArgsBuffer(argsSize);
            new Int32Array(thisArgsBuffer.getMappedRange()).set(argData);
            thisArgsBuffer.unmap();
        }

        let retsBufferPoolGPU = BufferPool.getPool(this.device!, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
        let retsBufferPoolCPU = BufferPool.getPool(this.device!, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);

        if (requiresRetsBuffer) {
            retsSize = kernel.returnType.getPrimitivesList().length * 4;
            thisRetsBufferGPU = retsBufferPoolGPU.getBuffer(retsSize);
            thisRetsBufferCPU = retsBufferPoolCPU.getBuffer(retsSize);
        }

        let commandEncoder = this.device!.createCommandEncoder();
        let computeEncoder: GPUComputePassEncoder | null = null;
        let renderEncoder: GPURenderPassEncoder | null = null;

        let computeState: EncoderState = new EncoderState();
        let renderState: EncoderState = new EncoderState();

        let endCompute = () => {
            if (computeEncoder) {
                computeEncoder.end();
            }
            computeEncoder = null;
            computeState = new EncoderState();
        };
        let endRender = () => {
            if (renderEncoder) {
                renderEncoder.end();
            }
            renderEncoder = null;
            renderState = new EncoderState();
        };
        let beginCompute = () => {
            endRender();
            if (!computeEncoder) {
                computeEncoder = commandEncoder.beginComputePass();
                computeState = new EncoderState();
            }
        };
        let beginRender = () => {
            endCompute();
            if (!renderEncoder) {
                assert(kernel.renderPassInfo !== null, 'render pass info is null');
                renderEncoder = commandEncoder.beginRenderPass(kernel.renderPassInfo!.getGPURenderPassDescriptor());
                renderState = new EncoderState();
            }
        };

        let indirectPolyfills = new Map<CompiledRenderPipeline, IndirectPolyfillInfo>();
        for (let task of kernel.tasks) {
            if (task instanceof CompiledRenderPipeline) {
                if (task.params.indirectBuffer) {
                    if (task.params.indirectCount !== 1 || !this.supportsIndirectFirstInstance()) {
                        let polyfill = new IndirectPolyfillInfo(task.params.indirectBuffer, task.params.indirectCount);
                        await polyfill.fillInfo();
                        indirectPolyfills.set(task, polyfill);
                    }
                }
            }
        }

        for (let task of kernel.tasks) {
            task.bindGroup = this.device!.createBindGroup({
                layout: task.pipeline!.getBindGroupLayout(0),
                entries: this.getGPUBindGroupEntries(task.params.bindings, thisArgsBuffer, thisRetsBufferGPU?.buffer),
            });
            if (task instanceof CompiledTask) {
                beginCompute();
                if (computeState.computePipeline !== task.pipeline!) {
                    computeEncoder!.setPipeline(task.pipeline!);
                    computeState.computePipeline = task.pipeline!;
                }
                computeEncoder!.setBindGroup(0, task.bindGroup!);
                let workgroupSize = task.params.workgroupSize;
                let numWorkgroups = task.params.numWorkgroups;

                const maxWorkgroups = this.device!.limits.maxComputeWorkgroupsPerDimension;
                if (numWorkgroups > maxWorkgroups) {
                    throw new Error(
                        `tinyti dispatch guard: kernel requests ${numWorkgroups} workgroups ` +
                        `(workgroup ${workgroupSize}) > device limit ${maxWorkgroups}/dimension. ` +
                        `This would silently lose the GPU device. Reduce the dispatch range or ` +
                        `use a grid-stride kernel.`
                    );
                }

                computeEncoder!.dispatchWorkgroups(numWorkgroups);
            } else if (task instanceof CompiledRenderPipeline) {
                beginRender();
                if (renderState.renderPipeline !== task.pipeline!) {
                    renderEncoder!.setPipeline(task.pipeline!);
                    renderState.renderPipeline = task.pipeline!;
                }
                renderEncoder!.setBindGroup(0, task.bindGroup!);

                if (task.params.vertexBuffer) {
                    let vertexBufferTree = this.materializedTrees[task.params.vertexBuffer.snodeTree.treeId];
                    renderEncoder!.setVertexBuffer(
                        0,
                        vertexBufferTree.rootBuffer!,
                        task.params.vertexBuffer.offsetBytes,
                        task.params.vertexBuffer.sizeBytes
                    );
                }

                if (task.params.indexBuffer) {
                    let indexBufferTree = this.materializedTrees[task.params.indexBuffer.snodeTree.treeId];
                    renderEncoder!.setIndexBuffer(
                        indexBufferTree.rootBuffer!,
                        'uint32',
                        task.params.indexBuffer.offsetBytes,
                        task.params.indexBuffer.sizeBytes
                    );
                }
                if (!task.params.indirectBuffer) {
                    if (task.params.indexBuffer) {
                        renderEncoder!.drawIndexed(task.getVertexCount());
                    } else {
                        renderEncoder!.draw(task.getVertexCount());
                    }
                } else {
                    if (
                        task.params.indirectCount === 1 &&
                        this.supportsIndirectFirstInstance() &&
                        task.params.indirectBuffer instanceof Field
                    ) {
                        let indirectBufferTree = this.materializedTrees[task.params.indirectBuffer.snodeTree.treeId];
                        renderEncoder!.drawIndexedIndirect(
                            indirectBufferTree.rootBuffer!,
                            task.params.indirectBuffer.offsetBytes
                        );
                    } else {
                        assert(indirectPolyfills.has(task));
                        let polyfill = indirectPolyfills.get(task)!;
                        for (let draw of polyfill.commands) {
                            renderEncoder!.drawIndexed(
                                draw.indexCount,
                                draw.instanceCount,
                                draw.firstIndex,
                                draw.baseVertex,
                                draw.firstInstance
                            );
                        }
                    }
                }
            }
        }
        endCompute();
        endRender();
        this.device!.queue.submit([commandEncoder.finish()]);

        /**
         * launchKernel is an async function
         * when the user launches a kernel by writing `k()`, we don't await on the Promise returned by launchKernel
         * in other words, `k(); await.ti.sync();` is equivalent to `await k()`, assuming k has no return value
         * This is pretty neat. Should C++ taichi do the same? e.g. with C++ coroutines?
         */
        await this.sync();

        if (thisArgsBuffer) {
            this.recycleArgsBuffer(thisArgsBuffer, argsSize);
        }

        if (kernel.returnType.getCategory() !== TypeCategory.Void) {
            assert(thisRetsBufferGPU !== null && thisRetsBufferCPU !== null, 'missing rets buffer!');

            let commandEncoder = this.device!.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(thisRetsBufferGPU!.buffer, 0, thisRetsBufferCPU!.buffer, 0, retsSize);
            this.device!.queue.submit([commandEncoder.finish()]);
            await this.device!.queue.onSubmittedWorkDone();

            await thisRetsBufferCPU!.buffer.mapAsync(GPUMapMode.READ, 0, retsSize);
            let intArray = new Int32Array(thisRetsBufferCPU!.buffer.getMappedRange(0, retsSize));
            let returnVal = int32ArrayToElement(intArray, kernel.returnType);

            thisRetsBufferCPU!.buffer.unmap();
            retsBufferPoolGPU.returnBuffer(thisRetsBufferGPU!);
            retsBufferPoolCPU.returnBuffer(thisRetsBufferCPU!);

            return returnVal;
        }
    }

    private addArgsBuffer(size: number): GPUBuffer {
        // can't use a buffer pool, because we need the mappedAtCreation feature.
        // or we could use two buffers, one for MAP_WRITE and COPY_SRC, the other for STORAGE and UNIFORM
        // but that's probably not worth it.
        let buffer = this.device!.createBuffer({
            size: size,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        return buffer;
    }

    private recycleArgsBuffer(buffer: GPUBuffer, size: number) {
        buffer.destroy();
    }

    private createGlobalTmpsBuffer() {
        let size = 65536;
        this.globalTmpsBuffer = this.device!.createBuffer({
            size: size,
            usage: GPUBufferUsage.STORAGE,
        });
    }

    private createRandStatesBuffer() {
        this.randStatesBuffer = this.device!.createBuffer({
            size: 65536 * 4 * 4,
            usage: GPUBufferUsage.STORAGE,
        });
    }

    getGPUBindGroupEntries(
        bindings: ResourceBinding[],
        argsBuffer: GPUBuffer | undefined,
        retsBuffer: GPUBuffer | undefined
    ): GPUBindGroupEntry[] {
        let entries: GPUBindGroupEntry[] = [];
        for (let binding of bindings) {
            let buffer: GPUBuffer | undefined = undefined;
            let texture: GPUTextureView | undefined = undefined;
            let sampler: GPUSampler | undefined = undefined;
            switch (binding.info.resourceType) {
                case ResourceType.Root:
                case ResourceType.RootAtomic: {
                    buffer = this.materializedTrees[binding.info.resourceID!].rootBuffer!;
                    break;
                }
                case ResourceType.GlobalTmps:
                case ResourceType.GlobalTmpsAtomic: {
                    buffer = this.globalTmpsBuffer!;
                    break;
                }
                case ResourceType.Args: {
                    assert(argsBuffer !== null);
                    buffer = argsBuffer!;
                    break;
                }
                case ResourceType.Rets: {
                    assert(retsBuffer !== null);
                    buffer = retsBuffer!;
                    break;
                }
                case ResourceType.RandStates: {
                    buffer = this.randStatesBuffer!;
                    break;
                }
                case ResourceType.StorageTexture: {
                    // WGSL storage views must address exactly one mip. A store
                    // with no explicit lod targets mip 0; binding the full
                    // pyramid view here fails validation on multi-mip textures
                    // ("mipLevelCount (N) ... expected to be 1"). ilmato hit
                    // this filling procedural staging textures (2026-09-18).
                    const lod = binding.info.levelID >= 0 ? binding.info.levelID : 0;
                    texture = this.textures[binding.info.resourceID!].getGPUTextureViewLod(lod);
                    break;
                }
                case ResourceType.Texture: {
                    if (binding.info.levelID >= 0) {
                        texture = this.textures[binding.info.resourceID!].getGPUTextureViewLod(binding.info.levelID);
                    } else {
                        texture = this.textures[binding.info.resourceID!].getGPUTextureView();
                    }

                    break;
                }
                case ResourceType.Sampler: {
                    sampler = this.textures[binding.info.resourceID!].getGPUSampler() ?? undefined;
                    break;
                }
            }
            if (buffer) {
                entries.push({
                    binding: binding.binding,
                    resource: {
                        buffer: buffer,
                    },
                });
            } else if (texture) {
                entries.push({
                    binding: binding.binding,
                    resource: texture,
                });
            } else if (sampler) {
                entries.push({
                    binding: binding.binding,
                    resource: sampler,
                });
            } else {
                error("couldn't identify resource");
            }
        }
        return entries;
    }

    materializeTree(tree: SNodeTree) {
        let size = tree.size;
        let rootBuffer = this.device!.createBuffer({
            size: size,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.VERTEX |
                GPUBufferUsage.INDEX |
                GPUBufferUsage.COPY_DST |
                GPUBufferUsage.COPY_SRC |
                GPUBufferUsage.INDIRECT,
        });
        tree.rootBuffer = rootBuffer;
        this.materializedTrees.push(tree);
        this.allocCount++;
    }

    addTexture(texture: TextureBase) {
        this.textures.push(texture);
    }

    createGPUTexture(
        dimensions: number[],
        dimensionality: TextureDimensionality,
        format: GPUTextureFormat,
        renderAttachment: boolean,
        requiresStorage: boolean,
        sampleCount: number,
        mipLevelCount: number = 1,
        arrayLayers: number = 1
    ): GPUTexture {
        let getDescriptor = (): GPUTextureDescriptor => {
            let usage = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING;
            if (requiresStorage) {
                usage = usage | GPUTextureUsage.STORAGE_BINDING;
            }
            // Block-compressed formats admit exactly COPY_DST |
            // TEXTURE_BINDING — COPY_SRC, STORAGE, and RENDER_ATTACHMENT all
            // fail validation (DDS ingestion hit this on BC1, 2026-09-22).
            if (isBlockCompressedFormat(format)) {
                usage = GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING;
            }
            if (dimensions.length === 1) {
                error('1d texture not supported yet');
                return {
                    size: { width: dimensions[0] },
                    dimension: '1d',
                    format: format,
                    usage: usage,
                };
            } else if (dimensions.length === 2) {
                assert(
                    dimensionality === TextureDimensionality.Dim2d || dimensionality === TextureDimensionality.DimCube || dimensionality === TextureDimensionality.Dim2dArray
                );
                if (renderAttachment && !isBlockCompressedFormat(format)) {
                    usage = usage | GPUTextureUsage.RENDER_ATTACHMENT;
                }
                let size: GPUExtent3DStrict = { width: dimensions[0], height: dimensions[1] };
                if (dimensionality === TextureDimensionality.DimCube) {
                    size.depthOrArrayLayers = 6;
                }
                if (dimensionality === TextureDimensionality.Dim2dArray) {
                    assert(Number.isInteger(arrayLayers) && arrayLayers > 0, 'array texture needs a positive layer count');
                    size.depthOrArrayLayers = arrayLayers;
                }
                return {
                    size: size,
                    dimension: '2d',
                    format: format,
                    usage: usage,
                    mipLevelCount: mipLevelCount,
                    sampleCount
                };
            } else {
                // if(dimensions.length === 3){
                return {
                    size: { width: dimensions[0], height: dimensions[1], depthOrArrayLayers: dimensions[2] },
                    dimension: '3d',
                    format: format,
                    usage: usage,
                };
            }
        };
        this.allocCount++;
        return this.device!.createTexture(getDescriptor());
    }

    createGPUSampler(depth: boolean, samplingOptions: TextureSamplingOptions): GPUSampler {
        let desc: GPUSamplerDescriptor = {
            addressModeU: samplingOptions.wrapModeU || 'repeat',
            addressModeV: samplingOptions.wrapModeV || 'repeat',
            addressModeW: samplingOptions.wrapModeW || 'repeat',
            minFilter: samplingOptions.minFilter || 'linear',
            magFilter: samplingOptions.magFilter || 'linear',
            mipmapFilter: samplingOptions.mipmapFilter || 'linear'
        };
        if (desc.minFilter == 'linear' && desc.magFilter == 'linear' && desc.mipmapFilter == 'linear') {
            desc.maxAnisotropy = 16;
        }
        if (depth) {
            desc.compare = 'less-equal';
        }
        return this.device!.createSampler(desc);
    }

    createGPUCanvasContext(htmlCanvas: HTMLCanvasElement): [GPUCanvasContext, GPUTextureFormat] {
        let context = htmlCanvas.getContext('webgpu');
        if (context === null) {
            error('canvas webgpu context is null');
        }
        let presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        context!.configure({
            device: this.device!,
            format: presentationFormat,
            alphaMode: 'opaque',
        });
        return [context!, presentationFormat];
    }

    async deviceToHost(field: Field, offsetBytes: number = 0, sizeBytes: number = 0): Promise<FieldHostSideCopy> {
        if (sizeBytes === 0) {
            sizeBytes = field.sizeBytes;
        }
        let pool = BufferPool.getPool(this.device!, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
        const rootBufferCopy = pool.getBuffer(sizeBytes);
        let commandEncoder = this.device!.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            this.materializedTrees[field.snodeTree.treeId].rootBuffer!,
            field.offsetBytes + offsetBytes,
            rootBufferCopy.buffer,
            0,
            sizeBytes
        );
        this.device!.queue.submit([commandEncoder.finish()]);

        await rootBufferCopy.buffer.mapAsync(GPUMapMode.READ, 0, sizeBytes);
        let mappedRange = rootBufferCopy.buffer.getMappedRange(0, sizeBytes);
        // Copy into an owned ArrayBuffer so we can unmap immediately.
        // Two typed array views share the same underlying buffer — no extra allocation.
        let ownedBuffer = new ArrayBuffer(mappedRange.byteLength);
        new Uint8Array(ownedBuffer).set(new Uint8Array(mappedRange));
        rootBufferCopy.buffer.unmap();
        pool.returnBuffer(rootBufferCopy);
        let resultInt = new Int32Array(ownedBuffer);
        let resultFloat = new Float32Array(ownedBuffer);
        return new FieldHostSideCopy(resultInt, resultFloat);
    }
    async deviceToHostMultiple(fields: Field[]): Promise<FieldHostSideCopy[]> {
        let pool = BufferPool.getPool(this.device!, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
        let stagingBuffers: PooledBuffer[] = [];
        let sizes: number[] = [];
        let commandEncoder = this.device!.createCommandEncoder();
        for (let field of fields) {
            let sizeBytes = field.sizeBytes;
            let staging = pool.getBuffer(sizeBytes);
            commandEncoder.copyBufferToBuffer(
                this.materializedTrees[field.snodeTree.treeId].rootBuffer!,
                field.offsetBytes,
                staging.buffer,
                0,
                sizeBytes
            );
            stagingBuffers.push(staging);
            sizes.push(sizeBytes);
        }
        this.device!.queue.submit([commandEncoder.finish()]);

        await Promise.all(
            stagingBuffers.map((s, i) => s.buffer.mapAsync(GPUMapMode.READ, 0, sizes[i]))
        );

        let results: FieldHostSideCopy[] = [];
        for (let i = 0; i < stagingBuffers.length; ++i) {
            let mappedRange = stagingBuffers[i].buffer.getMappedRange(0, sizes[i]);
            let ownedBuffer = new ArrayBuffer(mappedRange.byteLength);
            new Uint8Array(ownedBuffer).set(new Uint8Array(mappedRange));
            stagingBuffers[i].buffer.unmap();
            pool.returnBuffer(stagingBuffers[i]);
            results.push(new FieldHostSideCopy(new Int32Array(ownedBuffer), new Float32Array(ownedBuffer)));
        }
        return results;
    }
    async hostToDevice(field: Field, hostArray: Int32Array, offsetBytes: number = 0, transferBytes: number | null = null) {
        transferBytes = transferBytes ?? hostArray.byteLength;
        
        const rootBufferCopy = this.device!.createBuffer({
            size: transferBytes,
            usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
            mappedAtCreation: true,
        });

        new Int32Array(rootBufferCopy.getMappedRange()).set(hostArray);
        rootBufferCopy.unmap();

        let commandEncoder = this.device!.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            rootBufferCopy,
            0,
            this.materializedTrees[field.snodeTree.treeId].rootBuffer!,
            field.offsetBytes + offsetBytes,
            transferBytes
        );

        this.device!.queue.submit([commandEncoder.finish()]);
        await this.device!.queue.onSubmittedWorkDone();

        rootBufferCopy.destroy();
    }
    /**
     * hostToDevice without the trailing onSubmittedWorkDone await — the
     * staging copy is enqueued in-order and the caller's later global sync
     * guarantees it landed. Assumes a dedicated staging buffer per call
     * (reuse would race the earlier copy); Field.fromFloat32ArrayAsync wraps
     * this for that contract.
     */
    async hostToDeviceAsync(field: Field, hostArray: Int32Array, offsetBytes: number = 0, transferBytes: number | null = null) {
        transferBytes = transferBytes ?? hostArray.byteLength;

        const rootBufferCopy = this.device!.createBuffer({
            size: transferBytes,
            usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
            mappedAtCreation: true,
        });

        new Int32Array(rootBufferCopy.getMappedRange()).set(hostArray);
        rootBufferCopy.unmap();

        let commandEncoder = this.device!.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            rootBufferCopy,
            0,
            this.materializedTrees[field.snodeTree.treeId].rootBuffer!,
            field.offsetBytes + offsetBytes,
            transferBytes
        );

        this.device!.queue.submit([commandEncoder.finish()]);
        rootBufferCopy.destroy();
    }
    getRootBuffer(treeId: number): GPUBuffer {
        return this.materializedTrees[treeId].rootBuffer!;
    }
    async copyImageBitmapToTexture(bitmap: ImageBitmap, texture: GPUTexture) {
        let copySource: GPUImageCopyExternalImage = {
            source: bitmap,
        };
        let copyDest: GPUImageCopyTextureTagged = {
            texture: texture,
        };
        let extent: GPUExtent3D = {
            width: bitmap.width,
            height: bitmap.height,
        };
        this.device!.queue.copyExternalImageToTexture(copySource, copyDest, extent);
        await this.device!.queue.onSubmittedWorkDone();
    }
    async copyImageBitmapsToCubeTexture(bitmaps: ImageBitmap[], texture: GPUTexture) {
        for (let i = 0; i < 6; ++i) {
            let bitmap = bitmaps[i];
            let copySource: GPUImageCopyExternalImage = {
                source: bitmap,
            };
            let copyDest: GPUImageCopyTextureTagged = {
                texture: texture,
                origin: [0, 0, i],
            };
            let extent: GPUExtent3D = {
                width: bitmap.width,
                height: bitmap.height,
            };
            this.device!.queue.copyExternalImageToTexture(copySource, copyDest, extent);
        }
        await this.device!.queue.onSubmittedWorkDone();
    }
    async copyTextureToTexture(src: GPUTexture, dest: GPUTexture, dimensions: number[]) {
        let commandEncoder = this.device!.createCommandEncoder();
        commandEncoder.copyTextureToTexture({ texture: src }, { texture: dest }, dimensions);
        this.device!.queue.submit([commandEncoder.finish()]);
        await this.device!.queue.onSubmittedWorkDone();
    }

    /*
     * Buffer-source texture upload (tinyti issue #1 — BC-direct streaming /
     * DDS ingestion; also plain uncompressed rows). Stages `hostBytes` into
     * a pooled, grown-only staging ring (reuse never races: a buffer is
     * recycled only after the previous submit riding it has completed on
     * the queue timeline), pads rows to the 256-byte copy alignment, and
     * issues copyBufferToTexture. No per-call device allocations beyond the
     * command encoder — safe to call in per-level decode/stream storms.
     *
     * BC formats: `size` must be BLOCK-ROUNDED (caller rounds up; a file
     * level's row stride is ceil(w/4)*blockBytes). `rowsPerImage` defaults
     * to size[1]/4 block rows; data row stride is derived from the format.
     * Uncompressed formats: pass `bytesPerRow` (source row stride in bytes).
     */
    uploadStagingRing: { buffer: GPUBuffer, capacity: number }[] = [];
    uploadStagingCursor: number = 0;
    async uploadBufferToTexture(
        hostBytes: Uint8Array,
        texture: TextureBase,
        mipLevel: number = 0,
        opts: { origin?: number[], size?: number[], bytesPerRow?: number, rowsPerImage?: number } = {}
    ) {
        const target = texture.getGPUTexture();
        const format = texture.getGPUTextureFormat();
        const compressed = isBlockCompressedFormat(format);
        const size = opts.size ?? [
            Math.max(((target as any).width || 0) >> mipLevel, 1),
            Math.max(((target as any).height || 0) >> mipLevel, 1),
        ];
        assert(size[0] > 0 && size[1] > 0, 'uploadBufferToTexture: need positive size (target reports no dims — pass opts.size)');
        let dataRow: number; // unpadded source row stride in bytes (block-row for BC)
        let rowsPerImage: number; // buffer-layout image stride (block rows for BC)
        if (compressed) {
            assert(size[0] % 4 === 0 && size[1] % 4 === 0, 'BC copy extent must be block-aligned (multiple of 4; caller rounds up)');
            const blockBytes = (format.startsWith('bc1-') || format.startsWith('bc4-')) ? 8 : 16;
            dataRow = opts.bytesPerRow ?? (size[0] / 4) * blockBytes;
            rowsPerImage = opts.rowsPerImage ?? size[1] / 4;
        } else {
            assert(opts.bytesPerRow !== undefined, 'uncompressed uploads must pass opts.bytesPerRow (source row stride in bytes)');
            dataRow = opts.bytesPerRow!;
            rowsPerImage = opts.rowsPerImage ?? size[1];
        }
        const rows = Math.ceil(hostBytes.byteLength / dataRow);
        assert(rows * dataRow <= hostBytes.byteLength + dataRow, 'uploadBufferToTexture: hostBytes shorter than one row per row of extent');
        const paddedRow = Math.ceil(dataRow / 256) * 256;
        const need = paddedRow * rows;
        const ring = this.uploadStagingRing;
        this.uploadStagingCursor = (this.uploadStagingCursor + 1) % 2;
        let slot = ring[this.uploadStagingCursor];
        if (!slot) {
            slot = { buffer: null as any, capacity: 0 };
            ring[this.uploadStagingCursor] = slot;
        }
        if (slot.capacity < need) {
            if (slot.buffer) slot.buffer.destroy();
            slot.buffer = this.device!.createBuffer({
                size: need,
                usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
            });
            slot.capacity = need;
        }
        await slot.buffer.mapAsync(GPUMapMode.WRITE, 0, need);
        const map = new Uint8Array(slot.buffer.getMappedRange(0, need));
        for (let y = 0; y < rows; y++) {
            const srcStart = y * dataRow;
            const srcEnd = Math.min(srcStart + dataRow, hostBytes.byteLength);
            map.set(hostBytes.subarray(srcStart, srcEnd), y * paddedRow);
        }
        slot.buffer.unmap();
        const enc = this.device!.createCommandEncoder();
        enc.copyBufferToTexture(
            { buffer: slot.buffer, bytesPerRow: paddedRow, rowsPerImage },
            { texture: target, mipLevel, origin: (opts.origin ?? [0, 0, 0]) as [number, number, number] },
            { width: size[0], height: size[1], depthOrArrayLayers: size[2] ?? 1 }
        );
        this.device!.queue.submit([enc.finish()]);
        await this.device!.queue.onSubmittedWorkDone();
    }

    getGPUShaderModule(code: string): GPUShaderModule {
        return this.pipelineCache!.getOrCreateShaderModule(code);
    }

    getGPUComputePipeline(desc: GPUComputePipelineDescriptor): GPUComputePipeline {
        return this.pipelineCache!.getOrCreateComputePipeline(desc);
    }

    getGPURenderPipeline(desc: GPURenderPipelineDescriptor): GPURenderPipeline {
        return this.pipelineCache!.getOrCreateRenderPipeline(desc);
    }

    private supportsIndirectFirstInstance() {
        return this.adapter!.features.has('indirect-first-instance');
    }

    /**
     * Tear down all GPU resources owned by this runtime. Essential to prevent
     * GPU memory leaks: SNodeTree rootBuffers, textures, and the device/adapter
     * are never GC'd by the JS engine. Call before re-init or on page teardown.
     */
    destroy() {
        for (const tree of this.materializedTrees) {
            tree.destroy();
        }
        this.materializedTrees.length = 0;
        for (const tex of this.textures) {
            tex.destroy();
        }
        this.textures.length = 0;
        this.globalTmpsBuffer?.destroy();
        this.globalTmpsBuffer = null;
        this.randStatesBuffer?.destroy();
        this.randStatesBuffer = null;
        for (const slot of this.uploadStagingRing) {
            slot.buffer?.destroy();
        }
        this.uploadStagingRing.length = 0;
        this.pipelineCache?.destroy();
        this.pipelineCache = null;
        this.device?.destroy();
        this.device = null;
        this.adapter = null;
    }
}

class FieldHostSideCopy {
    constructor(public intArray: Int32Array, public floatArray: Float32Array) {}
}

class IndirectDrawCommand {
    constructor(
        public indexCount: number,
        public instanceCount: number,
        public firstIndex: number,
        public baseVertex: number,
        public firstInstance: number
    ) {}
}

class IndirectPolyfillInfo {
    constructor(public indirectBuffer: Promise<number[]> | Field, public indirectCount: number | Field) {}
    commands: IndirectDrawCommand[] = [];
    async fillInfo() {
        if (this.indirectCount instanceof Field) {
            this.indirectCount = (await this.indirectCount.toInt32Array())[0];
        }
        let indirectBufferHost: number[] = [];
        if (this.indirectBuffer instanceof Field) {
            indirectBufferHost = await this.indirectBuffer.toInt32Array();
        } else {
            indirectBufferHost = await this.indirectBuffer;
        }
        this.commands = [];
        for (let i = 0; i < this.indirectCount; ++i) {
            let values = indirectBufferHost.slice(i * 5, i * 5 + 5);
            let cmd = new IndirectDrawCommand(values[0], values[1], values[2], values[3], values[4]);
            this.commands.push(cmd);
        }
    }
}

class EncoderState {
    computePipeline?: GPUComputePipeline;
    renderPipeline?: GPURenderPipeline;
}

export { Runtime };
