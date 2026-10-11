var volumetricFogLocal_default = `
	#include "screenDepthPS"
	#include "clusteredLightUtilsPS"
	fn square(x: f32) -> f32 {
		return x * x;
	}
	#include "falloffInvSquaredPS"
	#include "falloffLinearPS"
	#include "spotPS"
	#ifdef VOL_COOKIES
		#include "clusteredLightCookiesPS"
	#endif
	varying uv0: vec2f;
	uniform uVolCameraPos: vec3f;
	uniform uVolCameraFwd: vec3f;
	uniform uVolInvView: mat4x4f;
	uniform uVolProjScale: vec2f;
	uniform uVolTint: vec3f;
	uniform uVolFogParams: vec4f;
	uniform uVolMarchParams: vec4f;
	uniform uVolLightPosRange: vec4f;
	uniform uVolLightSphere: vec4f;
	uniform uVolLightColor: vec3f;
	uniform uVolLightDir: vec4f;
	uniform uVolLightSpot: vec4f;
	uniform uVolLightAtten: vec4f;
	#if defined(VOL_SHADOWS) || defined(VOL_COOKIES)
		uniform uVolLightProjMatrix: mat4x4f;
		uniform uVolLightAtlas: vec4f;
		uniform shadowAtlasParams: vec2f;
	#endif
	#ifdef VOL_SHADOWS
		var shadowAtlasTexture: texture_depth_2d;
		var shadowAtlasTextureSampler: sampler_comparison;
		fn volSampleShadow(pos: vec3f, lightVec: vec3f, spiral: f32) -> f32 {
			let tapOffset: vec2f = vec2f(cos(spiral), sin(spiral)) / uniform.shadowAtlasParams.x;
			if (uniform.uVolLightDir.w > 0.0) {
				let projPos: vec4f = uniform.uVolLightProjMatrix * vec4f(pos, 1.0);
				let shadowCoord: vec3f = projPos.xyz / projPos.w;
				return textureSampleCompareLevel(shadowAtlasTexture, shadowAtlasTextureSampler, shadowCoord.xy + tapOffset, shadowCoord.z);
			}
			let uv: vec2f = getCubemapAtlasCoordinates(uniform.uVolLightAtlas.xyz, uniform.shadowAtlasParams.y, uniform.shadowAtlasParams.x, lightVec);
			let shadowZ: f32 = length(lightVec) / uniform.uVolLightPosRange.w + uniform.uVolLightAtlas.w;
			return textureSampleCompareLevel(shadowAtlasTexture, shadowAtlasTextureSampler, uv + tapOffset, shadowZ);
		}
	#endif
	#ifdef VOL_COOKIES
		var cookieAtlasTexture: texture_2d<f32>;
		var cookieAtlasTextureSampler: sampler;
		uniform uVolLightCookieChannel: vec4f;
		fn volSampleCookie(pos: vec3f, lightVec: vec3f) -> vec3f {
			if (uniform.uVolLightDir.w > 0.0) {
				return getCookie2DClustered(cookieAtlasTexture, cookieAtlasTextureSampler, uniform.uVolLightProjMatrix,
					pos, uniform.uVolLightSpot.w, uniform.uVolLightCookieChannel);
			}
			return getCookieCubeClustered(cookieAtlasTexture, cookieAtlasTextureSampler, lightVec,
				uniform.uVolLightSpot.w, uniform.uVolLightCookieChannel, uniform.shadowAtlasParams.x,
				uniform.shadowAtlasParams.y, uniform.uVolLightAtlas.xyz);
		}
	#endif
	fn fogNoise(fragCoord: vec2f) -> f32 {
		const magic: vec3f = vec3f(0.06711056, 0.00583715, 52.9829189);
		return fract(magic.z * fract(dot(fragCoord, magic.xy)));
	}
	fn fogPhase(cosTheta: f32, g: f32) -> f32 {
		let g2: f32 = g * g;
		let denom: f32 = 1.0 + g2 - 2.0 * g * cosTheta;
		return (1.0 - g2) / (12.56637 * denom * sqrt(denom));
	}
	fn volFogSegmentDepth(s0: f32, s1: f32, h0: f32, rayDirY: f32) -> f32 {
		if (s1 <= s0) {
			return 0.0;
		}
		let density: f32 = uniform.uVolFogParams.x;
		let falloff: f32 = uniform.uVolFogParams.z;
		let hMid: f32 = h0 + rayDirY * (s0 + s1) * 0.5;
		if (hMid <= 0.0) {
			return density * (s1 - s0);
		}
		let scale: f32 = falloff * rayDirY;
		if (abs(scale) < 1e-6) {
			return density * exp(-falloff * hMid) * (s1 - s0);
		}
		return density * (exp(-falloff * (h0 + rayDirY * s0)) - exp(-falloff * (h0 + rayDirY * s1))) / scale;
	}
	fn volClipCone(span: vec2f, root: f32, gradient: f32, axial: f32) -> vec2f {
		if (axial < 0.0) {
			return span;
		}
		if (gradient > 0.0) {
			return vec2f(max(span.x, root), span.y);
		}
		return vec2f(span.x, min(span.y, root));
	}
	fn volFogOpticalDepth(t: f32, rayDirY: f32) -> f32 {
		let h0: f32 = uniform.uVolCameraPos.y - uniform.uVolFogParams.y;
		var sCross: f32 = 0.0;
		if (abs(rayDirY) > 1e-6) {
			sCross = clamp(-h0 / rayDirY, 0.0, t);
		}
		let depth: f32 = volFogSegmentDepth(0.0, sCross, h0, rayDirY) +
						volFogSegmentDepth(sCross, t, h0, rayDirY);
		return depth * uniform.uVolMarchParams.w;
	}
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		let ndcUV: vec2f = vec2f(input.uv0.x, 1.0 - input.uv0.y);
		let ndc: vec2f = ndcUV * 2.0 - 1.0;
		let rayDir: vec3f = normalize((uniform.uVolInvView * vec4f(ndc * uniform.uVolProjScale, -1.0, 0.0)).xyz);
		let rayDot: f32 = max(dot(rayDir, uniform.uVolCameraFwd), 0.001);
		let sceneT: f32 = min(getLinearScreenDepth(input.uv0) / rayDot, uniform.uVolFogParams.w);
		let sphereToCam: vec3f = uniform.uVolCameraPos - uniform.uVolLightSphere.xyz;
		let halfB: f32 = dot(sphereToCam, rayDir);
		let c: f32 = dot(sphereToCam, sphereToCam) - uniform.uVolLightSphere.w * uniform.uVolLightSphere.w;
		let discriminant: f32 = halfB * halfB - c;
		if (discriminant <= 0.0) {
			discard;
			return output;
		}
		let rootOffset: f32 = sqrt(discriminant);
		var t0: f32 = max(-halfB - rootOffset, 0.0);
		var t1: f32 = min(-halfB + rootOffset, sceneT);
		if (uniform.uVolLightDir.w > 0.0) {
			let apexToCam: vec3f = uniform.uVolCameraPos - uniform.uVolLightPosRange.xyz;
			let axisStart: f32 = dot(apexToCam, uniform.uVolLightDir.xyz);
			let axisRate: f32 = dot(rayDir, uniform.uVolLightDir.xyz);
			if (abs(axisRate) > 1e-6) {
				let tApex: f32 = -axisStart / axisRate;
				let tRange: f32 = (uniform.uVolLightPosRange.w - axisStart) / axisRate;
				t0 = max(t0, min(tApex, tRange));
				t1 = min(t1, max(tApex, tRange));
			} else if (axisStart < 0.0 || axisStart > uniform.uVolLightPosRange.w) {
				discard;
				return output;
			}
			let cosSqr: f32 = uniform.uVolLightSpot.y * uniform.uVolLightSpot.y;
			let qa: f32 = axisRate * axisRate - cosSqr;
			let qb: f32 = axisRate * axisStart - cosSqr * dot(rayDir, apexToCam);
			let qc: f32 = axisStart * axisStart - cosSqr * dot(apexToCam, apexToCam);
			var span: vec2f = vec2f(t0, t1);
			if (abs(qa) > 1e-6) {
				let discriminantCone: f32 = qb * qb - qa * qc;
				if (discriminantCone > 0.0) {
					let rootOffsetCone: f32 = sqrt(discriminantCone);
					let rootA: f32 = (-qb - rootOffsetCone) / qa;
					let rootB: f32 = (-qb + rootOffsetCone) / qa;
					span = volClipCone(span, rootA, qa * rootA + qb, axisStart + rootA * axisRate);
					span = volClipCone(span, rootB, qa * rootB + qb, axisStart + rootB * axisRate);
				}
			} else if (abs(qb) > 1e-6) {
				let root: f32 = -0.5 * qc / qb;
				span = volClipCone(span, root, qb, axisStart + root * axisRate);
			}
			t0 = span.x;
			t1 = span.y;
		}
		if (t1 <= t0) {
			discard;
			return output;
		}
		let stepCount: f32 = uniform.uVolMarchParams.y;
		let dt: f32 = (t1 - t0) / stepCount;
		let noise: f32 = fract(fogNoise(pcPosition.xy) + uniform.uVolMarchParams.z);
		var inscatter: vec3f = vec3f(0.0);
		for (var i: f32 = 0.0; i < stepCount; i += 1.0) {
			let t: f32 = t0 + (i + noise) * dt;
			let pos: vec3f = uniform.uVolCameraPos + rayDir * t;
			let density: f32 = uniform.uVolFogParams.x * exp(-uniform.uVolFogParams.z * max(pos.y - uniform.uVolFogParams.y, 0.0));
			let lightVec: vec3f = pos - uniform.uVolLightPosRange.xyz;
			let lightDirNorm: vec3f = normalize(lightVec);
			var atten: f32 = select(
				getFalloffInvSquared(uniform.uVolLightPosRange.w, lightVec),
				getFalloffLinear(uniform.uVolLightPosRange.w, lightVec),
				uniform.uVolLightAtten.x > 0.0);
			if (uniform.uVolLightDir.w > 0.0) {
				atten = atten * getSpotEffect(uniform.uVolLightDir.xyz, uniform.uVolLightSpot.x, uniform.uVolLightSpot.y, lightDirNorm);
			}
			if (atten > 0.00001) {
				#ifdef VOL_SHADOWS
					if (uniform.uVolLightSpot.z > 0.0) {
						let spiral: f32 = (i + noise) * 2.39996;
						atten = atten * mix(1.0, volSampleShadow(pos, lightVec, spiral), uniform.uVolLightSpot.z);
					}
				#endif
				var radiance: vec3f = uniform.uVolLightColor;
				#ifdef VOL_COOKIES
					if (uniform.uVolLightSpot.w > 0.0) {
						radiance = radiance * volSampleCookie(pos, lightVec);
					}
				#endif
				let transmittance: f32 = exp(-volFogOpticalDepth(t, rayDir.y));
				let phase: f32 = fogPhase(dot(rayDir, -lightDirNorm), uniform.uVolMarchParams.x);
				inscatter += transmittance * uniform.uVolTint * radiance * (atten * phase * density * dt);
			}
		}
		output.color = vec4f(inscatter, 1.0);
		return output;
	}
`;
export {
	volumetricFogLocal_default as default
};
