/**
 * @import { Color } from '../../core/math/color.js'
 */
/**
 * A cursor for writing line vertices straight into the storage of an immediate line batch,
 * avoiding the intermediate array that {@link Immediate#drawLineArrays} style submission needs.
 *
 * Obtained from {@link Immediate#allocateLines}, which hands out a single reused instance. The
 * returned cursor is therefore only valid until the next allocation: use it inside the function
 * that writes the data and never keep hold of it.
 *
 * @ignore
 */
export class LineWriter {
    /**
     * Packed xyz positions of the batch being written to.
     *
     * @type {Float32Array|null}
     * @private
     */
    private _positions;
    /**
     * Packed rgba colors of the batch being written to.
     *
     * @type {Float32Array|null}
     * @private
     */
    private _colors;
    /**
     * Index of the next vertex to write.
     *
     * @type {number}
     * @private
     */
    private _cursor;
    /**
     * One past the last vertex of the allocated region.
     *
     * @type {number}
     * @private
     */
    private _end;
    /** @private */
    private _r;
    /** @private */
    private _g;
    /** @private */
    private _b;
    /** @private */
    private _a;
    /**
     * Points the cursor at a freshly allocated region.
     *
     * @param {Float32Array} positions - The batch positions.
     * @param {Float32Array} colors - The batch colors.
     * @param {number} first - The first vertex of the region.
     * @param {number} count - The number of vertices in the region.
     * @param {Color} color - The color used by {@link LineWriter#segment}.
     * @ignore
     */
    reset(positions: Float32Array, colors: Float32Array, first: number, count: number, color: Color): void;
    /**
     * Sets the color used by {@link LineWriter#segment}. Can be called between segments. A method
     * rather than an accessor, as the components are unpacked here so they are not read per
     * vertex, and there is nothing meaningful to read back.
     *
     * @param {Color} color - The color to use.
     */
    setColor(color: Color): void;
    /**
     * Whether the whole allocated region has been written. Used to check that a caller filled
     * everything it asked for, since the space is accounted for up front.
     *
     * @type {boolean}
     * @ignore
     */
    get filled(): boolean;
    /**
     * The packed xyz storage being written to. Exposed for callers generating enough vertices
     * that the per-segment call overhead of {@link LineWriter#segment} matters; read it once,
     * write the region, then advance {@link LineWriter#cursor}.
     *
     * @type {Float32Array}
     * @ignore
     */
    get positions(): Float32Array;
    /**
     * The packed rgba storage being written to, one color per position.
     *
     * @type {Float32Array}
     * @ignore
     */
    get colors(): Float32Array;
    /**
     * The index of the next vertex to write. A caller writing the storage directly must leave
     * this pointing past everything it wrote.
     *
     * @type {number}
     * @ignore
     */
    set cursor(value: number);
    get cursor(): number;
    /**
     * One past the last vertex of the allocated region.
     *
     * @type {number}
     * @ignore
     */
    get end(): number;
    /**
     * Writes one line segment, both ends in the writer's current color.
     *
     * @param {number} x0 - The start x coordinate.
     * @param {number} y0 - The start y coordinate.
     * @param {number} z0 - The start z coordinate.
     * @param {number} x1 - The end x coordinate.
     * @param {number} y1 - The end y coordinate.
     * @param {number} z1 - The end z coordinate.
     */
    segment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
    /**
     * Writes one vertex with an explicit color. Two consecutive vertices form a segment.
     *
     * @param {number} x - The x coordinate.
     * @param {number} y - The y coordinate.
     * @param {number} z - The z coordinate.
     * @param {number} r - The red component.
     * @param {number} g - The green component.
     * @param {number} b - The blue component.
     * @param {number} a - The alpha component.
     */
    vertex(x: number, y: number, z: number, r: number, g: number, b: number, a: number): void;
}
import type { Color } from '../../core/math/color.js';
