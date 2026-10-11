const KHR_materials_dispersion = {
  apply(data, material, textures) {
    if (data.hasOwnProperty("dispersion")) {
      material.dispersion = data.dispersion;
    }
  }
};
export {
  KHR_materials_dispersion
};
