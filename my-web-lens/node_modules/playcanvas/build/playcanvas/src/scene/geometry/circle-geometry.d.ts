/**
 * A procedural circle-shaped geometry - a flat disc in the XZ plane.
 *
 * Typically, you would:
 *
 * 1. Create a CircleGeometry instance.
 * 2. Generate a {@link Mesh} from the geometry.
 * 3. Create a {@link MeshInstance} referencing the mesh.
 * 4. Create an {@link Entity} with a {@link RenderComponent} and assign the {@link MeshInstance} to it.
 * 5. Add the entity to the {@link Scene}.
 *
 * ```javascript
 * // Create a mesh instance
 * const geometry = new CircleGeometry();
 * const mesh = Mesh.fromGeometry(app.graphicsDevice, geometry);
 * const material = new StandardMaterial();
 * const meshInstance = new MeshInstance(mesh, material);
 *
 * // Create an entity
 * const entity = new Entity();
 * entity.addComponent('render', {
 *     meshInstances: [meshInstance]
 * });
 *
 * // Add the entity to the scene hierarchy
 * app.scene.root.addChild(entity);
 * ```
 *
 * @category Graphics
 */
export class CircleGeometry extends Geometry {
    /**
     * Create a new CircleGeometry instance.
     *
     * By default, the constructor creates a circle centered on the object space origin with a
     * radius of 0.5, 64 sectors and 8 rings. The normal vector of the circle is aligned along the
     * positive Y axis. The circle is created with UVs in the range of 0 to 1, mapped planarly
     * across its bounding square.
     *
     * @param {object} [opts] - Options object.
     * @param {number} [opts.radius] - The radius of the circle. Defaults to 0.5.
     * @param {number} [opts.sectors] - The number of divisions around the circumference of the
     * circle. Defaults to 64.
     * @param {number} [opts.rings] - The number of concentric rings of vertices between the center
     * and the outer edge of the circle. Defaults to 8.
     * @param {number} [opts.ringExponent] - Controls the radial distribution of the rings. A value
     * of 1 spaces the rings uniformly, larger values concentrate the rings (and so the
     * tessellation detail) towards the center of the circle. Defaults to 1.
     * @param {boolean} [opts.calculateTangents] - Generate tangent information. Defaults to false.
     * @example
     * const geometry = new CircleGeometry({
     *     radius: 100,
     *     sectors: 128,
     *     rings: 64,
     *     ringExponent: 2
     * });
     */
    constructor(opts?: {
        radius?: number;
        sectors?: number;
        rings?: number;
        ringExponent?: number;
        calculateTangents?: boolean;
    });
    positions: number[];
    normals: number[];
    uvs: number[];
    uvs1: number[];
    indices: number[];
}
import { Geometry } from './geometry.js';
