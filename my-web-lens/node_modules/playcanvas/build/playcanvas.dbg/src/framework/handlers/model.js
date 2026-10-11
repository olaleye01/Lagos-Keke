import { getDefaultMaterial } from "../../scene/materials/default-material.js";
import { GlbModelParser } from "../parsers/glb-model.js";
import { JsonModelParser } from "../parsers/json-model.js";
import { ResourceHandler } from "./handler.js";
class ModelHandler extends ResourceHandler {
  /**
   * Create a new ModelHandler instance.
   *
   * @param {AppBase} app - The running {@link AppBase}.
   * @ignore
   */
  constructor(app) {
    super(app, "model");
    this.device = app.graphicsDevice;
    this.assets = app.assets;
    this.defaultMaterial = getDefaultMaterial(this.device);
    this.addParser(new JsonModelParser(this));
    this.addParser(new GlbModelParser(this));
  }
  patch(asset, assets) {
    if (!asset.resource) {
      return;
    }
    const data = asset.data;
    const self = this;
    asset.resource.meshInstances.forEach((meshInstance, i) => {
      if (data.mapping) {
        const handleMaterial = function(asset2) {
          if (asset2.resource) {
            meshInstance.material = asset2.resource;
          } else {
            asset2.once("load", handleMaterial);
            assets.load(asset2);
          }
          asset2.once("remove", (asset3) => {
            if (meshInstance.material === asset3.resource) {
              meshInstance.material = self.defaultMaterial;
            }
          });
        };
        if (!data.mapping[i]) {
          meshInstance.material = self.defaultMaterial;
          return;
        }
        const id = data.mapping[i].material;
        const url = data.mapping[i].path;
        let material;
        if (id !== void 0) {
          if (!id) {
            meshInstance.material = self.defaultMaterial;
          } else {
            material = assets.get(id);
            if (material) {
              handleMaterial(material);
            } else {
              assets.once(`add:${id}`, handleMaterial);
            }
          }
        } else if (url) {
          const path = asset.getAbsoluteUrl(data.mapping[i].path);
          material = assets.getByUrl(path);
          if (material) {
            handleMaterial(material);
          } else {
            assets.once(`add:url:${path}`, handleMaterial);
          }
        }
      }
    });
  }
}
export {
  ModelHandler
};
