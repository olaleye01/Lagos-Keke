import { Geometry } from "./geometry.js";
class CircleGeometry extends Geometry {
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
