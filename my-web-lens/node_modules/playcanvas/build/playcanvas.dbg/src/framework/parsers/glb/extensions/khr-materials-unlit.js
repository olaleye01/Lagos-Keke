const KHR_materials_unlit = {
  apply(data, material, textures) {
    material.useLighting = false;
    material.emissive.copy(material.diffuse);
    material.emissiveMap = material.diffuseMap;
    material.emissiveMapUv = material.diffuseMapUv;
    material.emissiveMapTiling.copy(material.diffuseMapTiling);
    material.emissiveMapOffset.copy(material.diffuseMapOffset);
    material.emissiveMapRotation = material.diffuseMapRotation;
    material.emissiveMapChannel = material.diffuseMapChannel;
    material.emissiveVertexColor = material.diffuseVertexColor;
    material.emissiveVertexColorChannel = material.diffuseVertexColorChannel;
    material.useLighting = false;
    material.useSkybox = false;
    material.diffuse.set(1, 1, 1);
    material.diffuseMap = null;
    material.diffuseVertexColor = false;
  }
};
export {
  KHR_materials_unlit
};
