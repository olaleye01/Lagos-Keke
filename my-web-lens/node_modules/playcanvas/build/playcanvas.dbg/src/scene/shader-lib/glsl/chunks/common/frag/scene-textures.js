var scene_textures_default = (
  /* glsl */
  `

#ifndef SCENE_TEXTURES
#define SCENE_TEXTURES

// Writes the fragment's contribution to the scene depth texture.
//
// The alpha is the fragment's coverage: opaque geometry passes 1.0, blended geometry (gaussian splats)
// its own alpha. What is accumulated is the reciprocal of the depth, pre-multiplied by that coverage, so
// that under the premultiplied blending the splats already use the attachment holds a coverage weighted
// average of the reciprocal - the weights sum to one on their own, with whatever coverage is left over
// falling to the value the attachment was cleared to. Clearing it to the reciprocal of the far clip
// therefore makes the background a surface at that distance, and averaging reciprocals rather than
// depths is what stops it dragging a partly covered pixel most of the way out to it. The read inverts
// the average back into a depth. Opaque geometry, passing 1.0, simply overwrites.
void writeSceneTextureDepth(float linearDepth, float alpha) {
    #ifdef SCENE_TEXTURE_DEPTH
        pcFragColor{SCENE_TEXTURE_DEPTH_SLOT} = vec4(alpha / max(linearDepth, 1e-6), 0.0, 0.0, alpha);
    #endif
}

#endif // SCENE_TEXTURES
`
);
export {
  scene_textures_default as default
};
