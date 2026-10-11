var volumetricFog_default = `
	#include "screenDepthPS"
	varying vec2 uv0;
	uniform vec3 uFogCameraPos;
	uniform vec3 uFogCameraFwd;
	uniform mat4 uFogInvView;
	uniform vec2 uFogProjScale;
	uniform vec3 uFogTint;
	uniform vec3 uFogLightColor;
	uniform vec3 uFogLightDir;
	uniform vec3 uFogAmbient;
	uniform vec4 uFogParams;
	uniform vec4 uFogScatterParams;
	uniform float uFogExtinction;
	#ifdef FOG_SHADOWS
		uniform mat4 uFogShadowMatrixPalette[4];
		uniform vec4 uFogShadowCascadeDistances;
		uniform vec4 uFogShadowParams;
		#ifdef FOG_SHADOW_PCF
			uniform sampler2DShadow uFogShadowMap;
		#else
			uniform sampler2D uFogShadowMap;
		#endif
		float sampleFogShadow(vec3 worldPos, float viewDepth) {
			if (viewDepth >= uFogShadowParams.w) return 1.0;
			vec4 comparisons = step(uFogShadowCascadeDistances, vec4(viewDepth));
			int cascadeIndex = int(min(dot(comparisons, vec4(1.0)), uFogShadowParams.x - 1.0));
			vec3 shadowCoord = (uFogShadowMatrixPalette[cascadeIndex] * vec4(worldPos, 1.0)).xyz;
			float z = shadowCoord.z - uFogShadowParams.y;
			#ifdef FOG_SHADOW_PCF
				return textureShadow(uFogShadowMap, vec3(shadowCoord.xy, z));
			#else
				return step(z, texture2D(uFogShadowMap, shadowCoord.xy).r);
			#endif
		}
	#endif
	float fogNoise(vec2 fragCoord) {
		const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
		return fract(magic.z * fract(dot(fragCoord, magic.xy)));
	}
	float fogPhase(float cosTheta, float g) {
		float g2 = g * g;
		float denom = 1.0 + g2 - 2.0 * g * cosTheta;
		return (1.0 - g2) / (12.56637 * denom * sqrt(denom));
	}
	void main() {
		vec2 ndcUV = uv0;
		#ifdef WEBGPU
			ndcUV.y = 1.0 - ndcUV.y;
		#endif
		vec2 ndc = ndcUV * 2.0 - 1.0;
		vec3 rayDir = normalize((uFogInvView * vec4(ndc * uFogProjScale, -1.0, 0.0)).xyz);
		float rayDot = max(dot(rayDir, uFogCameraFwd), 0.001);
		float rayLength = min(getLinearScreenDepth(uv0) / rayDot, uFogParams.w);
		float stepCount = uFogScatterParams.y;
		float dt = rayLength / stepCount;
		float noise = fract(fogNoise(gl_FragCoord.xy) + uFogScatterParams.z);
		vec3 sunLight = uFogLightColor * fogPhase(dot(rayDir, uFogLightDir), uFogScatterParams.x);
		vec3 inscatter = vec3(0.0);
		float transmittance = 1.0;
		for (float i = 0.0; i < stepCount; i += 1.0) {
			float t = (i + noise) * dt;
			vec3 pos = uFogCameraPos + rayDir * t;
			float density = uFogParams.x * exp(-uFogParams.z * max(pos.y - uFogParams.y, 0.0));
			float shadow = 1.0;
			#ifdef FOG_SHADOWS
				shadow = mix(1.0, sampleFogShadow(pos, t * rayDot), uFogScatterParams.w);
			#endif
			vec3 radiance = sunLight * shadow + uFogAmbient;
			inscatter += transmittance * uFogTint * radiance * (density * dt);
			transmittance *= exp(-uFogExtinction * density * dt);
			if (transmittance < 0.005) break;
		}
		gl_FragColor = vec4(inscatter, transmittance);
	}
`;
export {
	volumetricFog_default as default
};
