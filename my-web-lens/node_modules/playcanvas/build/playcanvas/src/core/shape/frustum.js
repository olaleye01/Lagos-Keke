import { Plane } from "./plane.js";
import { Vec3 } from "../math/vec3.js";
const _c23 = new Vec3();
const _c31 = new Vec3();
const _c12 = new Vec3();
const _corner = new Vec3();
const _scratchPlanes = [new Plane(), new Plane(), new Plane(), new Plane(), new Plane(), new Plane()];
function intersectPlanes(p1, p2, p3, out) {
	_c23.cross(p2.normal, p3.normal);
	const denom = p1.normal.dot(_c23);
	if (Math.abs(denom) < 1e-6) {
		return false;
	}
	_c31.cross(p3.normal, p1.normal);
	_c12.cross(p1.normal, p2.normal);
	const invDenom = -1 / denom;
	out.set(
		(p1.distance * _c23.x + p2.distance * _c31.x + p3.distance * _c12.x) * invDenom,
		(p1.distance * _c23.y + p2.distance * _c31.y + p3.distance * _c12.y) * invDenom,
		(p1.distance * _c23.z + p2.distance * _c31.z + p3.distance * _c12.z) * invDenom
	);
	return isFinite(out.x) && isFinite(out.y) && isFinite(out.z);
}
class Frustum {
	planeData = new Float32Array(24);
	// eslint-disable-next-line no-useless-constructor
	constructor() {
	}
	get planes() {
		return [];
	}
	clone() {
		const cstr = this.constructor;
		return new cstr().copy(this);
	}
	copy(src) {
		this.planeData.set(src.planeData);
		return this;
	}
	getPlane(index, result) {
		const data = this.planeData;
		const offset = index * 4;
		result.normal.set(data[offset], data[offset + 1], data[offset + 2]);
		result.distance = data[offset + 3];
		return result;
	}
	setPlane(index, plane) {
		const { normal, distance } = plane;
		this._setPlane(index, normal.x, normal.y, normal.z, distance);
		return this;
	}
	_setPlane(index, nx, ny, nz, distance) {
		const invLength = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
		const data = this.planeData;
		const offset = index * 4;
		data[offset] = nx * invLength;
		data[offset + 1] = ny * invLength;
		data[offset + 2] = nz * invLength;
		data[offset + 3] = distance * invLength;
	}
	setFromMat4(matrix) {
		const d = matrix.data;
		const m00 = d[0], m01 = d[1], m02 = d[2], m03 = d[3];
		const m10 = d[4], m11 = d[5], m12 = d[6], m13 = d[7];
		const m20 = d[8], m21 = d[9], m22 = d[10], m23 = d[11];
		const m30 = d[12], m31 = d[13], m32 = d[14], m33 = d[15];
		this._setPlane(0, m03 - m00, m13 - m10, m23 - m20, m33 - m30);
		this._setPlane(1, m03 + m00, m13 + m10, m23 + m20, m33 + m30);
		this._setPlane(2, m03 + m01, m13 + m11, m23 + m21, m33 + m31);
		this._setPlane(3, m03 - m01, m13 - m11, m23 - m21, m33 - m31);
		this._setPlane(4, m03 - m02, m13 - m12, m23 - m22, m33 - m32);
		this._setPlane(5, m03 + m02, m13 + m12, m23 + m22, m33 + m32);
	}
	containsPoint(point) {
		const data = this.planeData;
		const { x, y, z } = point;
		for (let offset = 0; offset < 24; offset += 4) {
			if (data[offset] * x + data[offset + 1] * y + data[offset + 2] * z + data[offset + 3] <= 0) {
				return false;
			}
		}
		return true;
	}
	add(other) {
		const data = this.planeData;
		for (let p = 0; p < 6; p++) {
			other.getPlane(p, _scratchPlanes[p]);
		}
		for (let zi = 4; zi <= 5; zi++) {
			for (let xi = 0; xi <= 1; xi++) {
				for (let yi = 2; yi <= 3; yi++) {
					if (intersectPlanes(_scratchPlanes[zi], _scratchPlanes[xi], _scratchPlanes[yi], _corner)) {
						for (let offset = 0; offset < 24; offset += 4) {
							const d = data[offset] * _corner.x + data[offset + 1] * _corner.y + data[offset + 2] * _corner.z + data[offset + 3];
							if (d < 0) {
								data[offset + 3] -= d;
							}
						}
					}
				}
			}
		}
		return this;
	}
	containsSphere(sphere) {
		const data = this.planeData;
		const { center, radius } = sphere;
		const { x, y, z } = center;
		let c = 0;
		for (let offset = 0; offset < 24; offset += 4) {
			const d = data[offset] * x + data[offset + 1] * y + data[offset + 2] * z + data[offset + 3];
			if (d <= -radius) {
				return 0;
			}
			if (d > radius) {
				c++;
			}
		}
		return c === 6 ? 2 : 1;
	}
	containsAabb(aabb) {
		const data = this.planeData;
		const { center, halfExtents } = aabb;
		const { x, y, z } = center;
		const ex = halfExtents.x, ey = halfExtents.y, ez = halfExtents.z;
		for (let offset = 0; offset < 24; offset += 4) {
			const nx = data[offset], ny = data[offset + 1], nz = data[offset + 2];
			const extent = Math.abs(nx) * ex + Math.abs(ny) * ey + Math.abs(nz) * ez;
			if (nx * x + ny * y + nz * z + data[offset + 3] <= -extent) {
				return false;
			}
		}
		return true;
	}
}
export {
	Frustum
};
