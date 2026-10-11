const KHR_materials_emissive_strength = {
  apply(data, material, textures) {
    if (data.hasOwnProperty("emissiveStrength")) {
      material.emissiveIntensity = data.emissiveStrength;
    }
  }
};
export {
  KHR_materials_emissive_strength
};
