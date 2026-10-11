/**
 * @import { WideLineRenderer } from './wide-line-renderer.js'
 */
/** Butt line caps stop exactly at the first and last points. */
export const LINECAP_BUTT: 0;
/** Round line caps extend past line and dash ends by half the line width. */
export const LINECAP_ROUND: 2;
/** Square line caps extend past the first and last points by half the line width. */
export const LINECAP_SQUARE: 1;
/** Bevel joins connect segment edges directly. */
export const LINEJOIN_BEVEL: 1;
/** Miter joins extend edges until they intersect. */
export const LINEJOIN_MITER: 0;
/** Round joins connect segments using a circular edge. */
export const LINEJOIN_ROUND: 2;
/**
 * A connected, variable-width line rendered by a {@link WideLineRenderer}. Point data is supplied
 * using packed numeric arrays to avoid allocating an object for each point.
 *
 * A WideLine can belong to at most one WideLineRenderer. Removing it from the renderer leaves the
 * WideLine intact, allowing it to be added to another renderer later.
 *
 * @category Graphics
 */
export class WideLine {
    /** @type {Float32Array} @ignore */
    _positions: Float32Array;
    /** @type {Float32Array} @ignore */
    _colors: Float32Array;
    /** @type {Float32Array} @ignore */
    _widths: Float32Array;
    /** @type {WideLineRenderer|null} @ignore */
    _renderer: WideLineRenderer | null;
    /** @ignore */
    _rendererIndex: number;
    /** @ignore */
    _join: number;
    /** @ignore */
    _cap: number;
    /** @ignore */
    _closed: boolean;
    /** @ignore */
    _dashLength: number;
    /** @ignore */
    _gapLength: number;
    /** @ignore */
    _dashOffset: number;
    /**
     * Atomically replaces all point data. This is the only operation that can change the number of
     * points. The colors and widths can each be supplied either per point or as a single uniform
     * value.
     *
     * @param {ArrayLike<number>} positions - Packed xyz coordinates. The length must be a multiple
     * of three and contain at least two points.
     * @param {ArrayLike<number>|Color} [colors] - Packed rgb values with one color per point, or a
     * single color used by every point. The alpha component of a {@link Color} is ignored.
     * @param {ArrayLike<number>|number} [widths] - One width per point, or a single width used by
     * every point. Width units are selected by the owning {@link WideLineRenderer} and values must
     * be non-negative.
     * @returns {WideLine} This line.
     */
    set(positions: ArrayLike<number>, colors?: ArrayLike<number> | Color, widths?: ArrayLike<number> | number): WideLine;
    /**
     * Replaces positions without changing the number of points.
     *
     * @param {ArrayLike<number>} positions - Packed xyz coordinates containing exactly
     * `pointCount * 3` values.
     * @returns {WideLine} This line.
     */
    setPositions(positions: ArrayLike<number>): WideLine;
    /**
     * Replaces colors without changing the number of points.
     *
     * @param {ArrayLike<number>|Color} colors - Packed rgb values containing exactly
     * `pointCount * 3` values, or a single color used by every point. The alpha component of a
     * {@link Color} is ignored.
     * @returns {WideLine} This line.
     */
    setColors(colors: ArrayLike<number> | Color): WideLine;
    /**
     * Replaces widths without changing the number of points.
     *
     * @param {ArrayLike<number>|number} widths - An array containing exactly `pointCount` values,
     * or a single width used by every point. Width units are selected by the owning
     * {@link WideLineRenderer} and values must be non-negative.
     * @returns {WideLine} This line.
     */
    setWidths(widths: ArrayLike<number> | number): WideLine;
    /**
     * The number of points in the line. This is zero until {@link WideLine#set} is called.
     *
     * @type {number}
     */
    get pointCount(): number;
    /**
     * The renderer that owns this line, or null when the line is not being rendered.
     *
     * @type {WideLineRenderer|null}
     */
    get renderer(): WideLineRenderer | null;
    /**
     * The join style. Can be {@link LINEJOIN_MITER}, {@link LINEJOIN_BEVEL} or
     * {@link LINEJOIN_ROUND}. Defaults to {@link LINEJOIN_MITER}.
     *
     * @type {number}
     */
    set join(value: number);
    /**
     * Gets the join style.
     *
     * @type {number}
     */
    get join(): number;
    /**
     * The cap style. Can be {@link LINECAP_BUTT}, {@link LINECAP_SQUARE} or
     * {@link LINECAP_ROUND}. The style also applies to the ends of visible dashes. Defaults to
     * {@link LINECAP_BUTT}.
     *
     * @type {number}
     */
    set cap(value: number);
    /**
     * Gets the cap style.
     *
     * @type {number}
     */
    get cap(): number;
    /**
     * Whether the last point connects back to the first point. Defaults to false.
     *
     * @type {boolean}
     */
    set closed(value: boolean);
    /**
     * Gets whether the last point connects back to the first point.
     *
     * @type {boolean}
     */
    get closed(): boolean;
    /**
     * The length of each visible dash in world units. A value of zero makes the line solid.
     * Defaults to zero.
     *
     * @type {number}
     */
    set dashLength(value: number);
    /**
     * Gets the length of each visible dash in world units.
     *
     * @type {number}
     */
    get dashLength(): number;
    /**
     * The length of each gap in world units. A value of zero makes the line solid. Defaults to
     * zero.
     *
     * @type {number}
     */
    set gapLength(value: number);
    /**
     * Gets the length of each gap in world units.
     *
     * @type {number}
     */
    get gapLength(): number;
    /**
     * Offset of the dash pattern in world units. Defaults to zero.
     *
     * @type {number}
     */
    set dashOffset(value: number);
    /**
     * Gets the offset of the dash pattern in world units.
     *
     * @type {number}
     */
    get dashOffset(): number;
    /** @ignore */
    _validatePositions(positions: any, expectedPointCount: any): number;
    /** @ignore */
    _copyPositions(positions: any, expectedPointCount: any, target: any): any;
    /** @ignore */
    _validateColors(colors: any, pointCount: any): void;
    /** @ignore */
    _copyColors(colors: any, pointCount: any, target: any): any;
    /** @ignore */
    _validateWidths(widths: any, pointCount: any): void;
    /** @ignore */
    _copyWidths(widths: any, pointCount: any, target: any): any;
    /** @ignore */
    _changed(): void;
}
import type { WideLineRenderer } from './wide-line-renderer.js';
import { Color } from '../../core/math/color.js';
