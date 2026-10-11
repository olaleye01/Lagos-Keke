import { Shader } from "../shader.js";
import { SHADERLANGUAGE_WGSL } from "../constants.js";
import webgpuMipmap from "../shader-chunks/frag/webgpu-mipmap.js";
class WebgpuMipmapRenderer {
	device;
	pipelineCache = /* @__PURE__ */ new Map();
	constructor(device) {
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
	generate(webgpuTexture) {
		const textureDescr = webgpuTexture.desc;
		if (textureDescr.mipLevelCount <= 1) {
			return;
		}
		if (webgpuTexture.texture.volume) {
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
		device.pipeline = null;
	}
}
export {
	WebgpuMipmapRenderer
};
