/**
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 * @import { WebgpuShader } from './webgpu-shader.js'
 */
/**
 * A WebGPU helper class implementing custom resolve of multi-sampled textures.
 *
 * @ignore
 */
export class WebgpuResolver {
    constructor(device: any);
    /** @type {WebgpuGraphicsDevice} */
    device: WebgpuGraphicsDevice;
    /**
     * Cache of render pipelines for each texture format and depth resolve mode, to avoid their
     * per frame creation.
     *
     * @type {Map<string, GPURenderPipeline>}
     * @private
     */
    private pipelineCache;
    /**
     * Cache of shaders for each depth resolve mode (DEPTHRESOLVE_***).
     *
     * @type {Map<string, Shader>}
     * @private
     */
    private shaderCache;
    destroy(): void;
    /**
     * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
     * @returns {Shader} Shader for the given resolve mode.
     * @private
     */
    private getShader;
    /**
     * @param {GPUTextureFormat} format - Texture format.
     * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
     * @returns {GPURenderPipeline} Pipeline for the given format and resolve mode.
     * @private
     */
    private getPipeline;
    /**
     * @param {GPUTextureFormat} format - Texture format.
     * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
     * @returns {GPURenderPipeline} Pipeline for the given format and resolve mode.
     * @private
     */
    private createPipeline;
    /**
     * @param {GPUCommandEncoder} commandEncoder - Command encoder to use for the resolve.
     * @param {GPUTexture} sourceTexture - Source multi-sampled depth texture to resolve.
     * @param {GPUTexture} destinationTexture - Destination depth texture to resolve to.
     * @param {string} [mode] - The depth resolve mode (DEPTHRESOLVE_***). Defaults to
     * {@link DEPTHRESOLVE_MIN}.
     * @private
     */
    private resolveDepth;
}
import type { WebgpuGraphicsDevice } from './webgpu-graphics-device.js';
