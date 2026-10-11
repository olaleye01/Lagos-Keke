import { TextParser } from "../parsers/text.js";
import { ResourceHandler } from "./handler.js";
class CssHandler extends ResourceHandler {
	decoder = null;
	constructor(app) {
		super(app, "css");
		this.addParser(new TextParser());
	}
	openBinary(data) {
		this.decoder ?? (this.decoder = new TextDecoder("utf-8"));
		return this.decoder.decode(data);
	}
}
export {
	CssHandler
};
