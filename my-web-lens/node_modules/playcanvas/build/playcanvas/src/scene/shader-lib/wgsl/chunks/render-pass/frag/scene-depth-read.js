var scene_depth_read_default = `
	#include "screenDepthPS"
	#include "floatAsUintPS"
	uniform uDepthReadRect: vec4f;
	uniform uDepthReadGrid: vec2f;
	uniform uDepthReadFar: f32;
	uniform uDepthReadEmpty: f32;
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		let cell = (floor(pcPosition.xy) + vec2f(0.5)) / uniform.uDepthReadGrid;
		let uv = getImageEffectUV(uniform.uDepthReadRect.xy + cell * uniform.uDepthReadRect.zw);
		let size = vec2f(textureDimensions(uSceneDepthMap, 0));
		let snapped = (floor(uv * size) + vec2f(0.5)) / size;
		let depth = getLinearScreenDepth(snapped);
		let value = select(depth, uniform.uDepthReadEmpty, depth >= uniform.uDepthReadFar);
		output.color = float2uint(value);
		return output;
	}
`;
export {
	scene_depth_read_default as default
};
