import { Http } from "../../platform/net/http.js";
import { Template } from "../template.js";
class TemplateParser {
  canParse() {
    return true;
  }
  load(url, callback, asset) {
    const original = typeof url === "string" ? url : url.original;
    this.handler.fetch(url, Http.ResponseType.JSON, (err, response) => {
      if (err) {
        callback(`Error requesting template: ${original}`);
      } else {
        callback(null, response);
      }
    }, asset);
  }
  open(url, data) {
    return new Template(this.handler.app, data);
  }
}
export {
  TemplateParser
};
