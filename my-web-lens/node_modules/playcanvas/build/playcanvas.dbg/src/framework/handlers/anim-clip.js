import { AnimClipParser } from "../parsers/anim-clip.js";
import { ResourceHandler } from "./handler.js";
class AnimClipHandler extends ResourceHandler {
  constructor(app) {
    super(app, "animclip");
    this.addParser(new AnimClipParser());
  }
}
export {
  AnimClipHandler
};
