var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { JsonParser } from "../parsers/json.js";
import { ResourceHandler } from "./handler.js";
class JsonHandler extends ResourceHandler {
  constructor(app) {
    super(app, "json");
    /**
     * TextDecoder for decoding binary data.
     *
     * @type {TextDecoder|null}
     * @private
     */
    __publicField(this, "decoder", null);
    this.addParser(new JsonParser());
  }
  /**
   * Parses raw DataView and returns string.
   *
   * @param {DataView} data - The raw data as a DataView
   * @returns {object} The parsed resource data.
   */
  openBinary(data) {
    this.decoder ?? (this.decoder = new TextDecoder("utf-8"));
    return JSON.parse(this.decoder.decode(data));
  }
}
export {
  JsonHandler
};
