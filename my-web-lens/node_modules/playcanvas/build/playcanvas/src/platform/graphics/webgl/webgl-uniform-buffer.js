import { BUFFER_DYNAMIC } from "../constants.js";
import { WebglBuffer } from "./webgl-buffer.js";
class WebglUniformBuffer extends WebglBuffer {
	unlock(uniformBuffer) {
		const device = uniformBuffer.device;
		const gl = device.gl;
		super.unlock(device, BUFFER_DYNAMIC, gl.UNIFORM_BUFFER, uniformBuffer.storageInt32);
	}
}
export {
	WebglUniformBuffer
};
