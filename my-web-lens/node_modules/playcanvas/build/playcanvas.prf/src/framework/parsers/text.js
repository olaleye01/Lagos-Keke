import { Http } from "../../platform/net/http.js";
class TextParser {
	canParse() {
		return true;
	}
	load(url, callback, asset) {
		const original = typeof url === "string" ? url : url.original;
		this.handler.fetch(url, Http.ResponseType.TEXT, (err, response) => {
			if (err) {
				callback(`Error loading ${this.handler.handlerType} resource: ${original} [${err}]`);
			} else {
				callback(null, response);
			}
		}, asset);
	}
}
export {
	TextParser
};
