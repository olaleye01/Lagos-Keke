import { JsonParser } from "../parsers/json.js";
import { ResourceHandler } from "./handler.js";
class JsonHandler extends ResourceHandler {
	decoder = null;
	constructor(app) {
		super(app, "json");
		this.addParser(new JsonParser());
	}
	openBinary(data) {
		this.decoder ?? (this.decoder = new TextDecoder("utf-8"));
		return JSON.parse(this.decoder.decode(data));
	}
}
export {
	JsonHandler
};
