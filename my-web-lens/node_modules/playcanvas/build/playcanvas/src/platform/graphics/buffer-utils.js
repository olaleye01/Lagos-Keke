class BufferUtils {
	static createStorageView(buffer, arrayType, byteOffset = 0, length) {
		const storage = buffer.storage;
		const isView = ArrayBuffer.isView(storage);
		const arrayBuffer = isView ? storage.buffer : storage;
		const offset = (isView ? storage.byteOffset : 0) + byteOffset;
		const elementSize = arrayType.BYTES_PER_ELEMENT;
		return new arrayType(arrayBuffer, offset, length ?? Math.floor((buffer.numBytes - byteOffset) / elementSize));
	}
}
export {
	BufferUtils
};
