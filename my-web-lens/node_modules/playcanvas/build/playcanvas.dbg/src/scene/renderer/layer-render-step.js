var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class LayerRenderStep {
  /**
   * @param {CameraComponent} cameraComponent - The camera component used to render the layer.
   * @param {Layer} layer - The layer to render.
   * @param {boolean} transparent - True to render the transparent sublayer, opaque otherwise.
   * @param {RenderTarget|null} renderTarget - The render target to render to.
   */
  constructor(cameraComponent, layer, transparent, renderTarget) {
    /** @type {CameraComponent|null} */
    __publicField(this, "cameraComponent");
    /** @type {Layer|null} */
    __publicField(this, "layer");
    /** True if this uses the transparent sublayer, opaque otherwise. */
    __publicField(this, "transparent");
    /** @type {RenderTarget|null} */
    __publicField(this, "renderTarget");
    /**
     * The world clusters to use for clustered lighting. Assigned later by the
     * {@link WorldClustersAllocator}, so it always starts as null.
     *
     * @type {WorldClusters|null}
     */
    __publicField(this, "lightClusters", null);
    // clear flags
    __publicField(this, "clearColor", false);
    __publicField(this, "clearDepth", false);
    __publicField(this, "clearStencil", false);
    // true if this is the first render step using its camera
    __publicField(this, "firstCameraUse", false);
    // true if this is the last render step using its camera
    __publicField(this, "lastCameraUse", false);
    this.cameraComponent = cameraComponent;
    this.layer = layer;
    this.transparent = transparent;
    this.renderTarget = renderTarget;
  }
  setupClears(cameraComponent, layer) {
    this.clearColor = cameraComponent?.clearColorBuffer || layer.clearColorBuffer;
    this.clearDepth = cameraComponent?.clearDepthBuffer || layer.clearDepthBuffer;
    this.clearStencil = cameraComponent?.clearStencilBuffer || layer.clearStencilBuffer;
  }
}
export {
  LayerRenderStep
};
