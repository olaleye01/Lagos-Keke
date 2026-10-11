var volumetricFogLocal_default = `
	#include "screenDepthPS"
	#include "clusteredLightUtilsPS"
	float square(float x) {
		return x * x;
	}
	float saturate(float x) {
		return clamp(x, 0.0, 1.0);
	}
	#include "falloffInvSquaredPS"
	#include "falloffLinearPS"
	#include "spotPS"
	#ifdef VOL_COOKIES
		#include "clusteredLightCookiesPS"
	#endif
	varying vec2 uv0;
	uniform vec3 uVolCameraPos;
	uniform vec3 uVolCameraFwd;
	uniform mat4 uVolInvView;
	uniform vec2 uVolProjScale;
	uniform vec3 uVolTint;
	uniform vec4 uVolFogParams;
	uniform vec4 uVolMarchParams;
	uniform vec4 uVolLightPosRange;
	uniform vec4 uVolLightSphere;
	uniform vec3 uVolLightColor;
	uniform vec4 uVolLightDir;
	uniform vec4 uVolLightSpot;
	uniform vec4 uVolLightAtten;
	#if defined(VOL_SHADOWS) || defined(VOL_COOKIES)
		uniform mat4 uVolLightProjMatrix;
		uniform vec4 uVolLightAtlas;
		uniform vec2 shadowAtlasParams;
	#endif
	#ifdef VOL_SHADOWS
		uniform sampler2DShadow shadowAtlasTexture;
		float volSampleShadow(vec3 pos, vec3 lightVec, float spiral) {
			vec2 tapOffset = vec2(cos(spiral), sin(spiral)) / shadowAtlasParams.x;
			if (uVolLightDir.w > 0.0) {
				vec4 projPos = uVolLightProjMatrix * vec4(pos, 1.0);
				vec3 shadowCoord = projPos.xyz / projPos.w;
				return textureShadow(shadowAtlasTexture, vec3(shadowCoord.xy + tapOffset, shadowCoord.z));
			}
			vec2 uv = getCubemapAtlasCoordinates(uVolLightAtlas.xyz, shadowAtlasParams.y, shadowAtlasParams.x, lightVec);
			float shadowZ = length(lightVec) / uVolLightPosRange.w + uVolLightAtlas.w;
			return textureShadow(shadowAtlasTexture, vec3(uv + tapOffset, shadowZ));
		}
	#endif
	#ifdef VOL_COOKIES
		uniform sampler2D cookieAtlasTexture;
		uniform vec4 uVolLightCookieChannel;
		vec3 volSampleCookie(vec3 pos, vec3 lightVec) {
			if (uVolLightDir.w > 0.0) {
				return getCookie2DClustered(TEXTURE_PASS(cookieAtlasTexture), uVolLightProjMatrix, pos,
					uVolLightSpot.w, uVolLightCookieChannel);
			}
			return getCookieCubeClustered(TEXTURE_PASS(cookieAtlasTexture), lightVec, uVolLightSpot.w,
				uVolLightCookieChannel, shadowAtlasParams.x, shadowAtlasParams.y, uVolLightAtlas.xyz);
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
	float volFogSegmentDepth(float s0, float s1, float h0, float rayDirY) {
		if (s1 <= s0) return 0.0;
		float density = uVolFogParams.x;
		float falloff = uVolFogParams.z;
		float hMid = h0 + rayDirY * (s0 + s1) * 0.5;
		if (hMid <= 0.0) {
			return density * (s1 - s0);
		}
		float scale = falloff * rayDirY;
		if (abs(scale) < 1e-6) {
			return density * exp(-falloff * hMid) * (s1 - s0);
		}
		return density * (exp(-falloff * (h0 + rayDirY * s0)) - exp(-falloff * (h0 + rayDirY * s1))) / scale;
	}
	vec2 volClipCone(vec2 span, float root, float gradient, float axial) {
		if (axial < 0.0) return span;
		return gradient > 0.0 ? vec2(max(span.x, root), span.y) : vec2(span.x, min(span.y, root));
	}
	float volFogOpticalDepth(float t, float rayDirY) {
		float h0 = uVolCameraPos.y - uVolFogParams.y;
		float sCross = abs(rayDirY) > 1e-6 ? clamp(-h0 / rayDirY, 0.0, t) : 0.0;
		float depth = volFogSegmentDepth(0.0, sCross, h0, rayDirY) +
					  volFogSegmentDepth(sCross, t, h0, rayDirY);
		return depth * uVolMarchParams.w;
	}
	void main() {
		vec2 ndcUV = uv0;
		#ifdef WEBGPU
			ndcUV.y = 1.0 - ndcUV.y;
		#endif
		vec2 ndc = ndcUV * 2.0 - 1.0;
		vec3 rayDir = normalize((uVolInvView * vec4(ndc * uVolProjScale, -1.0, 0.0)).xyz);
		float rayDot = max(dot(rayDir, uVolCameraFwd), 0.001);
		float sceneT = min(getLinearScreenDepth(uv0) / rayDot, uVolFogParams.w);
		vec3 sphereToCam = uVolCameraPos - uVolLightSphere.xyz;
		float halfB = dot(sphereToCam, rayDir);
		float c = dot(sphereToCam, sphereToCam) - uVolLightSphere.w * uVolLightSphere.w;
		float discriminant = halfB * halfB - c;
		if (discriminant <= 0.0) discard;
		float rootOffset = sqrt(discriminant);
		float t0 = max(-halfB - rootOffset, 0.0);
		float t1 = min(-halfB + rootOffset, sceneT);
		if (uVolLightDir.w > 0.0) {
			vec3 apexToCam = uVolCameraPos - uVolLightPosRange.xyz;
			float axisStart = dot(apexToCam, uVolLightDir.xyz);
			float axisRate = dot(rayDir, uVolLightDir.xyz);
			if (abs(axisRate) > 1e-6) {
				float tApex = -axisStart / axisRate;
				float tRange = (uVolLightPosRange.w - axisStart) / axisRate;
				t0 = max(t0, min(tApex, tRange));
				t1 = min(t1, max(tApex, tRange));
			} else if (axisStart < 0.0 || axisStart > uVolLightPosRange.w) {
				discard;
			}
			float cosSqr = uVolLightSpot.y * uVolLightSpot.y;
			float qa = axisRate * axisRate - cosSqr;
			float qb = axisRate * axisStart - cosSqr * dot(rayDir, apexToCam);
			float qc = axisStart * axisStart - cosSqr * dot(apexToCam, apexToCam);
			vec2 span = vec2(t0, t1);
			if (abs(qa) > 1e-6) {
				float discriminantCone = qb * qb - qa * qc;
				if (discriminantCone > 0.0) {
					float rootOffsetCone = sqrt(discriminantCone);
					float rootA = (-qb - rootOffsetCone) / qa;
					float rootB = (-qb + rootOffsetCone) / qa;
					span = volClipCone(span, rootA, qa * rootA + qb, axisStart + rootA * axisRate);
					span = volClipCone(span, rootB, qa * rootB + qb, axisStart + rootB * axisRate);
				}
			} else if (abs(qb) > 1e-6) {
				float root = -0.5 * qc / qb;
				span = volClipCone(span, root, qb, axisStart + root * axisRate);
			}
			t0 = span.x;
			t1 = span.y;
		}
		if (t1 <= t0) discard;
		float stepCount = uVolMarchParams.y;
		float dt = (t1 - t0) / stepCount;
		float noise = fract(fogNoise(gl_FragCoord.xy) + uVolMarchParams.z);
		vec3 inscatter = vec3(0.0);
		for (float i = 0.0; i < stepCount; i += 1.0) {
			float t = t0 + (i + noise) * dt;
			vec3 pos = uVolCameraPos + rayDir * t;
			float density = uVolFogParams.x * exp(-uVolFogParams.z * max(pos.y - uVolFogParams.y, 0.0));
			vec3 lightVec = pos - uVolLightPosRange.xyz;
			vec3 lightDirNorm = normalize(lightVec);
			float atten = uVolLightAtten.x > 0.0 ?
				getFalloffLinear(uVolLightPosRange.w, lightVec) :
				getFalloffInvSquared(uVolLightPosRange.w, lightVec);
			if (uVolLightDir.w > 0.0) {
				atten *= getSpotEffect(uVolLightDir.xyz, uVolLightSpot.x, uVolLightSpot.y, lightDirNorm);
			}
			if (atten > 0.00001) {
				#ifdef VOL_SHADOWS
					if (uVolLightSpot.z > 0.0) {
						float spiral = (i + noise) * 2.39996;
						atten *= mix(1.0, volSampleShadow(pos, lightVec, spiral), uVolLightSpot.z);
					}
				#endif
				vec3 radiance = uVolLightColor;
				#ifdef VOL_COOKIES
					if (uVolLightSpot.w > 0.0) {
						radiance *= volSampleCookie(pos, lightVec);
					}
				#endif
				float transmittance = exp(-volFogOpticalDepth(t, rayDir.y));
				float phase = fogPhase(dot(rayDir, -lightDirNorm), uVolMarchParams.x);
				inscatter += transmittance * uVolTint * radiance * (atten * phase * density * dt);
			}
		}
		gl_FragColor = vec4(inscatter, 1.0);
	}
`;
export {
	volumetricFogLocal_default as default
};
