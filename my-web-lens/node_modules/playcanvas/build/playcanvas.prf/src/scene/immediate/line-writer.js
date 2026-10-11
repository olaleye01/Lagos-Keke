class LineWriter {
	_positions = null;
	_colors = null;
	_cursor = 0;
	_end = 0;
	_r = 1;
	_g = 1;
	_b = 1;
	_a = 1;
	reset(positions, colors, first, count, color) {
		this._positions = positions;
		this._colors = colors;
		this._cursor = first;
		this._end = first + count;
		this.setColor(color);
	}
	setColor(color) {
		this._r = color.r;
		this._g = color.g;
		this._b = color.b;
		this._a = color.a;
	}
	get filled() {
		return this._cursor === this._end;
	}
	get positions() {
		return this._positions;
	}
	get colors() {
		return this._colors;
	}
	set cursor(value) {
		this._cursor = value;
	}
	get cursor() {
		return this._cursor;
	}
	get end() {
		return this._end;
	}
	segment(x0, y0, z0, x1, y1, z1) {
		const positions = this._positions;
		const colors = this._colors;
		const cursor = this._cursor;
		let p = cursor * 3;
		positions[p++] = x0;
		positions[p++] = y0;
		positions[p++] = z0;
		positions[p++] = x1;
		positions[p++] = y1;
		positions[p] = z1;
		const r = this._r, g = this._g, b = this._b, a = this._a;
		let c = cursor * 4;
		colors[c++] = r;
		colors[c++] = g;
		colors[c++] = b;
		colors[c++] = a;
		colors[c++] = r;
		colors[c++] = g;
		colors[c++] = b;
		colors[c] = a;
		this._cursor = cursor + 2;
	}
	vertex(x, y, z, r, g, b, a) {
		const cursor = this._cursor;
		let p = cursor * 3;
		const positions = this._positions;
		positions[p++] = x;
		positions[p++] = y;
		positions[p] = z;
		let c = cursor * 4;
		const colors = this._colors;
		colors[c++] = r;
		colors[c++] = g;
		colors[c++] = b;
		colors[c] = a;
		this._cursor = cursor + 1;
	}
}
export {
	LineWriter
};
