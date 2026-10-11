export class LightsBuffer {
    constructor(device: any);
    areaLightsEnabled: boolean;
    /**
     * Texture storing properties of all lights, one row of pixels per light.
     *
     * @type {Texture|null}
     */
    lightsTexture: Texture | null;
    /** @type {number} */
    _maxLights: number;
    device: any;
    cookiesEnabled: boolean;
    shadowsEnabled: boolean;
    _lightsTextureId: any;
    /**
     * Sets the number of light slots the buffer can store, and allocates the storage for them. This
     * includes slot 0, which is reserved for the 'no light' index, and so the number of usable
     * lights is one less than this.
     *
     * @type {number}
     */
    set maxLights(value: number);
    /**
     * Gets the number of light slots the buffer can store.
     *
     * @type {number}
     */
    get maxLights(): number;
    invMaxColorValue: number;
    invMaxAttenuation: number;
    boundsMin: Vec3;
    boundsDelta: Vec3;
    lightsFloat: Float32Array<ArrayBuffer>;
    lightsUint: Uint32Array<ArrayBuffer>;
    destroy(): void;
    createTexture(device: any, width: any, height: any, format: any, name: any): Texture;
    setBounds(min: any, delta: any): void;
    uploadTextures(): void;
    updateUniforms(): void;
    getSpotDirection(direction: any, spot: any): void;
    getLightAreaSizes(light: any): Float32Array<ArrayBuffer>;
    addLightData(light: any, lightIndex: any): void;
}
import { Texture } from '../../platform/graphics/texture.js';
import { Vec3 } from '../../core/math/vec3.js';
