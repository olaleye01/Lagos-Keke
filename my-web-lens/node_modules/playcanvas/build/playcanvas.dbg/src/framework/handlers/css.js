var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { TextParser } from "../parsers/text.js";
import { ResourceHandler } from "./handler.js";
class CssHandler extends ResourceHandler {
  constructor(app) {
    super(app, "css");
    /**
     * TextDecoder for decoding binary data.
     *
     * @type {TextDecoder|null}
     * @private
     */
    __publicField(this, "decoder", null);
    this.addParser(new TextParser());
  }
  /**
   * Parses raw DataView and returns string.
   *
   * @param {DataView} data - The raw data as a DataView
   * @returns {string} The parsed resource data.
   */
  openBinary(data) {
    this.decoder ?? (this.decoder = new TextDecoder("utf-8"));
    return this.decoder.decode(data);
  }
}
export {
  CssHandler
};
