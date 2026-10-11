var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class RenderAction {
  constructor() {
    // {CameraComponent|null}
    __publicField(this, "camera", null);
    this.layer = null;
    this.transparent = false;
    this.renderTarget = null;
    this.clearColor = false;
    this.clearDepth = false;
    this.clearStencil = false;
    this.triggerPostprocess = false;
    this.firstCameraUse = false;
    this.lastCameraUse = false;
    this.useCameraPasses = false;
  }
  setupClears(camera, layer) {
    this.clearColor = camera?.clearColorBuffer || layer.clearColorBuffer;
    this.clearDepth = camera?.clearDepthBuffer || layer.clearDepthBuffer;
    this.clearStencil = camera?.clearStencilBuffer || layer.clearStencilBuffer;
  }
}
export {
  RenderAction
};
