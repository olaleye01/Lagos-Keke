/**
 * Render pass implementation of a common camera frame rendering with integrated post-processing
 * effects.
 *
 * @category Graphics
 * @ignore
 */
export class FramePassCameraFrame extends FramePass {
    /**
     * The format the scene depth is rendered to on the given device, or undefined when it supports no
     * suitable one. Static, so that the support for it can be tested before a camera frame exists.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @returns {number|undefined} The format, or undefined when there is none.
     * @ignore
     */
    static getSceneDepthFormat(device: GraphicsDevice): number | undefined;
    /**
     * Whether the given device can render the scene textures at all. A particular camera can still be
     * set up in a way which prevents it - see
     * {@link FramePassCameraFrame#sceneTexturesUnsupportedReason}.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @returns {boolean} True if the device can render the scene textures.
     * @ignore
     */
    static isSceneTextureDepthSupported(device: GraphicsDevice): boolean;
    constructor(app: any, cameraFrame: any, cameraComponent: any, options?: {});
    app: any;
    prePass: any;
    scenePass: any;
    composePass: any;
    bloomPass: any;
    ssaoPass: any;
    taaPass: any;
    scenePassHalf: any;
    dofPass: any;
    volumetricFogPass: any;
    _renderTargetScale: number;
    /**
     * True if the render pass needs to be re-created because layers have been added or removed.
     *
     * @ignore
     */
    layersDirty: boolean;
    /**
     * The camera frame that this render pass belongs to.
     *
     * @type {CameraFrame}
     */
    cameraFrame: CameraFrame;
    /**
     * @type {RenderTarget|null}
     * @private
     */
    private rt;
    /**
     * The names of the scene textures the scene pass renders alongside the scene color, in the order
     * of the color attachments they are rendered to. The scene passes are given this array itself, so
     * that assigning it to the camera as they render does not allocate.
     *
     * @type {string[]}
     * @private
     */
    private _sceneTextureNames;
    /**
     * The scene depth rendered by the scene pass as a scene texture, or null when the depth is not
     * rendered this way. Owned by the scene render target it is attached to.
     *
     * @type {Texture|null}
     * @private
     */
    private sceneDepthTexture;
    /**
     * The color attachment index the scene depth is rendered to, or 0 when it is not rendered.
     *
     * @type {number}
     * @private
     */
    private sceneDepthSlot;
    /**
     * A render target holding the scene color alone, aliasing the color attachment of the scene
     * render target. The passes blending into the scene after it has been rendered use this instead of
     * the scene render target, as they sample the scene textures, and a texture attached to the render
     * target being rendered into cannot be sampled. Null when there are no scene textures.
     *
     * @type {RenderTarget|null}
     * @private
     */
    private rtSceneColor;
    /**
     * The clear value of the scene depth texture, set up each frame as it depends on the camera's far
     * clip. The alpha is 1, so that what the gaussian splats blend into it stays a weighted average.
     *
     * @type {Color}
     * @private
     */
    private _sceneDepthClearValue;
    cameraComponent: any;
    options: any;
    reset(): void;
    sceneTexture: Texture;
    sceneTextureHalf: Texture;
    rtHalf: RenderTarget;
    scenePassTransparent: RenderPassForward;
    colorGrabPass: FramePassColorGrab;
    afterPass: RenderPassForward;
    sanitizeOptions(options: any): any;
    /**
     * Whether the gaussian splat director has any splats for this camera. Reports this in a debug build
     * only, and returns false otherwise, as the only use of it is to advise on the scene setting - the
     * shape of the pipeline is a function of the settings alone, and never of the contents of the scene,
     * so that it does not change as the splats are loaded or culled.
     *
     * @returns {boolean} True if the camera renders gaussian splats.
     * @private
     */
    private rendersGSplats;
    /**
     * Whether the depth is consumed no later than the scene pass - by the materials when the user asks
     * for the scene depth map, and by SSAO applied during shading, whose texture the lit shaders sample
     * and which therefore has to be generated before the scene renders. Only the prepass supplies that,
     * as the scene textures do not exist until the scene pass has finished.
     *
     * @param {CameraFrameOptions} options - The options.
     * @returns {boolean} True if the depth is needed no later than the scene pass.
     * @private
     */
    private needsInSceneDepth;
    /**
     * Why this camera cannot render the scene textures, on top of what
     * {@link FramePassCameraFrame.isSceneTextureDepthSupported} already rules out, or null when it can.
     * Note that this is not reported on its own - the scene textures are not something the user asks
     * for, so a camera which cannot use them simply renders the depth with the prepass instead. The
     * reason is only used to explain why the gaussian splats do not contribute to the scene depth,
     * which is visible in the result.
     *
     * @param {CameraFrameOptions} options - The options.
     * @returns {string|null} The reason, or null when this camera can render the scene textures.
     * @private
     */
    private sceneTexturesUnsupportedReason;
    /**
     * The format of the scene depth texture, or undefined when the device supports no floating point
     * format which can be both rendered and blended into.
     *
     * @type {number|undefined}
     * @private
     */
    private get sceneDepthFormat();
    set renderTargetScale(value: number);
    get renderTargetScale(): number;
    needsReset(options: any): boolean;
    update(options: any): void;
    createRenderTarget(name: any, depth: any, stencil: any, samples: any, sceneTextures: any): RenderTarget;
    setupRenderPasses(options: any): void;
    hdrFormat: number;
    _bloomEnabled: boolean;
    _sceneHalfEnabled: any;
    sceneOptions: {
        resizeSource: any;
        scaleX: number;
        scaleY: number;
    };
    /**
     * Scan all RenderPassForward instances in the pass chain and mark the first / last
     * layer render step per camera with firstCameraUse / lastCameraUse. This mirrors what
     * LayerComposition does for the non-CameraFrame path and ensures that beforePasses
     * collection and EVENT_PRERENDER / EVENT_POSTRENDER fire exactly once per camera.
     *
     * @private
     */
    private updateCameraUseFlags;
    collectPasses(): any[];
    createPasses(options: any): void;
    setupScenePrepass(options: any): void;
    setupScenePassSettings(pass: any): void;
    /**
     * Adds the camera's layers from the pass's layer composition to a forward render pass, starting
     * from the given index, till the end of the layer list, or till the last layer with the given id
     * and transparency is reached (inclusive). Only layers that the camera renders are added.
     *
     * @param {RenderPassForward} renderPass - The forward render pass to add the layers to.
     * @param {number} startIndex - The index of the first layer to be considered for adding.
     * @param {boolean} firstLayerClears - True if the first layer added should clear the render target.
     * @param {number} [lastLayerId] - The id of the last layer to be added. If not specified, all
     * layers till the end of the layer list are added.
     * @param {boolean} [lastLayerIsTransparent] - True if the last layer to be added is transparent.
     * Defaults to true.
     * @returns {number} Returns the index of last layer added.
     */
    addCameraLayers(renderPass: RenderPassForward, startIndex: number, firstLayerClears: boolean, lastLayerId?: number, lastLayerIsTransparent?: boolean): number;
    setupScenePass(options: any): {
        lastAddedIndex: number;
        clearRenderTarget: boolean;
    };
    setupSsaoPass(options: any): void;
    setupSceneHalfPass(options: any, sourceTexture: any): void;
    setupBloomPass(options: any, inputTexture: any): void;
    setupDofPass(options: any, inputTexture: any, inputTextureHalf: any): void;
    setupVolumetricFogPass(options: any): void;
    setupTaaPass(options: any): Texture;
    setupComposePass(options: any): void;
    setupAfterPass(options: any, scenePassesInfo: any): void;
}
/**
 * @import { CameraFrame } from './camera-frame.js'
 * @import { GraphicsDevice } from '../../platform/graphics/graphics-device.js'
 */
/**
 * Options used to configure the FramePassCameraFrame. To modify these options, you must create
 * a new instance of the FramePassCameraFrame with the desired settings.
 *
 * @ignore
 */
export class CameraFrameOptions {
    formats: any;
    stencil: boolean;
    samples: number;
    sceneColorMap: boolean;
    lastGrabLayerId: number;
    lastGrabLayerIsTransparent: boolean;
    lastSceneLayerId: number;
    lastSceneLayerIsTransparent: boolean;
    taaEnabled: boolean;
    bloomEnabled: boolean;
    ssaoType: string;
    ssaoBlurEnabled: boolean;
    prepassEnabled: boolean;
    sceneTextureDepth: boolean;
    dofEnabled: boolean;
    dofNearBlur: boolean;
    dofHighQuality: boolean;
    volumetricFogEnabled: boolean;
}
import { FramePass } from '../../platform/graphics/frame-pass.js';
import type { CameraFrame } from './camera-frame.js';
import { Texture } from '../../platform/graphics/texture.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { RenderPassForward } from '../../scene/renderer/render-pass-forward.js';
import { FramePassColorGrab } from '../../scene/graphics/frame-pass-color-grab.js';
import type { GraphicsDevice } from '../../platform/graphics/graphics-device.js';
