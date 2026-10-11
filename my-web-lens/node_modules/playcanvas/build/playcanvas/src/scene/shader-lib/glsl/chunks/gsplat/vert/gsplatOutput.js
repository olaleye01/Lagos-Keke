var gsplatOutput_default = `
#include "tonemappingPS"
#include "decodePS"
#include "gammaPS"
#include "fogPS"
#if FOG != NONE && !defined(GSPLAT_NO_FOG)
	#define GSPLAT_FOG
#endif
#if TONEMAP != NONE && !defined(GSPLAT_NO_TONEMAP)
	#define GSPLAT_TONEMAP
#endif
vec3 prepareOutputFromGamma(vec3 gammaColor, float depth) {
	vec3 color = gammaColor;
	#if defined(GSPLAT_TONEMAP) || GAMMA == NONE || defined(GSPLAT_FOG)
		color = decodeGamma(color);
	#endif
	#ifdef GSPLAT_FOG
		color = addFog(color, depth);
	#endif
	#ifdef GSPLAT_TONEMAP
		color = toneMap(color);
	#endif
	#if defined(GSPLAT_TONEMAP) || (GAMMA != NONE && defined(GSPLAT_FOG))
		color = gammaCorrectOutput(color);
	#endif
	return color;
}
`;
export {
	gsplatOutput_default as default
};
