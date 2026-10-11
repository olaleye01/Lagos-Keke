export class ImmediateBatch {
    constructor(device: any, material: any, layer: any);
    /**
     * Packed xyz positions. Only the first `_vertexCount` vertices hold data for the current
     * frame, the rest is spare capacity retained between frames.
     *
     * @type {Float32Array}
     * @private
     */
    private _positions;
    /**
     * Packed rgba colors, one per position.
     *
     * @type {Float32Array}
     * @private
     */
    private _colors;
    /**
     * Vertices written so far this frame.
     *
     * @type {number}
     * @private
     */
    private _vertexCount;
    /**
     * Vertices the buffers can hold without reallocating.
     *
     * @type {number}
     * @private
     */
    private _capacity;
    /**
     * Largest vertex count seen since shrinking was last considered.
     *
     * @type {number}
     * @private
     */
    private _peakVertexCount;
    /**
     * Frames elapsed since a frame needed more than half the storage.
     *
     * @type {number}
     * @private
     */
    private _framesSinceHighUse;
    material: any;
    layer: any;
    mesh: Mesh;
    meshInstance: MeshInstance;
    /**
     * Ensures room for the supplied number of additional vertices, growing by doubling so a batch
     * filled over many calls does not reallocate on each one.
     *
     * @param {number} count - The number of vertices about to be added.
     * @private
     */
    private _reserve;
    /**
     * Reallocates the storage, preserving whatever has already been added this frame.
     *
     * @param {number} capacity - The new capacity in vertices.
     * @private
     */
    private _setCapacity;
    /**
     * Claims a range of vertices for the caller to write into directly, and accounts for it
     * immediately. The caller must fill all of it, as unwritten vertices are left at whatever the
     * storage already held.
     *
     * @param {number} count - The number of vertices to claim.
     * @returns {number} The first vertex of the claimed range.
     * @ignore
     */
    allocate(count: number): number;
    /**
     * Writes a single color to every vertex of a range.
     *
     * @param {Color} color - The color to write.
     * @param {number} first - The first vertex to write.
     * @param {number} count - The number of vertices to write.
     * @private
     */
    private _writeUniformColor;
    addLines(positions: any, color: any): void;
    addLinesArrays(positions: any, color: any): void;
    onPreRender(visibleList: any, transparent: any): void;
    clear(): void;
}
import { Mesh } from '../mesh.js';
import { MeshInstance } from '../mesh-instance.js';
