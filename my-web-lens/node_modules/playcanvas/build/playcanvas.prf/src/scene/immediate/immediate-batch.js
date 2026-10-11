import { Mat4 } from "../../core/math/mat4.js";
import { PRIMITIVE_LINES } from "../../platform/graphics/constants.js";
import { Mesh } from "../mesh.js";
import { MeshInstance } from "../mesh-instance.js";
import { GraphNode } from "../graph-node.js";
const identityGraphNode = new GraphNode();
identityGraphNode.worldTransform = Mat4.IDENTITY;
identityGraphNode._dirtyWorld = identityGraphNode._dirtyNormal = false;
const MIN_VERTEX_CAPACITY = 256;
const SHRINK_FRAME_DELAY = 100;
class ImmediateBatch {
	_positions = new Float32Array(0);
	_colors = new Float32Array(0);
	_vertexCount = 0;
	_capacity = 0;
	_peakVertexCount = 0;
	_framesSinceHighUse = 0;
	constructor(device, material, layer) {
		this.material = material;
		this.layer = layer;
		this.mesh = new Mesh(device);
		this.meshInstance = null;
	}
	_reserve(count) {
		const required = this._vertexCount + count;
		if (required <= this._capacity) {
			return;
		}
		let capacity = Math.max(this._capacity, MIN_VERTEX_CAPACITY);
		while (capacity < required) {
			capacity *= 2;
		}
		this._setCapacity(capacity);
	}
	_setCapacity(capacity) {
		const positions = new Float32Array(capacity * 3);
		const colors = new Float32Array(capacity * 4);
		const retained = Math.min(this._vertexCount, capacity);
		if (retained > 0) {
			positions.set(this._positions.subarray(0, retained * 3));
			colors.set(this._colors.subarray(0, retained * 4));
		}
		this._positions = positions;
		this._colors = colors;
		this._capacity = capacity;
	}
	allocate(count) {
		this._reserve(count);
		const first = this._vertexCount;
		this._vertexCount += count;
		return first;
	}
	_writeUniformColor(color, first, count) {
		const dest = this._colors;
		const { r, g, b, a } = color;
		let c = first * 4;
		for (let i = 0; i < count; i++) {
			dest[c++] = r;
			dest[c++] = g;
			dest[c++] = b;
			dest[c++] = a;
		}
	}
	// add line positions and colors to the batch
	// this function expects position in Vec3 and colors in Color format
	addLines(positions, color) {
		const count = positions.length;
		const first = this._vertexCount;
		this._reserve(count);
		const destPos = this._positions;
		let p = first * 3;
		for (let i = 0; i < count; i++) {
			const pos = positions[i];
			destPos[p++] = pos.x;
			destPos[p++] = pos.y;
			destPos[p++] = pos.z;
		}
		if (color.length) {
			const destCol = this._colors;
			let c = first * 4;
			for (let i = 0; i < count; i++) {
				const col = color[i];
				destCol[c++] = col.r;
				destCol[c++] = col.g;
				destCol[c++] = col.b;
				destCol[c++] = col.a;
			}
		} else {
			this._writeUniformColor(color, first, count);
		}
		this._vertexCount += count;
	}
	// add line positions and colors to the batch
	// this function expects positions as arrays of numbers
	// and color as instance of Color or array of number specifying the same number of vertices as positions
	addLinesArrays(positions, color) {
		const floats = positions.length;
		const count = floats / 3;
		const first = this._vertexCount;
		this._reserve(count);
		const destPos = this._positions;
		let p = first * 3;
		for (let i = 0; i < floats; i++) {
			destPos[p++] = positions[i];
		}
		if (color.length) {
			const destCol = this._colors;
			const colorFloats = count * 4;
			let c = first * 4;
			for (let i = 0; i < colorFloats; i++) {
				destCol[c++] = color[i];
			}
		} else {
			this._writeUniformColor(color, first, count);
		}
		this._vertexCount += count;
	}
	onPreRender(visibleList, transparent) {
		if (this._vertexCount > 0 && this.material.transparent === transparent) {
			this.mesh.setPositions(this._positions, 3, this._vertexCount);
			this.mesh.setColors(this._colors, 4, this._vertexCount);
			this.mesh.update(PRIMITIVE_LINES, false);
			if (!this.meshInstance) {
				this.meshInstance = new MeshInstance(this.mesh, this.material, identityGraphNode);
				this.meshInstance.cull = false;
			}
			visibleList.push(this.meshInstance);
		}
	}
	clear() {
		if (this._vertexCount * 2 > this._capacity) {
			this._framesSinceHighUse = 0;
			this._peakVertexCount = 0;
		} else {
			this._framesSinceHighUse++;
			this._peakVertexCount = Math.max(this._peakVertexCount, this._vertexCount);
		}
		this._vertexCount = 0;
		if (this._framesSinceHighUse >= SHRINK_FRAME_DELAY && this._capacity > MIN_VERTEX_CAPACITY) {
			let capacity = MIN_VERTEX_CAPACITY;
			while (capacity < this._peakVertexCount) {
				capacity *= 2;
			}
			if (capacity < this._capacity) {
				this._setCapacity(capacity);
			}
			this._peakVertexCount = 0;
			this._framesSinceHighUse = 0;
		}
	}
}
export {
	ImmediateBatch
};
