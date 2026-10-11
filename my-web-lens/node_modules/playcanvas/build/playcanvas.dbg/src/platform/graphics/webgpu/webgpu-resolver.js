var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { Shader } from "../shader.js";
import { DEPTHRESOLVE_MAX, DEPTHRESOLVE_MIN, DEPTHRESOLVE_SAMPLE0, SHADERLANGUAGE_WGSL } from "../constants.js";
import { Debug, DebugHelper } from "../../../core/debug.js";
import { DebugGraphics } from "../debug-graphics.js";
import webgpuDepthResolve from "../shader-chunks/frag/webgpu-depth-resolve.js";
class WebgpuResolver {
  constructor(device) {
    /** @type {WebgpuGraphicsDevice} */
    __publicField(this, "device");
    /**
     * Cache of render pipelines for each texture format and depth resolve mode, to avoid their
     * per frame creation.
     *
     * @type {Map<string, GPURenderPipeline>}
     * @private
     */
    __publicField(this, "pipelineCache", /* @__PURE__ */ new Map());
    /**
     * Cache of shaders for each depth resolve mode (DEPTHRESOLVE_***).
     *
     * @type {Map<string, Shader>}
     * @private
     */
    __publicField(this, "shaderCache", /* @__PURE__ */ new Map());
    this.device = device;
  }
  destroy() {
    this.shaderCache.forEach((shader) => shader.destroy());
    this.shaderCache = null;
    this.pipelineCache = null;
  }
  /**
   * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
   * @returns {Shader} Shader for the given resolve mode.
   * @private
   */
  getShader(mode) {
    Debug.assert(mode === DEPTHRESOLVE_SAMPLE0 || mode === DEPTHRESOLVE_MIN || mode === DEPTHRESOLVE_MAX, `Invalid depth resolve mode '${mode}'`);
    let shader = this.shaderCache.get(mode);
    if (!shader) {
      const code = `#define DEPTH_RESOLVE_${mode.toUpperCase()}
${webgpuDepthResolve}`;
      shader = new Shader(this.device, {
        name: `WebGPUResolverDepthShader-${mode}`,
        shaderLanguage: SHADERLANGUAGE_WGSL,
        vshader: code,
        fshader: code
      });
      this.shaderCache.set(mode, shader);
    }
    return shader;
  }
  /**
   * @param {GPUTextureFormat} format - Texture format.
   * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
   * @returns {GPURenderPipeline} Pipeline for the given format and resolve mode.
   * @private
   */
  getPipeline(format, mode) {
    const key = `${format}-${mode}`;
    let pipeline = this.pipelineCache.get(key);
    if (!pipeline) {
      pipeline = this.createPipeline(format, mode);
      this.pipelineCache.set(key, pipeline);
    }
    return pipeline;
  }
  /**
   * @param {GPUTextureFormat} format - Texture format.
   * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
   * @returns {GPURenderPipeline} Pipeline for the given format and resolve mode.
   * @private
   */
  createPipeline(format, mode) {
    const webgpuShader = this.getShader(mode).impl;
    const pipeline = this.device.wgpu.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: webgpuShader.getVertexShaderModule(),
        entryPoint: webgpuShader.vertexEntryPoint
      },
      fragment: {
        module: webgpuShader.getFragmentShaderModule(),
        entryPoint: webgpuShader.fragmentEntryPoint,
        targets: [{
          format
        }]
      },
      primitive: {
        topology: "triangle-strip"
      }
    });
    DebugHelper.setLabel(pipeline, `RenderPipeline-DepthResolver-${format}-${mode}`);
    return pipeline;
  }
  /**
   * @param {GPUCommandEncoder} commandEncoder - Command encoder to use for the resolve.
   * @param {GPUTexture} sourceTexture - Source multi-sampled depth texture to resolve.
   * @param {GPUTexture} destinationTexture - Destination depth texture to resolve to.
   * @param {string} [mode] - The depth resolve mode (DEPTHRESOLVE_***). Defaults to
   * {@link DEPTHRESOLVE_MIN}.
   * @private
   */
  resolveDepth(commandEncoder, sourceTexture, destinationTexture, mode = DEPTHRESOLVE_MIN) {
    Debug.assert(sourceTexture.sampleCount > 1);
    Debug.assert(destinationTexture.sampleCount === 1);
    Debug.assert(sourceTexture.depthOrArrayLayers === destinationTexture.depthOrArrayLayers);
    const device = this.device;
    const wgpu = device.wgpu;
    const pipeline = this.getPipeline(destinationTexture.format, mode);
    DebugGraphics.pushGpuMarker(device, "DEPTH_RESOLVE-RENDERER");
    const numFaces = sourceTexture.depthOrArrayLayers;
    for (let face = 0; face < numFaces; face++) {
      const srcView = sourceTexture.createView({
        dimension: "2d",
        aspect: "depth-only",
        baseMipLevel: 0,
        mipLevelCount: 1,
        baseArrayLayer: face
      });
      const dstView = destinationTexture.createView({
        dimension: "2d",
        baseMipLevel: 0,
        mipLevelCount: 1,
        baseArrayLayer: face
      });
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: dstView,
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      DebugHelper.setLabel(passEncoder, "DepthResolve-PassEncoder");
      const bindGroup = wgpu.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: srcView
        }]
      });
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(4);
      passEncoder.end();
    }
    DebugGraphics.popGpuMarker(device);
    device.pipeline = null;
  }
}
export {
  WebgpuResolver
};
