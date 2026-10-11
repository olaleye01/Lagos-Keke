import { Http } from "../../platform/net/http.js";
import { AnimStateGraph } from "../anim/state-graph/anim-state-graph.js";
class AnimStateGraphParser {
	canParse() {
		return true;
	}
	load(url, callback, asset) {
		const original = typeof url === "string" ? url : url.original;
		this.handler.fetch(url, Http.ResponseType.JSON, (err, response) => {
			if (err) {
				callback(`Error loading animation state graph resource: ${original} [${err}]`);
			} else {
				callback(null, response);
			}
		}, asset);
	}
	open(url, data) {
		return new AnimStateGraph(data);
	}
}
export {
	AnimStateGraphParser
};
