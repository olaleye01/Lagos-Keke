import {
    Color,
    Entity,
    Mat4,
    Mesh,
    MeshInstance,
    Quat,
    StandardMaterial,
    Vec3
} from 'playcanvas';

const MAX_VERTS = 65532; // multiple of 3, fits Uint16 indices

const _a = new Vec3();
const _b = new Vec3();
const _c = new Vec3();
const _d = new Vec3();
const _e1 = new Vec3();
const _e2 = new Vec3();
const _n = new Vec3();
const _center = new Vec3();
const _q = new Quat();
const _s = new Vec3();
const _p = new Vec3();

/** Shared vertex-coloured, flat-shaded material for all low-poly geometry. */
let sharedMaterial = null;
export function getLowPolyMaterial() {
    if (!sharedMaterial) {
        const m = new StandardMaterial();
        m.diffuse = new Color(1, 1, 1);
        m.diffuseVertexColor = true;
        m.vertexColorGamma = true;
        m.specular = new Color(0.04, 0.04, 0.04);
        m.gloss = 0.25;
        m.update();
        sharedMaterial = m;
    }
    return sharedMaterial;
}

/**
 * Accumulates non-indexed, flat-shaded triangles with per-face colours. Every primitive is
 * oriented outward automatically, so callers never have to think about winding order.
 */
export class GeoBuilder {
    constructor(rand = Math.random) {
        this.positions = [];
        this.normals = [];
        this.colors = [];
        this.rand = rand;
    }

    get vertexCount() {
        return this.positions.length / 3;
    }

    /**
     * @param {Vec3} a
     * @param {Vec3} b
     * @param {Vec3} c
     * @param {number[]} color sRGB 0-255
     * @param {Vec3|null} outward Direction the face should point; winding is flipped to match.
     * @param {number} jitter Random brightness variation for a hand-made low-poly look.
     */
    tri(a, b, c, color, outward = null, jitter = 0) {
        _e1.sub2(b, a);
        _e2.sub2(c, a);
        _n.cross(_e1, _e2);
        const len = _n.length();
        if (len < 1e-9) return;
        _n.mulScalar(1 / len);
        let p1 = b;
        let p2 = c;
        if (outward && _n.dot(outward) < 0) {
            p1 = c;
            p2 = b;
            _n.mulScalar(-1);
        }
        const k = jitter ? 1 + (this.rand() - 0.5) * jitter : 1;
        const r = Math.min(255, color[0] * k);
        const g = Math.min(255, color[1] * k);
        const bl = Math.min(255, color[2] * k);
        for (const p of [a, p1, p2]) {
            this.positions.push(p.x, p.y, p.z);
            this.normals.push(_n.x, _n.y, _n.z);
            this.colors.push(r, g, bl, 255);
        }
    }

    quad(a, b, c, d, color, outward = null, jitter = 0) {
        // keep both halves the same shade
        const k = jitter ? 1 + (this.rand() - 0.5) * jitter : 1;
        const col = [color[0] * k, color[1] * k, color[2] * k];
        this.tri(a, b, c, col, outward);
        this.tri(a, c, d, col, outward);
    }

    /** Horizontal quad facing up. */
    flat(x0, z0, x1, z1, y, color, jitter = 0) {
        _a.set(x0, y, z0);
        _b.set(x1, y, z0);
        _c.set(x1, y, z1);
        _d.set(x0, y, z1);
        this.quad(_a, _b, _c, _d, color, Vec3.UP, jitter);
    }

    /** Build a transform from position, euler degrees and scale. */
    static trs(px, py, pz, ex, ey, ez, sx, sy, sz) {
        _p.set(px, py, pz);
        _q.setFromEulerAngles(ex, ey, ez);
        _s.set(sx, sy, sz);
        return new Mat4().setTRS(_p, _q, _s);
    }

    /** Convex polyhedron helper: faces given as arrays of local points, oriented away from centre. */
    _convex(m, localCenter, faces, colorFn, jitter) {
        m.transformPoint(localCenter, _center);
        const out = new Vec3();
        faces.forEach((face, i) => {
            const pts = face.map(p => m.transformPoint(new Vec3(p[0], p[1], p[2])));
            const fc = new Vec3();
            pts.forEach(p => fc.add(p));
            fc.mulScalar(1 / pts.length);
            out.sub2(fc, _center);
            const col = colorFn(i);
            const k = jitter ? 1 + (this.rand() - 0.5) * jitter : 1;
            const shaded = [col[0] * k, col[1] * k, col[2] * k];
            for (let j = 1; j < pts.length - 1; j++) {
                this.tri(pts[0], pts[j], pts[j + 1], shaded, out);
            }
        });
    }

    /** Unit cube centred on the origin, transformed by `m`. `color` may be a function of face index (0:+x 1:-x 2:+y 3:-y 4:+z 5:-z). */
    box(m, color, jitter = 0.06) {
        const h = 0.5;
        const faces = [
            [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]],
            [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]],
            [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]],
            [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]],
            [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]],
            [[-h, -h, -h], [-h, h, -h], [h, h, -h], [h, -h, -h]]
        ];
        const fn = typeof color === 'function' ? color : () => color;
        this._convex(m, new Vec3(0, 0, 0), faces, fn, jitter);
    }

    /** Axis-aligned box helper in world space with optional yaw. */
    boxAt(x, y, z, sx, sy, sz, color, yaw = 0, jitter = 0.06) {
        this.box(GeoBuilder.trs(x, y, z, 0, yaw, 0, sx, sy, sz), color, jitter);
    }

    /** Gable roof: base on y=0 spanning -0.5..0.5 in x/z, ridge along x at y=1. */
    gable(m, color, jitter = 0.08) {
        const faces = [
            [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 1, 0], [-0.5, 1, 0]],
            [[-0.5, 0, 0.5], [-0.5, 1, 0], [0.5, 1, 0], [0.5, 0, 0.5]],
            [[-0.5, 0, -0.5], [-0.5, 1, 0], [-0.5, 0, 0.5]],
            [[0.5, 0, -0.5], [0.5, 0, 0.5], [0.5, 1, 0]],
            [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5]]
        ];
        const fn = typeof color === 'function' ? color : () => color;
        this._convex(m, new Vec3(0, 0.3, 0), faces, fn, jitter);
    }

    /** Hip (pyramid) roof: square base at y=0 spanning -0.5..0.5, apex at y=1. */
    pyramid(m, color, jitter = 0.08) {
        const apex = [0, 1, 0];
        const b = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]];
        const faces = [
            [b[0], b[1], apex],
            [b[1], b[2], apex],
            [b[2], b[3], apex],
            [b[3], b[0], apex],
            [b[0], b[3], b[2], b[1]]
        ];
        const fn = typeof color === 'function' ? color : () => color;
        this._convex(m, new Vec3(0, 0.25, 0), faces, fn, jitter);
    }

    /** Cylinder / frustum along local +Y from y=0..1, radius 1 at bottom and `topScale` at top. */
    cylinder(m, segments, color, topScale = 1, jitter = 0.06, capColor = null) {
        const faces = [];
        const bottom = [];
        const top = [];
        for (let i = 0; i < segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            bottom.push([Math.cos(t), 0, Math.sin(t)]);
            top.push([Math.cos(t) * topScale, 1, Math.sin(t) * topScale]);
        }
        for (let i = 0; i < segments; i++) {
            const j = (i + 1) % segments;
            if (topScale > 0.001) faces.push([bottom[i], bottom[j], top[j], top[i]]);
            else faces.push([bottom[i], bottom[j], [0, 1, 0]]);
        }
        const sideCount = faces.length;
        faces.push([...bottom].reverse());
        if (topScale > 0.001) faces.push(top);
        const fn = i => (i >= sideCount && capColor ? capColor : color);
        this._convex(m, new Vec3(0, 0.5, 0), faces, fn, jitter);
    }

    /** Irregular flat disc (puddles, potholes) on the ground. */
    blob(x, y, z, radius, segments, color, rand = this.rand, roughness = 0.3) {
        const center = new Vec3(x, y, z);
        const ring = [];
        for (let i = 0; i < segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            const r = radius * (1 - roughness / 2 + rand() * roughness);
            ring.push(new Vec3(x + Math.cos(t) * r, y, z + Math.sin(t) * r));
        }
        for (let i = 0; i < segments; i++) {
            this.tri(center, ring[i], ring[(i + 1) % segments], color, Vec3.UP);
        }
    }

    /** Merge everything into one or more meshes. */
    toMeshes(device) {
        const meshes = [];
        const total = this.vertexCount;
        for (let start = 0; start < total; start += MAX_VERTS) {
            const count = Math.min(MAX_VERTS, total - start);
            const mesh = new Mesh(device);
            mesh.setPositions(new Float32Array(this.positions.slice(start * 3, (start + count) * 3)));
            mesh.setNormals(new Float32Array(this.normals.slice(start * 3, (start + count) * 3)));
            mesh.setColors32(new Uint8Array(this.colors.slice(start * 4, (start + count) * 4)));
            const indices = new Uint16Array(count);
            for (let i = 0; i < count; i++) indices[i] = i;
            mesh.setIndices(indices);
            mesh.update();
            meshes.push(mesh);
        }
        return meshes;
    }

    /** Create an entity rendering this geometry with the shared low-poly material. */
    toEntity(app, name, { castShadows = true, receiveShadows = true } = {}) {
        const entity = new Entity(name);
        const material = getLowPolyMaterial();
        const meshInstances = this.toMeshes(app.graphicsDevice).map(mesh => new MeshInstance(mesh, material));
        entity.addComponent('render', { meshInstances, castShadows, receiveShadows });
        return entity;
    }
}
