var shadow_caster_default = `
fn getShadowOutput() -> vec4f {
	var depth: f32 = pcPosition.z;
	#if SHADOW_TYPE == VSM_16F || SHADOW_TYPE == VSM_32F
		if (!(depth >= 0.0 && depth <= 1.0)) {
			discard;
		}
		#if SHADOW_TYPE == VSM_32F
			let exponent: f32 = 15.0;
		#else
			let exponent: f32 = 5.54;
		#endif
		depth = 2.0 * depth - 1.0;
		depth = exp(exponent * depth);
		return vec4f(depth, depth * depth, 1.0, 1.0);
	#elif SHADOW_TYPE == PCSS_32F
		return vec4f(depth, 0.0, 0.0, 1.0);
	#else
		return vec4f(1.0);
	#endif
}
`;
export {
	shadow_caster_default as default
};
