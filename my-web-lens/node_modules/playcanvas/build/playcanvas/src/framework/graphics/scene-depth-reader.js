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
	camera;
	_requests = [];
	_buffers = /* @__PURE__ */ new Map();
	_depthRendered = true;
	_valid = true;
	device;
	pass;
	renderTarget;
	viewport;
	_shaderKey;
	_onPostRender;
	_onDeviceDestroy;
	_onCameraRemove;
	// the uniform scope ids the pass writes, and the scratch values written through them
	rectId;
	rectValue;
	gridId;
	gridValue;
	farId;
	emptyId;
	depthMapId;
	cameraParamsId;
	cameraParams;
	constructor(camera) {
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
	read(rect, width, height, target) {
		const count = width * height;
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
				this._returnBuffer(buffer);
			}
			target.fill(Infinity, 0, count);
			resolve(target);
		});
	}
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
	_destroyRenderTarget() {
		if (this.renderTarget) {
			this.renderTarget.colorBuffer.destroy();
			this.renderTarget.destroy();
			this.renderTarget = null;
		}
	}
	_borrowBuffer(byteLength) {
		const pool = this._buffers.get(byteLength);
		const buffer = pool?.pop();
		if (buffer) {
			return buffer;
		}
		const bytes = new Uint8Array(byteLength);
		return { bytes, view: new DataView(bytes.buffer) };
	}
	_returnBuffer(buffer) {
		const byteLength = buffer.bytes.byteLength;
		const pool = this._buffers.get(byteLength) ?? [];
		pool.push(buffer);
		this._buffers.set(byteLength, pool);
	}
	_invalidate() {
		this._valid = false;
		this._settleRequests();
	}
	_settleRequests() {
		this._requests.forEach((request) => {
			request.target.fill(Infinity, 0, request.width * request.height);
			request.resolve(request.target);
		});
		this._requests.length = 0;
	}
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
