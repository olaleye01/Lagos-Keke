import { http, Http } from "../../platform/net/http.js";
import { GSplatOctreeResource } from "../../scene/gsplat-unified/gsplat-octree.resource.js";
import { GSplatAssetLoader } from "../components/gsplat/gsplat-asset-loader.js";
class GSplatOctreeParser {
	app;
	constructor(app) {
		this.app = app;
	}
	canParse(context) {
		return context.basename === "lod-meta.json";
	}
	load(url, callback, asset) {
		if (typeof url === "string") {
			url = {
				load: url,
				original: url
			};
		}
		const options = {
			retry: this.handler.maxRetries > 0,
			maxRetries: this.handler.maxRetries,
			responseType: Http.ResponseType.JSON
		};
		http.get(url.load, options, (err, data) => {
			if (!err) {
				const assetLoader = new GSplatAssetLoader(this.app.assets);
				const resource = new GSplatOctreeResource(asset.file.url, data, assetLoader);
				callback(null, resource);
			} else {
				callback(`Error loading gsplat octree: ${url.original} [${err}]`);
			}
		});
	}
}
export {
	GSplatOctreeParser
};
