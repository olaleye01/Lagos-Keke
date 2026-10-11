import { Geometry } from "./geometry.js";
class CircleGeometry extends Geometry {
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
  constructor(opts = {}) {
    super();
    const radius = opts.radius ?? 0.5;
    const sectors = Math.max(Math.floor(opts.sectors ?? 64), 3);
    const rings = Math.max(Math.floor(opts.rings ?? 8), 1);
    const ringExponent = opts.ringExponent ?? 1;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    positions.push(0, 0, 0);
    normals.push(0, 1, 0);
    uvs.push(0.5, 0.5);
    for (let r = 1; r <= rings; r++) {
      const ringRadius = radius * Math.pow(r / rings, ringExponent);
      for (let j = 0; j < sectors; j++) {
        const angle = 2 * Math.PI * j / sectors;
        const x = ringRadius * Math.cos(angle);
        const z = ringRadius * Math.sin(angle);
        positions.push(x, 0, z);
        normals.push(0, 1, 0);
        uvs.push(0.5 + x / (2 * radius), 0.5 + z / (2 * radius));
      }
    }
    const ringVertex = (r, j) => 1 + (r - 1) * sectors + j % sectors;
    for (let j = 0; j < sectors; j++) {
      indices.push(0, ringVertex(1, j + 1), ringVertex(1, j));
    }
    for (let r = 1; r < rings; r++) {
      for (let j = 0; j < sectors; j++) {
        const inner = ringVertex(r, j);
        const innerNext = ringVertex(r, j + 1);
        const outer = ringVertex(r + 1, j);
        const outerNext = ringVertex(r + 1, j + 1);
        indices.push(inner, outerNext, outer);
        indices.push(inner, innerNext, outerNext);
      }
    }
    this.positions = positions;
    this.normals = normals;
    this.uvs = uvs;
    this.uvs1 = uvs;
    this.indices = indices;
    if (opts.calculateTangents) {
      this.calculateTangents();
    }
  }
}
export {
  CircleGeometry
};
