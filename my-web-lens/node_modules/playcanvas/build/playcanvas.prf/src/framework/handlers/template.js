import { TemplateParser } from "../parsers/template.js";
import { Template } from "../template.js";
import { ResourceHandler } from "./handler.js";
class TemplateHandler extends ResourceHandler {
	decoder = null;
	constructor(app) {
		super(app, "template");
		this.addParser(new TemplateParser());
	}
	openBinary(data) {
		this.decoder ?? (this.decoder = new TextDecoder("utf-8"));
		return new Template(this._app, JSON.parse(this.decoder.decode(data)));
	}
	patch(asset, registry) {
		if (!asset || !asset.resource || !asset.data || !asset.data.entities) {
			return;
		}
		const template = asset.resource;
		template.data = asset.data;
	}
}
export {
	TemplateHandler
};
