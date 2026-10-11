import { BinaryParser } from "../parsers/binary.js";
import { ResourceHandler } from "./handler.js";
class BinaryHandler extends ResourceHandler {
	constructor(app) {
		super(app, "binary");
		this.addParser(new BinaryParser());
	}
	openBinary(data) {
		return data.buffer;
	}
}
export {
	BinaryHandler
};
