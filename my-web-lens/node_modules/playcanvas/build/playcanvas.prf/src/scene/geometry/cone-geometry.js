import { ConeBaseGeometry } from "./cone-base-geometry.js";
class ConeGeometry extends ConeBaseGeometry {
	constructor(opts = {}) {
		const baseRadius = opts.baseRadius ?? 0.5;
		const peakRadius = opts.peakRadius ?? 0;
		const height = opts.height ?? 1;
		const heightSegments = opts.heightSegments ?? 5;
		const capSegments = opts.capSegments ?? 18;
		super(baseRadius, peakRadius, height, heightSegments, capSegments, false);
		if (opts.calculateTangents) {
			this.calculateTangents();
		}
	}
}
export {
	ConeGeometry
};
