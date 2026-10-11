var flat_normal_default = `
#ifndef TBNBASIS
	#define TBNBASIS
	uniform tbnBasis: f32;
#endif
fn getFlatNormal(worldPos: vec3f) -> vec3f {
	let normal: vec3f = cross(dpdx(worldPos), dpdy(worldPos));
	let basis: f32 = select(-uniform.tbnBasis, uniform.tbnBasis, pcFrontFacing);
	let len: f32 = length(normal);
	return select(vec3f(0.0, 1.0, 0.0), normal * (basis / len), len > 0.0);
}
`;
export {
	flat_normal_default as default
};
