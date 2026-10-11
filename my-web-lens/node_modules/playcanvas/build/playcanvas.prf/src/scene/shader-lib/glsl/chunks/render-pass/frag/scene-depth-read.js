var scene_depth_read_default = `
	#include "screenDepthPS"
	#include "floatAsUintPS"
	uniform vec4 uDepthReadRect;
	uniform vec2 uDepthReadGrid;
	uniform float uDepthReadFar;
	uniform float uDepthReadEmpty;
	void main() {
		vec2 cell = (floor(gl_FragCoord.xy) + 0.5) / uDepthReadGrid;
		vec2 uv = getImageEffectUV(uDepthReadRect.xy + cell * uDepthReadRect.zw);
		vec2 size = vec2(textureSize(uSceneDepthMap, 0));
		uv = (floor(uv * size) + 0.5) / size;
		float depth = getLinearScreenDepth(uv);
		gl_FragColor = float2uint(depth >= uDepthReadFar ? uDepthReadEmpty : depth);
	}
`;
export {
	scene_depth_read_default as default
};
