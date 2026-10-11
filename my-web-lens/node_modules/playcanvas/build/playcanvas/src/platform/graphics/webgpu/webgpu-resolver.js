import { Shader } from "../shader.js";
import { DEPTHRESOLVE_MAX, DEPTHRESOLVE_MIN, DEPTHRESOLVE_SAMPLE0, SHADERLANGUAGE_WGSL } from "../constants.js";
import webgpuDepthResolve from "../shader-chunks/frag/webgpu-depth-resolve.js";
class WebgpuResolver {
	device;
	pipelineCache = /* @__PURE__ */ new Map();
	shaderCache = /* @__PURE__ */ new Map();
	constructor(device) {
		this.device = device;
	}
	destroy() {
		this.shaderCache.forEach((shader) => shader.destroy());
		this.shaderCache = null;
		this.pipelineCache = null;
	}
	getShader(mode) {
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
	getPipeline(format, mode) {
		const key = `${format}-${mode}`;
		let pipeline = this.pipelineCache.get(key);
		if (!pipeline) {
			pipeline = this.createPipeline(format, mode);
			this.pipelineCache.set(key, pipeline);
		}
		return pipeline;
	}
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
		return pipeline;
	}
	resolveDepth(commandEncoder, sourceTexture, destinationTexture, mode = DEPTHRESOLVE_MIN) {
		const device = this.device;
		const wgpu = device.wgpu;
		const pipeline = this.getPipeline(destinationTexture.format, mode);
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
		device.pipeline = null;
	}
}
export {
	WebgpuResolver
};
