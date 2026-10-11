var shadow_caster_default = `
vec4 getShadowOutput() {
	float depth = gl_FragCoord.z;
	#if SHADOW_TYPE == VSM_16F || SHADOW_TYPE == VSM_32F
		if (!(depth >= 0.0 && depth <= 1.0)) discard;
		#if SHADOW_TYPE == VSM_32F
			float exponent = 15.0;
		#else
			float exponent = 5.54;
		#endif
		depth = 2.0 * depth - 1.0;
		depth = exp(exponent * depth);
		return vec4(depth, depth * depth, 1.0, 1.0);
	#elif SHADOW_TYPE == PCSS_32F
		return vec4(depth, 0.0, 0.0, 1.0);
	#else
		return vec4(1.0);
	#endif
}
`;
export {
	shadow_caster_default as default
};
