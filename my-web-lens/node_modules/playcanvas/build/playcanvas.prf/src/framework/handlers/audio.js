import { AudioParser } from "../parsers/audio.js";
import { ResourceHandler } from "./handler.js";
class AudioHandler extends ResourceHandler {
	constructor(app) {
		super(app, "audio");
		this.manager = app.soundManager;
		this.addParser(new AudioParser());
	}
}
export {
	AudioHandler
};
