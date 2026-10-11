import { TRACEID_RENDER_TARGET_ALLOC } from "../../core/constants.js";
import { DEPTHRESOLVE_MAX, DEPTHRESOLVE_MIN, DEPTHRESOLVE_SAMPLE0, PIXELFORMAT_DEPTH, PIXELFORMAT_DEPTH16, PIXELFORMAT_DEPTHSTENCIL, PIXELFORMAT_R32F, RENDERTARGET_ORIGIN_BOTTOM, RENDERTARGET_ORIGIN_NATIVE, RENDERTARGET_ORIGIN_TOP, isSrgbPixelFormat, isMultisampleResolveCapablePixelFormat } from "./constants.js";
import { GraphicsDevice } from "./graphics-device.js";
import { TextureUtils } from "./texture-utils.js";
let id = 0;
class RenderTarget {
	name;
	_device;
	_colorBuffer;
	_colorBuffers;
	_depthBuffer;
	_resolveBuffers = null;
	_depthResolveBuffer = null;
	_depth;
	_stencil;
	_samples;
	_transientColor;
	_transientDepth;
	autoResolve;
	_depthResolveMode = DEPTHRESOLVE_MIN;
	_face;
	_mipLevel;
	_mipmaps;
	_width;
	_height;
	_flipY;
	_origin;
	constructor(options = {}) {
		this.id = id++;
		const device = options.colorBuffer?.device ?? options.colorBuffers?.[0].device ?? options.depthBuffer?.device ?? options.graphicsDevice;
		this._device = device;
		const { maxSamples } = this._device;
		const suppliedColorBuffers = options.colorBuffers ?? (options.colorBuffer ? [options.colorBuffer] : void 0);
		const msColorBuffer = suppliedColorBuffers?.find((colorBuffer) => colorBuffer?.samples > 1);
		const msDepthBuffer = (options.depthBuffer?.samples ?? 1) > 1 ? options.depthBuffer : void 0;
		const msBuffer = msColorBuffer ?? msDepthBuffer;
		const explicitMsaa = !!msBuffer;
		if (explicitMsaa) {
			this._samples = msBuffer.samples;
		} else {
			this._samples = Math.min(options.samples ?? 1, maxSamples);
			if (device.isWebGPU) {
				this._samples = this._samples > 1 ? maxSamples : 1;
			}
		}
		this._colorBuffer = options.colorBuffer;
		if (options.colorBuffer) {
			this._colorBuffers = [options.colorBuffer];
		}
		this._depthBuffer = options.depthBuffer;
		this._face = options.face ?? 0;
		if (this._depthBuffer) {
			const format = this._depthBuffer._format;
			if (format === PIXELFORMAT_DEPTH || format === PIXELFORMAT_DEPTH16) {
				this._depth = true;
				this._stencil = false;
			} else if (format === PIXELFORMAT_DEPTHSTENCIL) {
				this._depth = true;
				this._stencil = true;
			} else if (format === PIXELFORMAT_R32F && this._depthBuffer.device.isWebGPU && this._samples > 1) {
				this._depth = true;
				this._stencil = false;
			} else {
				this._depth = false;
				this._stencil = false;
			}
		} else {
			this._depth = options.depth ?? true;
			this._stencil = options.stencil ?? false;
		}
		if (options.colorBuffers) {
			if (!this._colorBuffers) {
				this._colorBuffers = [...options.colorBuffers];
				this._colorBuffer = options.colorBuffers[0];
			}
		}
		const resolveOption = options.resolveBuffers ?? (options.resolveBuffer !== void 0 ? [options.resolveBuffer] : void 0);
		if (resolveOption) {
			if (explicitMsaa) {
				this._resolveBuffers = [...resolveOption];
			} else {
			}
		}
		if (options.depthResolveBuffer) {
			if (msDepthBuffer) {
				this._depthResolveBuffer = options.depthResolveBuffer;
			} else {
			}
		}
		this.autoResolve = options.autoResolve ?? true;
		this.name = options.name;
		if (!this.name) {
			this.name = this._colorBuffer?.name;
		}
		if (!this.name) {
			this.name = this._depthBuffer?.name;
		}
		if (!this.name) {
			this.name = "Untitled";
		}
		this.depthResolveMode = options.depthResolveMode ?? DEPTHRESOLVE_MIN;
		const transientSupported = !!this._device.supportsTransientAttachments;
		this._transientColor = (options.transientColor ?? false) && transientSupported && this._samples > 1 && !explicitMsaa;
		if ((options.transientColor ?? false) && explicitMsaa) {
		}
		this._transientDepth = (options.transientDepth ?? false) && transientSupported && !this._depthBuffer;
		if ((options.transientDepth ?? false) && this._depthBuffer) {
		}
		if (options.origin === RENDERTARGET_ORIGIN_TOP) {
			this._flipY = !device.isWebGPU;
			this._origin = RENDERTARGET_ORIGIN_TOP;
		} else if (options.origin === RENDERTARGET_ORIGIN_BOTTOM) {
			this._flipY = device.isWebGPU;
			this._origin = RENDERTARGET_ORIGIN_BOTTOM;
		} else if (options.origin === RENDERTARGET_ORIGIN_NATIVE) {
			this._flipY = false;
			this._origin = RENDERTARGET_ORIGIN_NATIVE;
		} else {
			if (options.flipY !== void 0) {
			}
			this._flipY = options.flipY ?? false;
			this._origin = this._flipY ? device.isWebGPU ? RENDERTARGET_ORIGIN_BOTTOM : RENDERTARGET_ORIGIN_TOP : RENDERTARGET_ORIGIN_NATIVE;
		}
		this._mipLevel = options.mipLevel ?? 0;
		if (this._mipLevel > 0 && explicitMsaa) {
			this._mipLevel = 0;
		}
		if (this._mipLevel > 0 && this._depth) {
			this._mipLevel = 0;
		}
		this._mipmaps = options.mipLevel === void 0;
		this.evaluateDimensions();
		this.validateMrt();
		this.impl = device.createRenderTargetImpl(this);
	}
	destroy() {
		const device = this._device;
		if (device) {
			device.targets.delete(this);
			if (device.renderTarget === this) {
				device.setRenderTarget(null);
			}
			this.destroyFrameBuffers();
		}
	}
	destroyFrameBuffers() {
		const device = this._device;
		if (device) {
			this.impl.destroy(device);
		}
	}
	destroyTextureBuffers() {
		this._depthBuffer?.destroy();
		this._depthBuffer = null;
		this._colorBuffers?.forEach((colorBuffer) => {
			colorBuffer.destroy();
		});
		this._colorBuffers = null;
		this._colorBuffer = null;
		this._resolveBuffers?.forEach((resolveBuffer) => {
			resolveBuffer?.destroy();
		});
		this._resolveBuffers = null;
		this._depthResolveBuffer?.destroy();
		this._depthResolveBuffer = null;
	}
	resize(width, height) {
		if (this.mipLevel > 0) {
			return;
		}
		this._depthBuffer?.resize(width, height);
		this._colorBuffers?.forEach((colorBuffer) => {
			colorBuffer.resize(width, height);
		});
		this._resolveBuffers?.forEach((resolveBuffer) => {
			resolveBuffer?.resize(width, height);
		});
		this._depthResolveBuffer?.resize(width, height);
		if (this._width !== width || this._height !== height) {
			this.destroyFrameBuffers();
			const device = this._device;
			if (device.renderTarget === this) {
				device.setRenderTarget(null);
			}
			this.evaluateDimensions();
			this.validateMrt();
			this.impl = device.createRenderTargetImpl(this);
		}
	}
	validateMrt() {
	}
	evaluateDimensions() {
		const buffer = this._colorBuffer ?? this._depthBuffer;
		if (buffer) {
			this._width = buffer.width;
			this._height = buffer.height;
			if (this._mipLevel > 0) {
				this._width = TextureUtils.calcLevelDimension(this._width, this._mipLevel);
				this._height = TextureUtils.calcLevelDimension(this._height, this._mipLevel);
			}
		}
	}
	init() {
		this.impl.init(this._device, this);
	}
	get initialized() {
		return this.impl.initialized;
	}
	get device() {
		return this._device;
	}
	loseContext() {
		this.impl.loseContext();
	}
	resolve(color = true, depth = !!this._depthBuffer) {
		if (this._device && this._samples > 1) {
			this.impl.resolve(this._device, this, color, depth);
		}
	}
	copy(source, color, depth) {
		if (!this._device) {
			if (source._device) {
				this._device = source._device;
			} else {
				return false;
			}
		}
		const success = this._device.copyRenderTarget(source, this, color, depth);
		return success;
	}
	set flipY(value) {
		this._flipY = value;
		this._origin = value ? this._device.isWebGPU ? RENDERTARGET_ORIGIN_BOTTOM : RENDERTARGET_ORIGIN_TOP : RENDERTARGET_ORIGIN_NATIVE;
	}
	get flipY() {
		return this._flipY;
	}
	get origin() {
		return this._origin;
	}
	get samples() {
		return this._samples;
	}
	set depthResolveMode(value) {
		this._depthResolveMode = value;
	}
	get depthResolveMode() {
		return this._depthResolveMode;
	}
	get transientColor() {
		return this._transientColor;
	}
	get transientDepth() {
		return this._transientDepth;
	}
	get depth() {
		return this._depth;
	}
	get stencil() {
		return this._stencil;
	}
	get colorBuffer() {
		return this._colorBuffer;
	}
	get colorBufferCount() {
		return this._colorBuffers?.length ?? 0;
	}
	getColorBuffer(index) {
		return this._colorBuffers?.[index];
	}
	get resolveBuffer() {
		return this._resolveBuffers?.[0] ?? null;
	}
	getResolveBuffer(index = 0) {
		return this._resolveBuffers?.[index] ?? null;
	}
	get depthBuffer() {
		return this._depthBuffer;
	}
	get depthResolveBuffer() {
		return this._depthResolveBuffer;
	}
	get face() {
		return this._face;
	}
	get mipLevel() {
		return this._mipLevel;
	}
	get mipmaps() {
		return this._mipmaps;
	}
	get width() {
		return this._width ?? this._device.width;
	}
	get height() {
		return this._height ?? this._device.height;
	}
	set _glFrameBuffer(value) {
	}
	get _glFrameBuffer() {
		return this.impl._glFrameBuffer;
	}
	isColorBufferSrgb(index = 0) {
		if (this.device.backBuffer === this) {
			return isSrgbPixelFormat(this.device.backBufferFormat);
		}
		const colorBuffer = this.getColorBuffer(index);
		return colorBuffer ? isSrgbPixelFormat(colorBuffer.format) : false;
	}
}
export {
	RenderTarget
};
