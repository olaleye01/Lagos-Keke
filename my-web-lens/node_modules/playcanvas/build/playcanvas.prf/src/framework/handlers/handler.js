import { path } from "../../core/path.js";
import { http, Http } from "../../platform/net/http.js";
import { Asset } from "../asset/asset.js";
class ResourceHandler {
	handlerType = "";
	_app;
	_maxRetries = 0;
	_parsers = [];
	constructor(app, handlerType) {
		this._app = app;
		this.handlerType = handlerType;
	}
	get app() {
		return this._app;
	}
	set maxRetries(value) {
		this._maxRetries = value;
	}
	get maxRetries() {
		return this._maxRetries;
	}
	addParser(parser, decider) {
		if (decider !== void 0) {
		}
		if (!parser || typeof parser.canParse !== "function") {
			return;
		}
		parser.handler = this;
		this._parsers.push(parser);
	}
	removeParser(parser) {
		const index = this._parsers.indexOf(parser);
		if (index !== -1) {
			this._parsers.splice(index, 1);
			parser.handler = null;
		}
	}
	get parsers() {
		return this._parsers.slice();
	}
	fetch(url, responseType, callback, asset) {
		if (typeof url === "string") {
			url = { load: url, original: url };
		}
		if (responseType === Http.ResponseType.ARRAY_BUFFER) {
			Asset.fetchArrayBuffer(url.load, callback, asset, this.maxRetries);
			return;
		}
		http.get(url.load, {
			responseType,
			retry: this.maxRetries > 0,
			maxRetries: this.maxRetries
		}, callback);
	}
	_makeContext(url, asset) {
		const original = url && typeof url === "object" ? url.original : url;
		const clean = original ? original.split("?")[0] : "";
		return {
			url: original ?? null,
			ext: original ? path.getExtension(clean).toLowerCase().replace(".", "") : "",
			basename: original ? path.getBasename(clean).toLowerCase() : "",
			asset,
			app: this._app
		};
	}
	_selectParser(context) {
		for (let i = this._parsers.length - 1; i >= 0; i--) {
			if (this._parsers[i].canParse(context)) {
				return this._parsers[i];
			}
		}
		return null;
	}
	load(url, callback, asset) {
		if (this._parsers.length === 0) {
			return;
		}
		if (typeof url === "string") {
			url = {
				load: url,
				original: url
			};
		}
		const context = this._makeContext(url, asset);
		const parser = this._selectParser(context);
		if (!parser) {
			callback(`No parser found for resource: ${context.url}`);
			return;
		}
		parser.load(url, callback, asset);
	}
	open(url, data, asset) {
		if (this._parsers.length === 0) {
			return data;
		}
		const parser = this._selectParser(this._makeContext(url, asset));
		return parser?.open ? parser.open(url, data, asset) : data;
	}
	patch(asset, assets) {
	}
}
export {
	ResourceHandler
};
