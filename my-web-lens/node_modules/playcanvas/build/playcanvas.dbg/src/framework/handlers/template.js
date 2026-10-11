var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { TemplateParser } from "../parsers/template.js";
import { Template } from "../template.js";
import { ResourceHandler } from "./handler.js";
class TemplateHandler extends ResourceHandler {
  constructor(app) {
    super(app, "template");
    /**
     * TextDecoder for decoding binary data.
     *
     * @type {TextDecoder|null}
     * @private
     */
    __publicField(this, "decoder", null);
    this.addParser(new TemplateParser());
  }
  /**
   * Parses raw DataView and returns string.
   *
   * @param {DataView} data - The raw data as a DataView
   * @returns {Template} The parsed resource data.
   */
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
