import { Color } from "../../core/math/color.js";
const LINECAP_BUTT = 0;
const LINECAP_SQUARE = 1;
const LINECAP_ROUND = 2;
const LINEJOIN_MITER = 0;
const LINEJOIN_BEVEL = 1;
const LINEJOIN_ROUND = 2;
const validateStyle = (value, min, max, name) => {
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
	}
};
const validateNumber = (value, min, name) => {
	if (!Number.isFinite(value) || value < min) {
		throw new RangeError(`${name} must be a finite number greater than or equal to ${min}.`);
	}
};
class WideLine {
	_positions = new Float32Array(0);
	_colors = new Float32Array([1, 1, 1]);
	_widths = new Float32Array([1]);
	_renderer = null;
	_rendererIndex = -1;
	_join = LINEJOIN_MITER;
	_cap = LINECAP_BUTT;
	_closed = false;
	_dashLength = 0;
	_gapLength = 0;
	_dashOffset = 0;
	set(positions, colors = Color.WHITE, widths = 1) {
		const pointCount = this._validatePositions(positions, 0);
		this._validateColors(colors, pointCount);
		this._validateWidths(widths, pointCount);
		const packedPositions = this._copyPositions(positions, 0, this._positions);
		const packedColors = this._copyColors(colors, pointCount, this._colors);
		const packedWidths = this._copyWidths(widths, pointCount, this._widths);
		this._positions = packedPositions;
		this._colors = packedColors;
		this._widths = packedWidths;
		this._changed();
		return this;
	}
	setPositions(positions) {
		this._positions = this._copyPositions(positions, this.pointCount, this._positions);
		this._changed();
		return this;
	}
	setColors(colors) {
		this._colors = this._copyColors(colors, this.pointCount, this._colors);
		this._changed();
		return this;
	}
	setWidths(widths) {
		this._widths = this._copyWidths(widths, this.pointCount, this._widths);
		this._changed();
		return this;
	}
	get pointCount() {
		return this._positions.length / 3;
	}
	get renderer() {
		return this._renderer;
	}
	set join(value) {
		validateStyle(value, LINEJOIN_MITER, LINEJOIN_ROUND, "join");
		if (this._join !== value) {
			this._join = value;
			this._changed();
		}
	}
	get join() {
		return this._join;
	}
	set cap(value) {
		validateStyle(value, LINECAP_BUTT, LINECAP_ROUND, "cap");
		if (this._cap !== value) {
			this._cap = value;
			this._changed();
		}
	}
	get cap() {
		return this._cap;
	}
	set closed(value) {
		value = !!value;
		if (this._closed !== value) {
			this._closed = value;
			this._changed();
		}
	}
	get closed() {
		return this._closed;
	}
	set dashLength(value) {
		validateNumber(value, 0, "dashLength");
		if (this._dashLength !== value) {
			this._dashLength = value;
			this._changed();
		}
	}
	get dashLength() {
		return this._dashLength;
	}
	set gapLength(value) {
		validateNumber(value, 0, "gapLength");
		if (this._gapLength !== value) {
			this._gapLength = value;
			this._changed();
		}
	}
	get gapLength() {
		return this._gapLength;
	}
	set dashOffset(value) {
		if (!Number.isFinite(value)) {
			throw new RangeError("dashOffset must be a finite number.");
		}
		if (this._dashOffset !== value) {
			this._dashOffset = value;
			this._changed();
		}
	}
	get dashOffset() {
		return this._dashOffset;
	}
	_validatePositions(positions, expectedPointCount) {
		const length = positions?.length;
		if (!Number.isInteger(length) || length % 3 !== 0 || length < 6) {
			throw new RangeError("positions must contain packed xyz values for at least two points.");
		}
		const pointCount = length / 3;
		if (expectedPointCount && pointCount !== expectedPointCount) {
			throw new RangeError(`positions must contain exactly ${expectedPointCount * 3} values.`);
		}
		return pointCount;
	}
	_copyPositions(positions, expectedPointCount, target) {
		this._validatePositions(positions, expectedPointCount);
		const result = target.length === positions.length ? target : new Float32Array(positions.length);
		result.set(positions);
		return result;
	}
	_validateColors(colors, pointCount) {
		if (colors instanceof Color) {
			return;
		}
		if (colors?.length !== pointCount * 3) {
			throw new RangeError(`colors must contain exactly ${pointCount * 3} values.`);
		}
	}
	_copyColors(colors, pointCount, target) {
		this._validateColors(colors, pointCount);
		if (colors instanceof Color) {
			const result2 = target.length === 3 ? target : new Float32Array(3);
			result2[0] = colors.r;
			result2[1] = colors.g;
			result2[2] = colors.b;
			return result2;
		}
		const result = target.length === colors.length ? target : new Float32Array(colors.length);
		result.set(colors);
		return result;
	}
	_validateWidths(widths, pointCount) {
		if (typeof widths === "number") {
			validateNumber(widths, 0, "width");
			return;
		}
		if (widths?.length !== pointCount) {
			throw new RangeError(`widths must contain exactly ${pointCount} values.`);
		}
		for (let i = 0; i < widths.length; i++) {
			validateNumber(widths[i], 0, `widths[${i}]`);
		}
	}
	_copyWidths(widths, pointCount, target) {
		this._validateWidths(widths, pointCount);
		if (typeof widths === "number") {
			const result2 = target.length === 1 ? target : new Float32Array(1);
			result2[0] = widths;
			return result2;
		}
		const result = target.length === widths.length ? target : new Float32Array(widths.length);
		result.set(widths);
		return result;
	}
	_changed() {
		this._renderer?._lineChanged(this);
	}
}
export {
	LINECAP_BUTT,
	LINECAP_ROUND,
	LINECAP_SQUARE,
	LINEJOIN_BEVEL,
	LINEJOIN_MITER,
	LINEJOIN_ROUND,
	WideLine
};
