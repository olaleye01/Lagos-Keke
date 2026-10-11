var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { Debug } from "../../core/debug.js";
import { Vec4 } from "../../core/math/vec4.js";
import {
  ADDRESS_CLAMP_TO_EDGE,
  FILTER_NEAREST,
  PIXELFORMAT_R16F,
  PIXELFORMAT_RGBA8,
  RENDERTARGET_ORIGIN_BOTTOM,
  SEMANTIC_POSITION,
  SHADERLANGUAGE_GLSL,
  SHADERLANGUAGE_WGSL
} from "../../platform/graphics/constants.js";
import { RenderTarget } from "../../platform/graphics/render-target.js";
import { Texture } from "../../platform/graphics/texture.js";
import { EVENT_POSTRENDER } from "../../scene/constants.js";
import { RenderPassShaderQuad } from "../../scene/graphics/render-pass-shader-quad.js";
import { ShaderChunks } from "../../scene/shader-lib/shader-chunks.js";
import { ShaderUtils } from "../../scene/shader-lib/shader-utils.js";
import glslSceneDepthReadPS from "../../scene/shader-lib/glsl/chunks/render-pass/frag/scene-depth-read.js";
import wgslSceneDepthReadPS from "../../scene/shader-lib/wgsl/chunks/render-pass/frag/scene-depth-read.js";
const _farLimitFractionFull = 1 - 1e-5;
const _farLimitFractionHalf = 1 - 15e-4;
class SceneDepthReader {
  /**
   * @param {CameraComponent} camera - The camera whose depth is read.
   */
  constructor(camera) {
    /**
     * The camera whose depth is read.
     *
     * @type {CameraComponent}
     * @private
     */
    __publicField(this, "camera");
    /**
     * Reads requested this frame, rendered and handed to the readback when the camera has finished.
     *
     * @type {object[]}
     * @private
     */
    __publicField(this, "_requests", []);
    /**
     * Readback buffers not currently in flight, keyed by their byte length. Each entry holds the bytes
     * and a view over them, so a read allocates neither.
     *
     * @type {Map<number, object[]>}
     * @private
     */
    __publicField(this, "_buffers", /* @__PURE__ */ new Map());
    /**
     * Whether the camera rendered a depth the last time it finished a frame. Assumed true until then,
     * so that a read issued before the first frame is not turned away.
     *
     * @type {boolean}
     * @private
     */
    __publicField(this, "_depthRendered", true);
    /**
     * False once this reader, the camera it reads or the device has gone, after which nothing further
     * is rendered for it and a read in flight has nothing meaningful left to report.
     *
     * @type {boolean}
     * @private
     */
    __publicField(this, "_valid", true);
    /** @private */
    __publicField(this, "device");
    /** @private */
    __publicField(this, "pass");
    /**
     * Sized to the largest read so far, and never shrunk.
     *
     * @private
     */
    __publicField(this, "renderTarget");
    /** @private */
    __publicField(this, "viewport");
    /** @private */
    __publicField(this, "_shaderKey");
    /** @private */
    __publicField(this, "_onPostRender");
    /** @private */
    __publicField(this, "_onDeviceDestroy");
    /** @private */
    __publicField(this, "_onCameraRemove");
    // the uniform scope ids the pass writes, and the scratch values written through them
    /** @private */
    __publicField(this, "rectId");
    /** @private */
    __publicField(this, "rectValue");
    /** @private */
    __publicField(this, "gridId");
    /** @private */
    __publicField(this, "gridValue");
    /** @private */
    __publicField(this, "farId");
    /** @private */
    __publicField(this, "emptyId");
    /** @private */
    __publicField(this, "depthMapId");
    /** @private */
    __publicField(this, "cameraParamsId");
    /** @private */
    __publicField(this, "cameraParams");
    Debug.assert(camera, "SceneDepthReader requires a camera component.");
    this.camera = camera;
    const device = this.device = camera.system.app.graphicsDevice;
    ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set("sceneDepthReadPS", glslSceneDepthReadPS);
    ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set("sceneDepthReadPS", wgslSceneDepthReadPS);
    this.pass = new RenderPassShaderQuad(device);
    this.renderTarget = null;
    this.viewport = new Vec4();
    this._shaderKey = null;
    const { scope } = device;
    this.rectId = scope.resolve("uDepthReadRect");
    this.rectValue = new Float32Array(4);
    this.gridId = scope.resolve("uDepthReadGrid");
    this.gridValue = new Float32Array(2);
    this.farId = scope.resolve("uDepthReadFar");
    this.emptyId = scope.resolve("uDepthReadEmpty");
    this.depthMapId = scope.resolve("uSceneDepthMap");
    this.cameraParamsId = scope.resolve("camera_params");
    this.cameraParams = new Float32Array(4);
    this._onPostRender = (cameraComponent) => {
      if (cameraComponent === this.camera) {
        this._process();
      }
    };
    camera.system.app.scene.on(EVENT_POSTRENDER, this._onPostRender);
    this._onDeviceDestroy = () => {
      this._invalidate();
    };
    device.on("destroy", this._onDeviceDestroy);
    this._onCameraRemove = () => {
      this._invalidate();
    };
    camera.on("beforeremove", this._onCameraRemove);
  }
  /**
   * Requests the depth of a region of the view, as `width * height` samples in row major order. The
   * region is point sampled rather than averaged - one sample per cell, taken at its centre - so
   * asking for more samples than the region resolves to repeats them.
   *
   * Samples where nothing was rendered read as `Infinity`, as do the few which land within a hair of
   * the far clip, that being the depth an empty pixel reports.
   *
   * Note that on a device which stores the scene depth at a lower precision - see
   * {@link GSplatParams#sceneDepthWrite} - a far clip beyond about 16384 leaves an empty pixel
   * reporting a large distance rather than `Infinity`, as the two stop being far enough apart to
   * tell one from the other.
   *
   * @param {Vec4} rect - The region of the view to sample, normalized, with its origin in the bottom
   * left as {@link CameraComponent#rect}.
   * @param {number} width - The number of samples across the region. Not pixels.
   * @param {number} height - The number of samples down the region.
   * @param {Float32Array} [target] - An array to fill, at least `width * height` long. One is
   * allocated when not given. It is filled when the returned promise resolves, so an array must not
   * be shared between reads which overlap in time.
   * @returns {Promise<Float32Array>|null} The samples, in world units, or null when the camera is
   * disabled or is not rendering a scene depth, leaving nothing to read.
   */
  read(rect, width, height, target) {
    Debug.assert(
      width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height),
      "SceneDepthReader#read needs a whole positive number of samples, as they become the dimensions of a texture."
    );
    const count = width * height;
    Debug.assert(!target || target.length >= count, `SceneDepthReader#read needs an array of at least ${count} samples.`);
    const { camera } = this;
    if (!this._valid || !this._depthRendered || !camera.enabled || !camera.entity.enabled) {
      return null;
    }
    const request = {
      x: rect.x,
      y: rect.y,
      z: rect.z,
      w: rect.w,
      width,
      height,
      target: target ?? new Float32Array(count),
      resolve: null
    };
    const promise = new Promise((resolve) => {
      request.resolve = resolve;
    });
    this._requests.push(request);
    return promise;
  }
  /**
   * Renders and reads back everything requested this frame.
   *
   * @private
   */
  _process() {
    const { camera, device, _requests: requests } = this;
    const internal = camera.camera;
    this._depthRendered = !!internal.sceneDepthMap && internal.sceneDepthMapVersion === device.renderVersion;
    if (requests.length === 0) {
      return;
    }
    if (!this._depthRendered) {
      this._settleRequests();
      return;
    }
    this._updateShader();
    let width = 0;
    let height = 0;
    for (let i = 0; i < requests.length; i++) {
      width = Math.max(width, requests[i].width);
      height = Math.max(height, requests[i].height);
    }
    this._updateRenderTarget(width, height);
    for (let i = 0; i < requests.length; i++) {
      this._readRequest(requests[i]);
    }
    requests.length = 0;
  }
  /**
   * Renders one request and starts its readback.
   *
   * @param {object} request - The request.
   * @private
   */
  _readRequest(request) {
    const { camera } = this;
    const { width, height } = request;
    const internal = camera.camera;
    const { rectValue, gridValue } = this;
    rectValue[0] = request.x;
    rectValue[1] = request.y;
    rectValue[2] = request.z;
    rectValue[3] = request.w;
    this.rectId.setValue(rectValue);
    gridValue[0] = width;
    gridValue[1] = height;
    this.gridId.setValue(gridValue);
    const halfFloat = internal.sceneDepthMap.format === PIXELFORMAT_R16F;
    this.farId.setValue(internal.farClip * (halfFloat ? _farLimitFractionHalf : _farLimitFractionFull));
    this.emptyId.setValue(Infinity);
    this.cameraParamsId.setValue(internal.fillShaderParams(this.cameraParams));
    this.depthMapId.setValue(internal.sceneDepthMap);
    this.pass.viewport = this.viewport.set(0, 0, width, height);
    this.pass.render();
    const count = width * height;
    const buffer = this._borrowBuffer(count * 4);
    const { target, resolve } = request;
    const read = this.renderTarget.colorBuffer.read(0, 0, width, height, {
      renderTarget: this.renderTarget,
      data: buffer.bytes,
      // Flushed as the read is issued, so the depth this read wants is on its way to the GPU
      // rather than sitting in the queue behind the rest of the frame.
      immediate: true,
      // Depth reads come every frame, which is what a readback is worst at - on WebGL its
      // blocking step waits for the rendering queued in front of it, most of a frame's worth
      // every frame. Saying so buys a frame of latency in exchange, which the caller of a
      // depth read absorbs far more easily than the stall.
      frequent: true
    });
    if (!read) {
      Debug.warnOnce("SceneDepthReader: this device implements no texture readback, so the depth reads as empty.");
      target.fill(Infinity, 0, count);
      this._returnBuffer(buffer);
      resolve(target);
      return;
    }
    read.then(() => {
      if (!this._valid) {
        target.fill(Infinity, 0, count);
        resolve(target);
        return;
      }
      const view = buffer.view;
      for (let i = 0; i < count; i++) {
        target[i] = view.getFloat32(i * 4, false);
      }
      this._returnBuffer(buffer);
      resolve(target);
    }).catch((error) => {
      if (this._valid) {
        Debug.warnOnce(`SceneDepthReader read failed: ${error?.message ?? error}`);
        this._returnBuffer(buffer);
      }
      target.fill(Infinity, 0, count);
      resolve(target);
    });
  }
  /**
   * Builds the shader, or rebuilds it when the encoding of the depth this camera renders has changed.
   *
   * @private
   */
  _updateShader() {
    const defines = /* @__PURE__ */ new Map();
    const key = ShaderUtils.addScreenDepthChunkDefines(this.camera.shaderParams, defines);
    if (this._shaderKey !== key) {
      this._shaderKey = key;
      this.pass.shader = ShaderUtils.createShader(this.device, {
        uniqueName: `SceneDepthRead${key}`,
        attributes: { aPosition: SEMANTIC_POSITION },
        vertexChunk: "quadVS",
        fragmentChunk: "sceneDepthReadPS",
        fragmentDefines: defines
      });
    }
  }
  /**
   * Grows the target to hold the requested number of samples. It is never shrunk, so a single large
   * read does not cost every following one an allocation.
   *
   * @param {number} width - Samples across.
   * @param {number} height - Samples down.
   * @private
   */
  _updateRenderTarget(width, height) {
    const current = this.renderTarget;
    if (current && current.width >= width && current.height >= height) {
      return;
    }
    const targetWidth = Math.max(width, current?.width ?? 0);
    const targetHeight = Math.max(height, current?.height ?? 0);
    this._destroyRenderTarget();
    const texture = new Texture(this.device, {
      name: "SceneDepthRead",
      width: targetWidth,
      height: targetHeight,
      format: PIXELFORMAT_RGBA8,
      mipmaps: false,
      minFilter: FILTER_NEAREST,
      magFilter: FILTER_NEAREST,
      addressU: ADDRESS_CLAMP_TO_EDGE,
      addressV: ADDRESS_CLAMP_TO_EDGE
    });
    this.renderTarget = new RenderTarget({
      name: "SceneDepthRead",
      colorBuffer: texture,
      depth: false,
      origin: RENDERTARGET_ORIGIN_BOTTOM
    });
    this.pass.init(this.renderTarget);
  }
  /** @private */
  _destroyRenderTarget() {
    if (this.renderTarget) {
      this.renderTarget.colorBuffer.destroy();
      this.renderTarget.destroy();
      this.renderTarget = null;
    }
  }
  /**
   * @param {number} byteLength - Bytes needed.
   * @returns {object} A buffer and a view over it.
   * @private
   */
  _borrowBuffer(byteLength) {
    const pool = this._buffers.get(byteLength);
    const buffer = pool?.pop();
    if (buffer) {
      return buffer;
    }
    const bytes = new Uint8Array(byteLength);
    return { bytes, view: new DataView(bytes.buffer) };
  }
  /**
   * @param {object} buffer - A buffer no longer in flight.
   * @private
   */
  _returnBuffer(buffer) {
    const byteLength = buffer.bytes.byteLength;
    const pool = this._buffers.get(byteLength) ?? [];
    pool.push(buffer);
    this._buffers.set(byteLength, pool);
  }
  /**
   * Marks the reader as having nothing left to read, and settles what is queued. Called when the
   * device is destroyed, when the camera component is removed, and when the reader itself is
   * destroyed - each of which means no frame will ever service a read again.
   *
   * @private
   */
  _invalidate() {
    this._valid = false;
    this._settleRequests();
  }
  /**
   * Reports every queued read as empty, for the cases where the frame which would have serviced them
   * is never going to arrive.
   *
   * @private
   */
  _settleRequests() {
    this._requests.forEach((request) => {
      request.target.fill(Infinity, 0, request.width * request.height);
      request.resolve(request.target);
    });
    this._requests.length = 0;
  }
  /**
   * Frees the resources the reader owns and stops reading for this camera. Reads which have not been
   * rendered yet report their region as empty, and one already in flight does the same once it
   * completes, rather than writing samples read through resources this has let go of.
   */
  destroy() {
    this.camera.system.app.scene.off(EVENT_POSTRENDER, this._onPostRender);
    this.camera.off("beforeremove", this._onCameraRemove);
    this.device.off("destroy", this._onDeviceDestroy);
    this._invalidate();
    this.pass.shader = null;
    this.pass.destroy();
    this._destroyRenderTarget();
    this._buffers.clear();
  }
}
export {
  SceneDepthReader
};
