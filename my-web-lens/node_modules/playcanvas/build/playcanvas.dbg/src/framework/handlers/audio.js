import { Debug } from "../../core/debug.js";
import { AudioParser } from "../parsers/audio.js";
import { ResourceHandler } from "./handler.js";
class AudioHandler extends ResourceHandler {
  /**
   * Create a new AudioHandler instance.
   *
   * @param {AppBase} app - The running {@link AppBase}.
   * @ignore
   */
  constructor(app) {
    super(app, "audio");
    this.manager = app.soundManager;
    Debug.assert(this.manager, "AudioHandler cannot be created without sound manager");
    this.addParser(new AudioParser());
  }
}
export {
  AudioHandler
};
