/**
 * @import { ResourceLoader } from '../handlers/loader.js'
 * @import { Texture } from '../../platform/graphics/texture.js'
 */
/**
 * Represents the resource of a font asset.
 *
 * @category User Interface
 */
export class Font {
    /**
     * Create a new Font instance.
     *
     * @param {Texture[]} textures - The font textures.
     * @param {object} data - The font data.
     */
    constructor(textures: Texture[], data: object);
    type: any;
    em: number;
    /**
     * The font textures.
     *
     * @type {Texture[]}
     */
    textures: Texture[];
    /**
     * The font intensity.
     */
    intensity: number;
    /**
     * The resource loader used to load the font textures. Set by the {@link FontHandler} so
     * that {@link Font#destroy} can release the textures from the loader cache. Null for fonts
     * created without going through the resource loader.
     *
     * @type {ResourceLoader|null}
     * @ignore
     */
    _loader: ResourceLoader | null;
    _data: any;
    set data(value: any);
    get data(): any;
    /**
     * Frees the GPU textures owned by the font and removes them from the resource loader cache.
     * Called automatically when the owning font asset is unloaded (see {@link Asset#unload}).
     */
    destroy(): void;
}
import type { Texture } from '../../platform/graphics/texture.js';
import type { ResourceLoader } from '../handlers/loader.js';
