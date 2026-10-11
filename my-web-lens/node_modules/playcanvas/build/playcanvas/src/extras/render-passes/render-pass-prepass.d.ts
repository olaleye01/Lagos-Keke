/**
 * A render pass which typically executes before the rendering of the main scene, and renders data
 * that is required for the main rendering pass (and also in following passes) into separate render
 * targets. This can include depth, normals, velocity, etc, used by TAA, motion blur, SSAO, etc.
 *
 * @category Graphics
 * @ignore
 */
export class RenderPassPrepass extends RenderPass {
    constructor(device: any, scene: any, renderer: any, camera: any, options: any);
    /** @type {Texture} */
    linearDepthTexture: Texture;
    /** @type {Color} */
    linearDepthClearValue: Color;
    /**
     * The layerList indices of the sub-layers this prepass renders. Rebuilt each frame in
     * frameUpdate (where culling is also requested) and consumed by execute.
     *
     * @type {number[]}
     */
    _qualifiedLayerIndices: number[];
    scene: any;
    renderer: any;
    camera: any;
    setupRenderTarget(options: any): void;
    linearDepthFormat: number;
}
import { RenderPass } from '../../platform/graphics/render-pass.js';
import { Texture } from '../../platform/graphics/texture.js';
import { Color } from '../../core/math/color.js';
