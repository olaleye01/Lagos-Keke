import { AnimStateGraphParser } from "../parsers/anim-state-graph.js";
import { ResourceHandler } from "./handler.js";
class AnimStateGraphHandler extends ResourceHandler {
	constructor(app) {
		super(app, "animstategraph");
		this.addParser(new AnimStateGraphParser());
	}
}
export {
	AnimStateGraphHandler
};
