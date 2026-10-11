import { BLEND_NORMAL } from "../../../../scene/constants.js";
import { extractTextureTransform } from "./khr-texture-transform.js";
const KHR_materials_transmission = {
  apply(data, material, textures) {
    material.blendType = BLEND_NORMAL;
    material.useDynamicRefraction = true;
    if (data.hasOwnProperty("transmissionFactor")) {
      material.refraction = data.transmissionFactor;
    }
    if (data.hasOwnProperty("transmissionTexture")) {
      material.refractionMapChannel = "r";
      material.refractionMap = textures[data.transmissionTexture.index];
      extractTextureTransform(data.transmissionTexture, material, ["refraction"]);
    }
  }
};
export {
  KHR_materials_transmission
};
