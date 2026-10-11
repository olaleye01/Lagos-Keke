import { Http } from "../../platform/net/http.js";
class JsonParser {
	canParse() {
		return true;
	}
	load(url, callback, asset) {
		const original = typeof url === "string" ? url : url.original;
		this.handler.fetch(url, Http.ResponseType.JSON, (err, response) => {
			if (err) {
				callback(`Error loading JSON resource: ${original} [${err}]`);
			} else {
				callback(null, response);
			}
		}, asset);
	}
}
export {
	JsonParser
};
