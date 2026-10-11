import { GSplatOctreeParser } from "../parsers/gsplat-octree.js";
import { PlyParser } from "../parsers/ply.js";
import { SogBundleParser } from "../parsers/sog-bundle.js";
import { SogParser } from "../parsers/sog.js";
import { ResourceHandler } from "./handler.js";
class GSplatHandler extends ResourceHandler {
  /**
   * Create a new GSplatHandler instance.
   *
   * @param {AppBase} app - The running {@link AppBase}.
   * @ignore
   */
  constructor(app) {
    super(app, "gsplat");
    this.addParser(new PlyParser(app));
    this.addParser(new SogBundleParser(app));
    this.addParser(new SogParser(app));
    this.addParser(new GSplatOctreeParser(app));
  }
}
export {
  GSplatHandler
};
