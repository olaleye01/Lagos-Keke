const getTextureSource = (gltfTexture) => gltfTexture.extensions?.KHR_texture_basisu?.source ?? gltfTexture.extensions?.EXT_texture_webp?.source ?? gltfTexture.source;
export {
  getTextureSource
};
