import { Color } from "../../core/math/color.js";
import { Mat4 } from "../../core/math/mat4.js";
import { Vec3 } from "../../core/math/vec3.js";
import { VIEW_CENTER } from "../../scene/constants.js";
const _u = new Vec3();
const _v = new Vec3();
const _dir = new Vec3();
const _pos = new Vec3();
const _head = new Vec3();
const _lightDir = new Vec3();
const _mat = new Mat4();
const _view = new Mat4();
const _proj = new Mat4();
const _color = new Color();
const DEG_TO_RAD = Math.PI / 180;
const NDC_CORNERS = [
	-1,
	-1,
	-1,
	1,
	-1,
	-1,
	1,
	1,
	-1,
	-1,
	1,
	-1,
	-1,
	-1,
	1,
	1,
	-1,
	1,
	1,
	1,
	1,
	-1,
	1,
	1
];
const FRUSTUM_EDGES = [
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	0,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	4,
	0,
	4,
	1,
	5,
	2,
	6,
	3,
	7
];
const _corners = [];
for (let i = 0; i < 8; i++) {
	_corners.push(new Vec3());
}
const buildBasis = (dir) => {
	if (Math.abs(dir.x) < 0.5) {
		_u.set(1, 0, 0);
	} else {
		_u.set(0, 1, 0);
	}
	_v.cross(dir, _u).normalize();
	_u.cross(_v, dir).normalize();
};
class WireRenderer {
	color = new Color(1, 1, 1, 1);
	layer = null;
	depthTest = true;
	segments = 20;
	transform = null;
	constructor(app) {
		this.app = app;
		this._scene = app.scene;
		this._immediate = app.scene.immediate;
		this._writer = null;
	}
	_begin(vertexCount) {
		this._writer = this._immediate.allocateLines(
			vertexCount,
			this.color,
			this.depthTest,
			this.layer ?? this._scene.defaultDrawLayer
		);
	}
	_steps() {
		return Math.max(3, Math.floor(this.segments));
	}
	_segment(x0, y0, z0, x1, y1, z1) {
		const m = this.transform;
		if (m) {
			const d = m.data;
			this._writer.segment(
				d[0] * x0 + d[4] * y0 + d[8] * z0 + d[12],
				d[1] * x0 + d[5] * y0 + d[9] * z0 + d[13],
				d[2] * x0 + d[6] * y0 + d[10] * z0 + d[14],
				d[0] * x1 + d[4] * y1 + d[8] * z1 + d[12],
				d[1] * x1 + d[5] * y1 + d[9] * z1 + d[13],
				d[2] * x1 + d[6] * y1 + d[10] * z1 + d[14]
			);
		} else {
			this._writer.segment(x0, y0, z0, x1, y1, z1);
		}
	}
	_vertex(x, y, z, color) {
		const m = this.transform;
		if (m) {
			const d = m.data;
			this._writer.vertex(
				d[0] * x + d[4] * y + d[8] * z + d[12],
				d[1] * x + d[5] * y + d[9] * z + d[13],
				d[2] * x + d[6] * y + d[10] * z + d[14],
				color.r,
				color.g,
				color.b,
				color.a
			);
		} else {
			this._writer.vertex(x, y, z, color.r, color.g, color.b, color.a);
		}
	}
	_arc(center, u, v, radius, steps, start = 0, sweep = Math.PI * 2) {
		const writer = this._writer;
		const positions = writer.positions;
		const colors = writer.colors;
		let k = writer.cursor;
		const { r, g, b, a } = this.color;
		const m = this.transform;
		const d = m ? m.data : null;
		const cx = center.x, cy = center.y, cz = center.z;
		const ux = u.x, uy = u.y, uz = u.z;
		const vx = v.x, vy = v.y, vz = v.z;
		const step = sweep / steps;
		let angle = start;
		let c0 = Math.cos(angle) * radius;
		let s0 = Math.sin(angle) * radius;
		for (let i = 0; i < steps; i++) {
			angle += step;
			const c1 = Math.cos(angle) * radius;
			const s1 = Math.sin(angle) * radius;
			let x0 = cx + ux * c0 + vx * s0;
			let y0 = cy + uy * c0 + vy * s0;
			let z0 = cz + uz * c0 + vz * s0;
			let x1 = cx + ux * c1 + vx * s1;
			let y1 = cy + uy * c1 + vy * s1;
			let z1 = cz + uz * c1 + vz * s1;
			if (d) {
				const ax = x0, ay = y0, az = z0;
				const bx = x1, by = y1, bz = z1;
				x0 = d[0] * ax + d[4] * ay + d[8] * az + d[12];
				y0 = d[1] * ax + d[5] * ay + d[9] * az + d[13];
				z0 = d[2] * ax + d[6] * ay + d[10] * az + d[14];
				x1 = d[0] * bx + d[4] * by + d[8] * bz + d[12];
				y1 = d[1] * bx + d[5] * by + d[9] * bz + d[13];
				z1 = d[2] * bx + d[6] * by + d[10] * bz + d[14];
			}
			let p = k * 3;
			positions[p++] = x0;
			positions[p++] = y0;
			positions[p++] = z0;
			positions[p++] = x1;
			positions[p++] = y1;
			positions[p] = z1;
			let c = k * 4;
			colors[c++] = r;
			colors[c++] = g;
			colors[c++] = b;
			colors[c++] = a;
			colors[c++] = r;
			colors[c++] = g;
			colors[c++] = b;
			colors[c] = a;
			k += 2;
			c0 = c1;
			s0 = s1;
		}
		writer.cursor = k;
	}
	_writePoints(positions, colors, strip, closed) {
		const count = positions.length;
		const segments = strip ? closed ? count : count - 1 : count / 2;
		this._begin(segments * 2);
		if (colors) {
			if (strip) {
				for (let i = 0; i < segments; i++) {
					const next = (i + 1) % count;
					this._vertex(positions[i].x, positions[i].y, positions[i].z, colors[i]);
					this._vertex(positions[next].x, positions[next].y, positions[next].z, colors[next]);
				}
			} else {
				for (let i = 0; i < count; i++) {
					this._vertex(positions[i].x, positions[i].y, positions[i].z, colors[i]);
				}
			}
		} else if (strip) {
			for (let i = 0; i < segments; i++) {
				const a = positions[i];
				const b = positions[(i + 1) % count];
				this._segment(a.x, a.y, a.z, b.x, b.y, b.z);
			}
		} else {
			for (let i = 0; i < count; i += 2) {
				const a = positions[i];
				const b = positions[i + 1];
				this._segment(a.x, a.y, a.z, b.x, b.y, b.z);
			}
		}
	}
	line(start, end) {
		this._begin(2);
		this._segment(start.x, start.y, start.z, end.x, end.y, end.z);
	}
	lines(positions, colors) {
		if (!this.transform) {
			this.app.drawLines(positions, colors ?? this.color, this.depthTest, this.layer ?? void 0);
			return;
		}
		this._writePoints(positions, colors, false, false);
	}
	linesPacked(positions, colors) {
		if (!this.transform) {
			this.app.drawLineArrays(positions, colors ?? this.color, this.depthTest, this.layer ?? void 0);
			return;
		}
		const count = positions.length / 3;
		this._begin(count);
		if (colors) {
			for (let i = 0, p = 0, c = 0; i < count; i++, p += 3, c += 4) {
				_color.set(colors[c], colors[c + 1], colors[c + 2], colors[c + 3]);
				this._vertex(positions[p], positions[p + 1], positions[p + 2], _color);
			}
		} else {
			for (let i = 0, p = 0; i < count; i += 2, p += 6) {
				this._segment(
					positions[p],
					positions[p + 1],
					positions[p + 2],
					positions[p + 3],
					positions[p + 4],
					positions[p + 5]
				);
			}
		}
	}
	polyline(positions, colors) {
		if (positions.length < 2) {
			return;
		}
		this._writePoints(positions, colors, true, false);
	}
	loop(positions, colors) {
		if (positions.length < 2) {
			return;
		}
		this._writePoints(positions, colors, true, true);
	}
	boxMinMax(min, max) {
		this._begin(12 * 2);
		const { x: ax, y: ay, z: az } = min;
		const { x: bx, y: by, z: bz } = max;
		this._segment(ax, ay, az, bx, ay, az);
		this._segment(bx, ay, az, bx, by, az);
		this._segment(bx, by, az, ax, by, az);
		this._segment(ax, by, az, ax, ay, az);
		this._segment(ax, ay, bz, bx, ay, bz);
		this._segment(bx, ay, bz, bx, by, bz);
		this._segment(bx, by, bz, ax, by, bz);
		this._segment(ax, by, bz, ax, ay, bz);
		this._segment(ax, ay, az, ax, ay, bz);
		this._segment(bx, ay, az, bx, ay, bz);
		this._segment(bx, by, az, bx, by, bz);
		this._segment(ax, by, az, ax, by, bz);
	}
	box(box) {
		const orientation = box.worldTransform;
		if (orientation) {
			const outer = this.transform;
			this.transform = outer ? _mat.mul2(outer, orientation) : orientation;
			const he = box.halfExtents;
			_u.set(-he.x, -he.y, -he.z);
			_v.set(he.x, he.y, he.z);
			this.boxMinMax(_u, _v);
			this.transform = outer;
			return;
		}
		this.boxMinMax(box.getMin(), box.getMax());
	}
	sphere(center, radius) {
		const steps = this._steps();
		this._begin(steps * 3 * 2);
		_u.set(1, 0, 0);
		_v.set(0, 1, 0);
		this._arc(center, _u, _v, radius, steps);
		_u.set(1, 0, 0);
		_v.set(0, 0, 1);
		this._arc(center, _u, _v, radius, steps);
		_u.set(0, 1, 0);
		_v.set(0, 0, 1);
		this._arc(center, _u, _v, radius, steps);
	}
	circle(center, normal, radius) {
		const steps = this._steps();
		this._begin(steps * 2);
		_dir.copy(normal).normalize();
		buildBasis(_dir);
		this._arc(center, _u, _v, radius, steps);
	}
	cylinder(start, end, radius) {
		_dir.sub2(end, start);
		if (_dir.length() < 1e-6) {
			return;
		}
		_dir.normalize();
		buildBasis(_dir);
		const steps = this._steps();
		this._begin((steps * 2 + 4) * 2);
		this._arc(start, _u, _v, radius, steps);
		this._arc(end, _u, _v, radius, steps);
		this._sideLines(start, end, radius);
	}
	_sideLines(start, end, radius) {
		for (let i = 0; i < 4; i++) {
			const t = i & 1 ? _v : _u;
			const s = i < 2 ? radius : -radius;
			this._segment(
				start.x + t.x * s,
				start.y + t.y * s,
				start.z + t.z * s,
				end.x + t.x * s,
				end.y + t.y * s,
				end.z + t.z * s
			);
		}
	}
	capsule(start, end, radius) {
		_dir.sub2(end, start);
		if (_dir.length() < 1e-6) {
			this.sphere(start, radius);
			return;
		}
		_dir.normalize();
		buildBasis(_dir);
		const steps = this._steps();
		const half = Math.max(2, steps >> 1);
		this._begin((steps * 2 + 4 + half * 4) * 2);
		this._arc(start, _u, _v, radius, steps);
		this._arc(end, _u, _v, radius, steps);
		this._sideLines(start, end, radius);
		this._arc(end, _u, _dir, radius, half, 0, Math.PI);
		this._arc(end, _v, _dir, radius, half, 0, Math.PI);
		this._arc(start, _u, _dir, radius, half, Math.PI, Math.PI);
		this._arc(start, _v, _dir, radius, half, Math.PI, Math.PI);
	}
	cone(apex, direction, angle, length) {
		_dir.copy(direction);
		if (_dir.length() < 1e-6) {
			return;
		}
		_dir.normalize();
		buildBasis(_dir);
		const radius = length * Math.tan(Math.min(angle, 89.9) * DEG_TO_RAD);
		_pos.copy(_dir).mulScalar(length).add(apex);
		const steps = this._steps();
		this._begin((steps + 4) * 2);
		this._arc(_pos, _u, _v, radius, steps);
		for (let i = 0; i < 4; i++) {
			const t = i & 1 ? _v : _u;
			const s = i < 2 ? radius : -radius;
			this._segment(
				apex.x,
				apex.y,
				apex.z,
				_pos.x + t.x * s,
				_pos.y + t.y * s,
				_pos.z + t.z * s
			);
		}
	}
	plane(center, normal, size) {
		this._begin(5 * 2);
		_dir.copy(normal).normalize();
		buildBasis(_dir);
		const h = size * 0.5;
		const ax = _u.x * h, ay = _u.y * h, az = _u.z * h;
		const bx = _v.x * h, by = _v.y * h, bz = _v.z * h;
		this._segment(
			center.x - ax - bx,
			center.y - ay - by,
			center.z - az - bz,
			center.x + ax - bx,
			center.y + ay - by,
			center.z + az - bz
		);
		this._segment(
			center.x + ax - bx,
			center.y + ay - by,
			center.z + az - bz,
			center.x + ax + bx,
			center.y + ay + by,
			center.z + az + bz
		);
		this._segment(
			center.x + ax + bx,
			center.y + ay + by,
			center.z + az + bz,
			center.x - ax + bx,
			center.y - ay + by,
			center.z - az + bz
		);
		this._segment(
			center.x - ax + bx,
			center.y - ay + by,
			center.z - az + bz,
			center.x - ax - bx,
			center.y - ay - by,
			center.z - az - bz
		);
		this._segment(
			center.x,
			center.y,
			center.z,
			center.x + _dir.x * h,
			center.y + _dir.y * h,
			center.z + _dir.z * h
		);
	}
	point(position, size) {
		this._begin(3 * 2);
		const h = size * 0.5;
		const { x, y, z } = position;
		this._segment(x - h, y, z, x + h, y, z);
		this._segment(x, y - h, z, x, y + h, z);
		this._segment(x, y, z - h, x, y, z + h);
	}
	arrow(from, to) {
		_dir.sub2(to, from);
		const length = _dir.length();
		if (length < 1e-6) {
			return;
		}
		_dir.mulScalar(1 / length);
		buildBasis(_dir);
		const steps = this._steps();
		this._begin((steps + 5) * 2);
		this._segment(from.x, from.y, from.z, to.x, to.y, to.z);
		const headLength = length * 0.2;
		const headRadius = headLength * 0.5;
		_head.copy(_dir).mulScalar(-headLength).add(to);
		this._arc(_head, _u, _v, headRadius, steps);
		for (let i = 0; i < 4; i++) {
			const t = i & 1 ? _v : _u;
			const s = i < 2 ? headRadius : -headRadius;
			this._segment(
				to.x,
				to.y,
				to.z,
				_head.x + t.x * s,
				_head.y + t.y * s,
				_head.z + t.z * s
			);
		}
	}
	axes(matrix, size) {
		this._begin(3 * 2);
		const d = matrix.data;
		const ox = d[12], oy = d[13], oz = d[14];
		for (let i = 0; i < 3; i++) {
			const c = i * 4;
			_color.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, 1);
			this._vertex(ox, oy, oz, _color);
			this._vertex(
				ox + d[c] * size,
				oy + d[c + 1] * size,
				oz + d[c + 2] * size,
				_color
			);
		}
	}
	frustum(source) {
		const camera = source;
		if (camera.projectionMatrix) {
			const projection = _proj.copy(camera.projectionMatrix);
			camera.calculateProjection?.(projection, VIEW_CENTER);
			if (camera.calculateTransform) {
				camera.calculateTransform(_view, VIEW_CENTER);
			} else {
				const node = camera.entity;
				_view.setTRS(node.getPosition(), node.getRotation(), Vec3.ONE);
			}
			_view.invert();
			_mat.mul2(projection, _view);
		} else {
			_mat.copy(source);
		}
		_mat.invert();
		this._begin(12 * 2);
		const d = _mat.data;
		for (let i = 0; i < 8; i++) {
			const x = NDC_CORNERS[i * 3];
			const y = NDC_CORNERS[i * 3 + 1];
			const z = NDC_CORNERS[i * 3 + 2];
			const iw = 1 / (d[3] * x + d[7] * y + d[11] * z + d[15]);
			_corners[i].set(
				(d[0] * x + d[4] * y + d[8] * z + d[12]) * iw,
				(d[1] * x + d[5] * y + d[9] * z + d[13]) * iw,
				(d[2] * x + d[6] * y + d[10] * z + d[14]) * iw
			);
		}
		for (let i = 0; i < FRUSTUM_EDGES.length; i += 2) {
			const a = _corners[FRUSTUM_EDGES[i]];
			const b = _corners[FRUSTUM_EDGES[i + 1]];
			this._segment(a.x, a.y, a.z, b.x, b.y, b.z);
		}
	}
	light(light, size = 1) {
		const entity = light.entity;
		const position = entity.getPosition();
		const direction = _lightDir.copy(entity.up).mulScalar(-1);
		const outer = this.color;
		this.color = light.color;
		switch (light.type) {
			case "omni":
				this.sphere(position, light.range);
				break;
			case "spot":
				this.cone(position, direction, light.outerConeAngle, light.range);
				break;
			case "directional":
				_pos.copy(direction).mulScalar(size).add(position);
				this.arrow(position, _pos);
				break;
		}
		this.color = outer;
	}
}
export {
	WireRenderer
};
