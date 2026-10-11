var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class WebglBindGroup {
  constructor() {
    /**
     * Per uniform-buffer slot, the object exposing the GL buffer via its `bufferId` (a
     * WebglUniformBuffer for persistent buffers, or a WebglDynamicBuffer for dynamic ones). The GL
     * buffer is read lazily at bind time, as a dynamic buffer's `bufferId` is created on its first
     * upload, after this bind group is built.
     *
     * @type {Array<{ bufferId: WebGLBuffer|null }>}
     */
    __publicField(this, "buffers", []);
  }
  update(bindGroup) {
    const uniformBuffers = bindGroup.uniformBuffers;
    this.buffers.length = uniformBuffers.length;
    for (let i = 0; i < uniformBuffers.length; i++) {
      const uniformBuffer = uniformBuffers[i];
      this.buffers[i] = uniformBuffer.persistent ? uniformBuffer.impl : uniformBuffer.allocation.gpuBuffer;
    }
  }
  destroy() {
    this.buffers.length = 0;
  }
}
export {
  WebglBindGroup
};
