var scene_textures_default = `
#ifndef SCENE_TEXTURES
#define SCENE_TEXTURES
void writeSceneTextureDepth(float linearDepth, float alpha) {
	#ifdef SCENE_TEXTURE_DEPTH
		pcFragColor{SCENE_TEXTURE_DEPTH_SLOT} = vec4(alpha / max(linearDepth, 1e-6), 0.0, 0.0, alpha);
	#endif
}
#endif
`;
export {
	scene_textures_default as default
};
