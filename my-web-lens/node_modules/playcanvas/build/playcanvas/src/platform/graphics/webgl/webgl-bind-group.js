class WebglBindGroup {
	buffers = [];
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
