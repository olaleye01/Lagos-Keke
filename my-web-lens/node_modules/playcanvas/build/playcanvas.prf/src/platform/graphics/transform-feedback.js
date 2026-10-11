import { BUFFER_GPUDYNAMIC, PRIMITIVE_POINTS, TRANSFORM_FEEDBACK_INTERLEAVED, TRANSFORM_FEEDBACK_SEPARATE } from "./constants.js";
import { VertexBuffer } from "./vertex-buffer.js";
import { Shader } from "./shader.js";
import { ShaderDefinitionUtils } from "./shader-definition-utils.js";
class TransformFeedback {
	constructor(inputBuffer, outputBuffer, usage = BUFFER_GPUDYNAMIC) {
		const descriptors = Array.isArray(inputBuffer) ? inputBuffer : null;
		if (!descriptors && outputBuffer !== void 0 && !(outputBuffer instanceof VertexBuffer)) {
			usage = outputBuffer;
			outputBuffer = void 0;
		}
		const entries = descriptors ?? [{ input: inputBuffer, output: outputBuffer }];
		this.device = (entries[0].input ?? entries[0].output).device;
		this._inputBuffers = entries.filter((entry) => entry.input).map((entry) => entry.input);
		this._outputBuffers = [];
		this._swapPairs = [];
		this._ownedOutputBuffers = [];
		entries.forEach((entry) => {
			const input = entry.input;
			let output = entry.output;
			if (input && output === void 0 && !descriptors) {
				output = this._createOutputBuffer(input, usage);
				this._ownedOutputBuffers.push(output);
			}
			if (output) {
				this._outputBuffers.push(output);
				if (input) {
					this._swapPairs.push({ input, output });
				}
			}
		});
	}
	_createOutputBuffer(inputBuffer, usage) {
		if (usage === BUFFER_GPUDYNAMIC && inputBuffer.usage !== usage) {
			const gl = this.device.gl;
			gl.bindBuffer(gl.ARRAY_BUFFER, inputBuffer.impl.bufferId);
			gl.bufferData(gl.ARRAY_BUFFER, inputBuffer.storage, gl.DYNAMIC_COPY);
		}
		return new VertexBuffer(inputBuffer.device, inputBuffer.format, inputBuffer.numVertices, {
			usage,
			data: inputBuffer.storage
		});
	}
	static createShader(graphicsDevice, vertexCode, name, feedbackVaryings, feedbackVaryingsMode = TRANSFORM_FEEDBACK_INTERLEAVED) {
		return new Shader(graphicsDevice, ShaderDefinitionUtils.createDefinition(graphicsDevice, {
			name,
			vertexCode,
			feedbackVaryings,
			feedbackVaryingsMode,
			useTransformFeedback: true,
			fragmentCode: "void main(void) {gl_FragColor = vec4(0.0);}"
		}));
	}
	destroy() {
		this._ownedOutputBuffers.forEach((buffer) => buffer.destroy());
	}
	process(shader, swap = true) {
		const device = this.device;
		const oldRt = device.getRenderTarget();
		device.setRenderTarget(null);
		device.updateBegin();
		this._inputBuffers.forEach((buffer) => device.setVertexBuffer(buffer));
		device.setRaster(false);
		device.setTransformFeedbackBuffers(this._outputBuffers);
		device.setShader(shader);
		device.draw({
			type: PRIMITIVE_POINTS,
			base: 0,
			baseVertex: 0,
			count: this._inputBuffers[0].numVertices,
			indexed: false
		});
		device.setTransformFeedbackBuffers(null);
		device.setRaster(true);
		device.updateEnd();
		device.setRenderTarget(oldRt);
		if (swap) {
			this._swapPairs.forEach(({ input, output }) => {
				let tmp = input.impl.bufferId;
				input.impl.bufferId = output.impl.bufferId;
				output.impl.bufferId = tmp;
				tmp = input.impl.vao;
				input.impl.vao = output.impl.vao;
				output.impl.vao = tmp;
			});
			device.removeVertexArrayFromCache(this._inputBuffers);
		}
	}
	get inputBuffer() {
		return this._inputBuffers[0];
	}
	get outputBuffer() {
		return this._outputBuffers[0];
	}
	get inputBuffers() {
		return this._inputBuffers;
	}
	get outputBuffers() {
		return this._outputBuffers;
	}
}
export {
	TransformFeedback
};
