var flat_normal_default = `
#ifndef TBNBASIS
	#define TBNBASIS
	uniform float tbnBasis;
#endif
vec3 getFlatNormal(vec3 worldPos) {
	vec3 normal = cross(dFdx(worldPos), dFdy(worldPos));
	float basis = gl_FrontFacing ? tbnBasis : -tbnBasis;
	float len = length(normal);
	return len > 0.0 ? normal * (basis / len) : vec3(0.0, 1.0, 0.0);
}
`;
export {
	flat_normal_default as default
};
