/**
 * @import { DynamicBufferAllocation } from '../dynamic-buffers.js'
 * @import { WebglGraphicsDevice } from './webgl-graphics-device.js'
 */
/**
 * A WebGL implementation of the dynamic buffers system. Unlike WebGPU (which sub-allocates from
 * large mapped pages and copies them to the GPU at submit time), WebGL2 has no buffer mapping and
 * executes draws immediately. So instead this hands out a whole {@link WebglDynamicBuffer} per
 * allocation from a pool keyed by size, and the buffer uploads its data eagerly using `bufferData`
 * (orphaning). Each buffer is handed out at most once per frame and returned to the free pool at
 * the end of the frame, which - together with orphaning - gives distinct buffers for uses that are
 * live at the same time (e.g. XR multiview eyes) and stall-free reuse across frames.
 *
 * @ignore
 */
export class WebglDynamicBuffers extends DynamicBuffers {
    /**
     * @param {WebglGraphicsDevice} device - The graphics device.
     */
    constructor(device: WebglGraphicsDevice);
    /**
     * Free buffers available for allocation, keyed by byte size.
     *
     * @type {Map<number, WebglDynamicBuffer[]>}
     */
    free: Map<number, WebglDynamicBuffer[]>;
    /**
     * Buffers handed out during the current frame, returned to the free pool at frame end.
     *
     * @type {WebglDynamicBuffer[]}
     */
    used: WebglDynamicBuffer[];
    /**
     * Return the frame's buffers to the free pool. Called at the end of the frame, so it runs after
     * all allocations (including any made before frameStart, e.g. from app update handlers).
     */
    onFrameEnd(): void;
    /**
     * Called when the rendering context is lost. Returns any in-flight buffers to the free pool and
     * drops every buffer's GL handle (without deleting - the context is invalid). The buffer objects
     * and their CPU storage are kept, so they are reused and their GL buffers recreated on the next
     * upload after the context is restored.
     */
    loseContext(): void;
}
import { DynamicBuffers } from '../dynamic-buffers.js';
import { WebglDynamicBuffer } from './webgl-dynamic-buffer.js';
import type { WebglGraphicsDevice } from './webgl-graphics-device.js';
