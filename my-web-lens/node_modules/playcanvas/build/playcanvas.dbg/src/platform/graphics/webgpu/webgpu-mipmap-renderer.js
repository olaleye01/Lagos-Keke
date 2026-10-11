var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { Shader } from "../shader.js";
import { SHADERLANGUAGE_WGSL } from "../constants.js";
import { Debug, DebugHelper } from "../../../core/debug.js";
import { DebugGraphics } from "../debug-graphics.js";
import webgpuMipmap from "../shader-chunks/frag/webgpu-mipmap.js";
class WebgpuMipmapRenderer {
  constructor(device) {
    /** @type {WebgpuGraphicsDevice} */
    __publicField(this, "device");
    /**
     * Cache of render pipelines keyed by texture format.
     *
     * @type {Map<string, GPURenderPipeline>}
     * @private
     */
    __publicField(this, "pipelineCache", /* @__PURE__ */ new Map());
    this.device = device;
    this.shader = new Shader(device, {
      name: "WebGPUMipmapRendererShader",
      shaderLanguage: SHADERLANGUAGE_WGSL,
      vshader: webgpuMipmap,
      fshader: webgpuMipmap
    });
    this.minSampler = device.wgpu.createSampler({ minFilter: "linear" });
  }
  destroy() {
    this.shader.destroy();
    this.shader = null;
    this.pipelineCache.clear();
  }
  /**
   * Generates mipmaps for the specified WebGPU texture.
   *
   * @param {WebgpuTexture} webgpuTexture - The texture to generate mipmaps for.
   */
  generate(webgpuTexture) {
    const textureDescr = webgpuTexture.desc;
    if (textureDescr.mipLevelCount <= 1) {
      return;
    }
    if (webgpuTexture.texture.volume) {
      Debug.warnOnce("WebGPU mipmap generation is not supported volume texture.", webgpuTexture.texture);
      return;
    }
    const device = this.device;
    const wgpu = device.wgpu;
    const format = textureDescr.format;
    let pipeline = this.pipelineCache.get(format);
    if (!pipeline) {
      const webgpuShader = this.shader.impl;
      pipeline = wgpu.createRenderPipeline({
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
      DebugHelper.setLabel(pipeline, `RenderPipeline-MipmapRenderer-${format}`);
      this.pipelineCache.set(format, pipeline);
    }
    const texture = webgpuTexture.texture;
    const numFaces = texture.cubemap ? 6 : texture.array ? texture.arrayLength : 1;
    const srcViews = [];
    for (let face = 0; face < numFaces; face++) {
      srcViews.push(webgpuTexture.createView({
        dimension: "2d",
        baseMipLevel: 0,
        mipLevelCount: 1,
        baseArrayLayer: face
      }));
    }
    const commandEncoder = device.getCommandEncoder();
    DebugGraphics.pushGpuMarker(device, "MIPMAP-RENDERER");
    for (let i = 1; i < textureDescr.mipLevelCount; i++) {
      for (let face = 0; face < numFaces; face++) {
        const dstView = webgpuTexture.createView({
          dimension: "2d",
          baseMipLevel: i,
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
        DebugHelper.setLabel(passEncoder, `MipmapRenderer-PassEncoder_${i}`);
        const bindGroup = wgpu.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{
            binding: 0,
            resource: this.minSampler
          }, {
            binding: 1,
            resource: srcViews[face]
          }]
        });
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(4);
        passEncoder.end();
        srcViews[face] = dstView;
      }
    }
    DebugGraphics.popGpuMarker(device);
    device.pipeline = null;
  }
}
export {
  WebgpuMipmapRenderer
};
