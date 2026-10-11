/**
 * Parser for text-based resources (css, html, shader, plain text). Fetches the URL as text and returns
 * the string. Shared by the handlers whose only difference is the resource type used in error messages.
 *
 * @ignore
 */
export class TextParser {
    canParse(): boolean;
    load(url: any, callback: any, asset: any): void;
}
