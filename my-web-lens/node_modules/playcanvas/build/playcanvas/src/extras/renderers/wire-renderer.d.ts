/**
 * Renders wireframe shapes for a single frame, for debugging and visualization. Shapes are
 * submitted as line segments to the layer given by {@link WireRenderer#layer}, which defaults to
 * the {@link LAYERID_IMMEDIATE} layer, and are discarded once the frame has been rendered, so
 * they must be issued again on every frame they should be visible.
 *
 * The renderer holds the state used by the shapes it draws - {@link WireRenderer#color},
 * {@link WireRenderer#layer}, {@link WireRenderer#depthTest}, {@link WireRenderer#segments} and
 * {@link WireRenderer#transform}. Fields can be assigned between calls, and drawing many shapes
 * with the same state allocates nothing:
 *
 * ```javascript
 * const wire = new WireRenderer(app);
 * wire.color = Color.RED;
 *
 * app.on('update', () => {
 *     for (const item of items) {
 *         wire.sphere(item.position, item.radius);
 *     }
 * });
 * ```
 *
 * A second set of state is simply a second instance. Instances hold no GPU resources, and those
 * sharing a layer and depth test mode submit into the same batch, so using several has no
 * additional rendering cost:
 *
 * ```javascript
 * const xray = new WireRenderer(app);
 * xray.depthTest = false;
 * ```
 *
 * These are thin lines, one pixel wide. For thick lines with caps, joins and dashes, intended as
 * part of the rendered scene rather than as a debugging aid, see {@link WideLineRenderer} instead.
 *
 * @category Graphics
 */
export class WireRenderer {
    /**
     * Creates a new WireRenderer instance.
     *
     * @param {AppBase} app - The application.
     * @example
     * const wire = new WireRenderer(app);
     */
    constructor(app: AppBase);
    /**
     * The color used by shapes, specified in sRGB color space. The alpha component is respected.
     * Defaults to white.
     *
     * @type {Color}
     */
    color: Color;
    /**
     * The layer shapes are rendered into, or null to use the {@link LAYERID_IMMEDIATE} layer.
     * Defaults to null.
     *
     * @type {Layer|null}
     */
    layer: Layer | null;
    /**
     * Whether shapes are depth tested against the depth buffer. Defaults to true.
     *
     * @type {boolean}
     */
    depthTest: boolean;
    /**
     * The number of line segments used to approximate a full circle. Defaults to 20.
     *
     * @type {number}
     */
    segments: number;
    /**
     * A matrix applied to every point of every shape, or null for no transform. Assign this to
     * draw a group of shapes in the local space of a node. Defaults to null.
     *
     * @type {Mat4|null}
     */
    transform: Mat4 | null;
    app: AppBase;
    _scene: import("../../index.js").Scene;
    _immediate: import("../../scene/immediate/immediate.js").Immediate;
    /**
     * Cursor for the shape currently being written, valid only for the duration of one call.
     *
     * @type {LineWriter|null}
     * @private
     */
    private _writer;
    /**
     * Allocates room for a shape and points the cursor at it. The count must match exactly what
     * the shape goes on to write.
     *
     * @param {number} vertexCount - The number of vertices the shape writes. Two per segment.
     * @ignore
     */
    _begin(vertexCount: number): void;
    /**
     * @returns {number} The circle segment count, clamped to a usable range.
     * @ignore
     */
    _steps(): number;
    /**
     * Writes a single segment, applying {@link WireRenderer#transform}.
     *
     * @param {number} x0 - The start x coordinate.
     * @param {number} y0 - The start y coordinate.
     * @param {number} z0 - The start z coordinate.
     * @param {number} x1 - The end x coordinate.
     * @param {number} y1 - The end y coordinate.
     * @param {number} z1 - The end z coordinate.
     * @ignore
     */
    _segment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
    /**
     * Writes a single vertex with its own color, applying {@link WireRenderer#transform}.
     *
     * @param {number} x - The x coordinate.
     * @param {number} y - The y coordinate.
     * @param {number} z - The z coordinate.
     * @param {Color} color - The color of the vertex.
     * @ignore
     */
    _vertex(x: number, y: number, z: number, color: Color): void;
    /**
     * Appends a circular arc lying in the plane spanned by the two supplied tangents.
     *
     * @param {Vec3} center - The center of the arc.
     * @param {Vec3} u - The first tangent of the arc plane, normalized.
     * @param {Vec3} v - The second tangent of the arc plane, normalized.
     * @param {number} radius - The radius of the arc.
     * @param {number} steps - The number of segments used by the arc.
     * @param {number} [start] - The start angle in radians. Defaults to 0.
     * @param {number} [sweep] - The swept angle in radians. Defaults to a full circle.
     * @ignore
     */
    _arc(center: Vec3, u: Vec3, v: Vec3, radius: number, steps: number, start?: number, sweep?: number): void;
    /**
     * Writes a list of points, expanding a strip into discrete segments when requested.
     *
     * @param {Vec3[]} positions - The points to write.
     * @param {Color[]|undefined} colors - One color per point, or undefined to use
     * {@link WireRenderer#color}.
     * @param {boolean} strip - True to connect consecutive points, false to treat them as pairs.
     * @param {boolean} closed - True to also connect the last point back to the first. Only used
     * when `strip` is true.
     * @ignore
     */
    _writePoints(positions: Vec3[], colors: Color[] | undefined, strip: boolean, closed: boolean): void;
    /**
     * Renders a single line segment.
     *
     * @param {Vec3} start - The start of the line, in world space.
     * @param {Vec3} end - The end of the line, in world space.
     * @example
     * wire.line(new Vec3(0, 0, 0), new Vec3(0, 1, 0));
     */
    line(start: Vec3, end: Vec3): void;
    /**
     * Renders discrete line segments, formed by consecutive pairs of points.
     *
     * @param {Vec3[]} positions - The points to draw lines between. The length must be a multiple
     * of two.
     * @param {Color[]} [colors] - One color per point, or undefined to use
     * {@link WireRenderer#color}. The color of each segment is interpolated between its ends.
     * @example
     * wire.lines([start, end], [Color.RED, Color.WHITE]);
     */
    lines(positions: Vec3[], colors?: Color[]): void;
    /**
     * Renders discrete line segments from packed arrays of numbers. This is the fastest of the
     * line functions, as it avoids reading individual {@link Vec3} and {@link Color} instances.
     *
     * @param {number[]|Float32Array} positions - Packed xyz coordinates, forming pairs of points.
     * @param {number[]|Float32Array} [colors] - Packed rgba values, one color per point, or
     * undefined to use {@link WireRenderer#color}.
     * @example
     * wire.linesPacked([0, 0, 0, 0, 1, 0]);
     */
    linesPacked(positions: number[] | Float32Array, colors?: number[] | Float32Array): void;
    /**
     * Renders an open strip of connected line segments.
     *
     * @param {Vec3[]} positions - The points of the strip, in order.
     * @param {Color[]} [colors] - One color per point, or undefined to use
     * {@link WireRenderer#color}.
     * @example
     * wire.polyline(trajectory);
     */
    polyline(positions: Vec3[], colors?: Color[]): void;
    /**
     * Renders a closed strip of connected line segments, joining the last point back to the first.
     *
     * @param {Vec3[]} positions - The points of the loop, in order.
     * @param {Color[]} [colors] - One color per point, or undefined to use
     * {@link WireRenderer#color}.
     * @example
     * wire.loop(outline);
     */
    loop(positions: Vec3[], colors?: Color[]): void;
    /**
     * Renders the edges of a box specified by its min and max corners.
     *
     * @param {Vec3} min - The min corner of the box.
     * @param {Vec3} max - The max corner of the box.
     * @example
     * wire.boxMinMax(new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
     */
    boxMinMax(min: Vec3, max: Vec3): void;
    /**
     * Renders the edges of a bounding box. An {@link OrientedBox} is rendered in its own
     * orientation, composed with {@link WireRenderer#transform}.
     *
     * @param {BoundingBox|OrientedBox} box - The box to render.
     * @example
     * wire.box(meshInstance.aabb);
     */
    box(box: BoundingBox | OrientedBox): void;
    /**
     * Renders a sphere as three great circles, one in each of the primary planes.
     *
     * @param {Vec3} center - The center of the sphere.
     * @param {number} radius - The radius of the sphere.
     * @example
     * wire.sphere(new Vec3(0, 1, 0), 0.5);
     */
    sphere(center: Vec3, radius: number): void;
    /**
     * Renders a circle lying in the plane described by a normal.
     *
     * @param {Vec3} center - The center of the circle.
     * @param {Vec3} normal - The normal of the plane containing the circle. Need not be
     * normalized.
     * @param {number} radius - The radius of the circle.
     * @example
     * wire.circle(Vec3.ZERO, Vec3.UP, 5);
     */
    circle(center: Vec3, normal: Vec3, radius: number): void;
    /**
     * Renders a cylinder as a ring at each end joined by four side lines.
     *
     * @param {Vec3} start - The center of the start cap.
     * @param {Vec3} end - The center of the end cap.
     * @param {number} radius - The radius of the cylinder.
     * @example
     * wire.cylinder(base, tip, 0.5);
     */
    cylinder(start: Vec3, end: Vec3, radius: number): void;
    /**
     * Appends the four longitudinal lines joining two rings, using the basis in `_u` and `_v`.
     *
     * @param {Vec3} start - The center of the start ring.
     * @param {Vec3} end - The center of the end ring.
     * @param {number} radius - The radius of both rings.
     * @ignore
     */
    _sideLines(start: Vec3, end: Vec3, radius: number): void;
    /**
     * Renders a capsule as a ring and hemispherical cap at each end, joined by four side lines.
     *
     * @param {Vec3} start - The center of the start cap sphere.
     * @param {Vec3} end - The center of the end cap sphere.
     * @param {number} radius - The radius of the capsule.
     * @example
     * wire.capsule(feet, head, 0.4);
     */
    capsule(start: Vec3, end: Vec3, radius: number): void;
    /**
     * Renders a cone as a base ring joined to its apex by four side lines. The parameters match
     * those describing a spot light, so a light's cone can be visualized directly.
     *
     * @param {Vec3} apex - The tip of the cone.
     * @param {Vec3} direction - The direction the cone opens along. Need not be normalized.
     * @param {number} angle - The half-angle of the cone, in degrees, measured from `direction` to
     * the cone edge.
     * @param {number} length - The distance from the apex to the base.
     * @example
     * wire.cone(position, direction, 30, 10);
     */
    cone(apex: Vec3, direction: Vec3, angle: number, length: number): void;
    /**
     * Renders a square section of a plane, with a short stub along its normal.
     *
     * The rotation of the square within its plane is derived from the normal, and no such
     * derivation is continuous over all directions. An animated normal will therefore make the
     * square appear to jump as it passes the direction where the derivation switches. To rotate a
     * square smoothly, pass a fixed normal and drive {@link WireRenderer#transform} instead.
     *
     * @param {Vec3} center - The center of the square.
     * @param {Vec3} normal - The normal of the plane. Need not be normalized.
     * @param {number} size - The side length of the square.
     * @example
     * wire.plane(Vec3.ZERO, Vec3.UP, 10);
     */
    plane(center: Vec3, normal: Vec3, size: number): void;
    /**
     * Renders a small axis-aligned cross marking a position.
     *
     * @param {Vec3} position - The position to mark.
     * @param {number} size - The overall length of each arm of the cross.
     * @example
     * wire.point(hit.point, 0.2);
     */
    point(position: Vec3, size: number): void;
    /**
     * Renders an arrow, as a shaft with four barbs at its tip.
     *
     * @param {Vec3} from - The tail of the arrow.
     * @param {Vec3} to - The tip of the arrow.
     * @example
     * wire.arrow(position, position.clone().add(velocity));
     */
    arrow(from: Vec3, to: Vec3): void;
    /**
     * Renders the three axes of a matrix, colored red, green and blue for x, y and z respectively.
     * This function ignores {@link WireRenderer#color}.
     *
     * @param {Mat4} matrix - The transform whose axes are rendered.
     * @param {number} size - The length of each axis.
     * @example
     * wire.axes(entity.getWorldTransform(), 1);
     */
    axes(matrix: Mat4, size: number): void;
    /**
     * Renders the edges of a view frustum. The camera does not need to be enabled or rendering,
     * so the view volume of an inactive camera can be visualized.
     *
     * @param {CameraComponent|Mat4} source - A camera, or a view-projection matrix.
     * @example
     * wire.frustum(otherCamera.camera);
     */
    frustum(source: CameraComponent | Mat4): void;
    /**
     * Renders the shape and extent of a light, using the light's own color. An omni light is drawn
     * as a sphere of its range, a spot light as its cone, and a directional light as an arrow
     * showing the direction it shines in. A light shines along the negative y-axis of its entity,
     * so the shape follows that axis rather than the entity's forward direction.
     *
     * @param {LightComponent} light - The light to render.
     * @param {number} [size] - The length of the arrow used for a directional light, which has no
     * inherent extent. Defaults to 1.
     * @example
     * wire.light(entity.light);
     */
    light(light: LightComponent, size?: number): void;
}
import { Color } from '../../core/math/color.js';
import type { Layer } from '../../scene/layer.js';
import { Mat4 } from '../../core/math/mat4.js';
import type { AppBase } from '../../framework/app-base.js';
import { Vec3 } from '../../core/math/vec3.js';
import type { BoundingBox } from '../../core/shape/bounding-box.js';
import type { OrientedBox } from '../../core/shape/oriented-box.js';
import type { CameraComponent } from '../../framework/components/camera/component.js';
import type { LightComponent } from '../../framework/components/light/component.js';
