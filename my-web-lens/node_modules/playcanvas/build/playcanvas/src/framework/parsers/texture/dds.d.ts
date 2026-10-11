/**
 * Legacy texture parser for dds files.
 */
export class DdsParser extends TextureParser {
    canParse(context: any): boolean;
    load(url: any, callback: any, asset: any): void;
    open(url: any, data: any, device: any, textureOptions?: {}): Texture;
}
import { TextureParser } from './texture.js';
import { Texture } from '../../../platform/graphics/texture.js';
