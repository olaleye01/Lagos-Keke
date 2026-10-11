/**
 * @import { AppBase } from '../../framework/app-base.js'
 * @import { Layer } from '../../scene/layer.js'
 */
/** Line widths are measured in screen pixels. */
export const LINEWIDTH_SCREEN: 0;
/** Line widths are measured in world units. */
export const LINEWIDTH_WORLD: 1;
/**
 * Renders a collection of {@link WideLine} objects using a single instanced draw call per
 * camera/layer pass. Lines can use different widths, colors, caps, joins and dash patterns while
 * remaining in the same batch, as these properties are stored in per-segment instance data.
 *
 * Each {@link WideLine} describes a connected polyline in world space. Its width can vary per point
 * and is interpreted as screen pixels or world units according to
 * {@link WideLineRenderer#widthUnits}. A line can belong to only one WideLineRenderer at a time. Use
 * {@link WideLineRenderer#add} and {@link WideLineRenderer#remove} to transfer ownership without
 * changing the line data.
 *
 * ## Basic usage
 *
 * The following example creates a three-point line with a color gradient, variable width and
 * rounded ends and joins:
 *
 * ```javascript
 * const renderer = new WideLineRenderer(app);
 * const line = new WideLine();
 *
 * line.set(
 *     new Float32Array([
 *         -2, 0, 0,
 *          0, 1, 0,
 *          2, 0, 0
 *     ]),
 *     new Float32Array([
 *         1, 0, 0,
 *         1, 1, 0,
 *         0, 1, 1
 *     ]),
 *     new Float32Array([4, 12, 4])
 * );
 * line.cap = LINECAP_ROUND;
 * line.join = LINEJOIN_ROUND;
 * renderer.add(line);
 *
 * // Release GPU resources and detach all lines when no longer needed.
 * app.on('destroy', () => renderer.destroy());
 * ```
 *
 * Point data can be updated using {@link WideLine#setPositions}, {@link WideLine#setColors} and
 * {@link WideLine#setWidths}. These methods preserve the point count and reuse the line's existing
 * storage. Use {@link WideLine#set} when the point count needs to change.
 *
 * ## Performance
 *
 * Each line segment is rendered as one GPU instance. All segments owned by this renderer are
 * submitted together, so adding more WideLine objects does not add draw calls. A renderer with
 * visible segments issues one draw call for each camera that renders its layer. Multiple renderers
 * therefore provide useful update isolation, but each adds another draw call per camera/layer
 * pass.
 *
 * Changing any owned line marks the renderer dirty. Before the next render, instance data for all
 * of its lines is rebuilt and uploaded. For mixed workloads, place lines that rarely change in one
 * renderer and frequently updated lines in another. There is no static or dynamic mode; the
 * separation is achieved using two renderer instances. This prevents dynamic updates from
 * repeatedly rebuilding the static segment data:
 *
 * ```javascript
 * const staticLines = new WideLineRenderer(app);
 * const dynamicLines = new WideLineRenderer(app);
 *
 * staticLines.add(roadNetwork); // Built and uploaded once.
 * dynamicLines.add(projectilePath); // Updated frequently.
 * ```
 *
 * Buffer {@link WideLineRenderer#capacity} is measured in segments and grows automatically as
 * needed. Setting it in advance can avoid GPU buffer reallocations when the expected maximum
 * segment count is known. {@link WideLineRenderer#clear} removes the lines but retains this
 * capacity for reuse.
 *
 * ## Rendering behavior and limitations
 *
 * - Rendering is opaque. Packed colors contain rgb values, the alpha component of a {@link Color}
 *   is ignored and transparent lines are not supported.
 * - Widths use screen pixels by default. Set {@link WideLineRenderer#widthUnits} to
 *   {@link LINEWIDTH_WORLD} for camera-facing ribbons measured in world units.
 * - {@link WideLineRenderer#depthTest} and {@link WideLineRenderer#depthWrite} control interaction
 *   with the depth buffer. Both default to true.
 * - The renderer is added to the Immediate layer by default. Assign {@link WideLineRenderer#layer}
 *   to render it in another layer.
 * - The batch is not frustum culled. Disable the renderer using {@link WideLineRenderer#enabled}
 *   when none of its lines need to be rendered.
 * - Call {@link WideLineRenderer#destroy} to release the internal mesh, material and instance
 *   buffer. Detached lines remain usable and can be added to another renderer.
 *
 * See the following examples for interactive styling and update demonstrations:
 *
 * - {@link https://playcanvas.github.io/#/graphics/wide-line}
 * - {@link https://playcanvas.github.io/#/graphics/wide-lines-styles}
 * - {@link https://playcanvas.github.io/#/graphics/wide-lines-dynamic}
 *
 * @category Graphics
 */
export class WideLineRenderer {
    /**
     * Creates a new wide line renderer.
     *
     * @param {AppBase} app - The application.
     */
    constructor(app: AppBase);
    /** @type {WideLine[]} @ignore */
    _lines: WideLine[];
    /** @type {Layer} @ignore */
    _layer: Layer;
    _depthTest: boolean;
    _depthWrite: boolean;
    _enabled: boolean;
    _widthUnits: number;
    _capacity: number;
    _segmentCount: number;
    _dirty: boolean;
    _destroyed: boolean;
    /** @type {VertexBuffer|null} @ignore */
    _vertexBuffer: VertexBuffer | null;
    /** @type {Float32Array|null} @ignore */
    _instanceData: Float32Array | null;
    app: AppBase;
    device: import("../../index.js").GraphicsDevice;
    _vertexFormat: VertexFormat;
    material: ShaderMaterial;
    meshInstance: MeshInstance;
    /**
     * Adds a line to this renderer. A line can belong to only one renderer at a time.
     *
     * @param {WideLine} line - The line to add.
     */
    add(line: WideLine): void;
    /**
     * Removes a line from this renderer without modifying its point data or style.
     *
     * @param {WideLine} line - The line to remove.
     * @returns {boolean} True if the line was owned by this renderer and was removed.
     */
    remove(line: WideLine): boolean;
    /**
     * Removes all lines. Allocated instance capacity is retained for reuse.
     */
    clear(): void;
    /**
     * Releases all renderer-owned resources. Lines previously owned by this renderer remain
     * usable and can be added to another renderer.
     */
    destroy(): void;
    /**
     * The layer containing the renderer's mesh instance. Defaults to the Immediate layer.
     *
     * @type {Layer}
     */
    set layer(value: Layer);
    /**
     * Gets the layer containing the renderer's mesh instance.
     *
     * @type {Layer}
     */
    get layer(): Layer;
    /**
     * Whether lines are tested against the depth buffer. Defaults to true.
     *
     * @type {boolean}
     */
    set depthTest(value: boolean);
    /**
     * Gets whether lines are tested against the depth buffer.
     *
     * @type {boolean}
     */
    get depthTest(): boolean;
    /**
     * Whether lines write to the depth buffer. Defaults to true.
     *
     * @type {boolean}
     */
    set depthWrite(value: boolean);
    /**
     * Gets whether lines write to the depth buffer.
     *
     * @type {boolean}
     */
    get depthWrite(): boolean;
    /**
     * Whether this renderer is visible. Defaults to true.
     *
     * @type {boolean}
     */
    set enabled(value: boolean);
    /**
     * Gets whether this renderer is visible.
     *
     * @type {boolean}
     */
    get enabled(): boolean;
    /**
     * Units used to interpret line widths. Can be {@link LINEWIDTH_SCREEN} for screen pixels or
     * {@link LINEWIDTH_WORLD} for world units. World-unit lines are camera-facing ribbons, not
     * three-dimensional tubes. Defaults to {@link LINEWIDTH_SCREEN}.
     *
     * @type {number}
     */
    set widthUnits(value: number);
    /**
     * Gets the units used to interpret line widths.
     *
     * @type {number}
     */
    get widthUnits(): number;
    /**
     * Allocated instance capacity, measured in generated line segments. Defaults to zero and grows
     * automatically when required. Setting a smaller value releases unused capacity, but the
     * result is clamped to the number of segments currently required by the owned lines.
     *
     * @type {number}
     */
    set capacity(value: number);
    /**
     * Gets the allocated instance capacity, measured in generated line segments.
     *
     * @type {number}
     */
    get capacity(): number;
    /** @ignore */
    _lineChanged(line: any): void;
    /** @ignore */
    _onPrerender(): void;
    /** @ignore */
    _requiredSegmentCount(): number;
    /** @ignore */
    _resize(capacity: any): void;
    /** @ignore */
    _rebuild(): void;
    /** @ignore */
    _writeLine(data: any, instance: any, line: any): any;
    /** @ignore */
    _writePosition(data: any, offset: any, positions: any, point: any): any;
    /** @ignore */
    _writeColor(data: any, offset: any, colors: any, point: any): any;
    /** @ignore */
    _updateVisibility(): void;
}
import { WideLine } from './wide-line.js';
import type { Layer } from '../../scene/layer.js';
import { VertexBuffer } from '../../platform/graphics/vertex-buffer.js';
import type { AppBase } from '../../framework/app-base.js';
import { VertexFormat } from '../../platform/graphics/vertex-format.js';
import { ShaderMaterial } from '../../scene/materials/shader-material.js';
import { MeshInstance } from '../../scene/mesh-instance.js';
