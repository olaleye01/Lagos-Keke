var scene_textures_default = `
#ifndef SCENE_TEXTURES
#define SCENE_TEXTURES
fn writeSceneTextureDepth(output: ptr<function, FragmentOutput>, linearDepth: f32, alpha: f32) {
	#ifdef SCENE_TEXTURE_DEPTH
		(*output).color{SCENE_TEXTURE_DEPTH_SLOT} = vec4f(alpha / max(linearDepth, 1e-6), 0.0, 0.0, alpha);
	#endif
}
#endif
`;
export {
	scene_textures_default as default
};
