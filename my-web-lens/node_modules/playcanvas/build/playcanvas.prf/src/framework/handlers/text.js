import { TextParser } from "../parsers/text.js";
import { ResourceHandler } from "./handler.js";
class TextHandler extends ResourceHandler {
	decoder = null;
	constructor(app) {
		super(app, "text");
		this.addParser(new TextParser());
	}
	openBinary(data) {
		this.decoder ?? (this.decoder = new TextDecoder("utf-8"));
		return this.decoder.decode(data);
	}
}
export {
	TextHandler
};
