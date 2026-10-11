import { GlbAnimationParser } from "../parsers/glb-animation.js";
import { JsonAnimationParser } from "../parsers/json-animation.js";
import { ResourceHandler } from "./handler.js";
class AnimationHandler extends ResourceHandler {
  /**
   * @param {AppBase} app - The running {@link AppBase}.
   * @ignore
   */
  constructor(app) {
    super(app, "animation");
    this.device = app.graphicsDevice;
    this.assets = app.assets;
    this.addParser(new JsonAnimationParser());
    this.addParser(new GlbAnimationParser());
  }
}
export {
  AnimationHandler
};
