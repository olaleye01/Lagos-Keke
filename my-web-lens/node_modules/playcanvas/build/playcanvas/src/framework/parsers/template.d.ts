/**
 * Parser for template resources. Fetches the JSON data and wraps it in a {@link Template}.
 *
 * @ignore
 */
export class TemplateParser {
    canParse(): boolean;
    load(url: any, callback: any, asset: any): void;
    open(url: any, data: any): Template;
}
import { Template } from '../template.js';
