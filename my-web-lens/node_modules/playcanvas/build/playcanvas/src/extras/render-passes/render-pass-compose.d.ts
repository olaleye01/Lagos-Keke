/**
 * @import { CameraComponent } from '../../framework/components/camera/component.js';
 * @import { GraphicsDevice } from '../../platform/graphics/graphics-device.js';
 * @import { Texture } from '../../platform/graphics/texture.js';
 */
/**
 * Render pass implementation of the final post-processing composition.
 *
 * @category Graphics
 * @ignore
 */
export class RenderPassCompose extends RenderPassShaderQuad {
    /**
     * @param {GraphicsDevice} graphicsDevice - The graphics device.
     * @param {CameraComponent} cameraComponent - The camera this composes the frame of. Only the depth
     * debug mode needs it, for the depth encoding the camera renders and its clip range.
     */
    constructor(graphicsDevice: GraphicsDevice, cameraComponent: CameraComponent);
    /**
     * @type {Texture|null}
     */
    sceneTexture: Texture | null;
    bloomIntensity: number;
    _bloomTexture: any;
    _cocTexture: any;
    blurTexture: any;
    blurTextureUpscale: boolean;
    _ssaoTexture: any;
    _toneMapping: number;
    _gradingEnabled: boolean;
    gradingSaturation: number;
    gradingContrast: number;
    gradingBrightness: number;
    gradingTint: Color;
    _shaderDirty: boolean;
    _vignetteEnabled: boolean;
    vignetteInner: number;
    vignetteOuter: number;
    vignetteCurvature: number;
    vignetteIntensity: number;
    vignetteColor: Color;
    _fringingEnabled: boolean;
    fringingIntensity: number;
    _colorEnhanceEnabled: boolean;
    colorEnhanceShadows: number;
    colorEnhanceHighlights: number;
    colorEnhanceVibrance: number;
    colorEnhanceDehaze: number;
    colorEnhanceMidtones: number;
    _taaEnabled: boolean;
    _hdrScene: boolean;
    _sharpness: number;
    _gammaCorrection: number;
    /**
     * @type {Texture|null}
     */
    _colorLUT: Texture | null;
    /**
     * @type {Texture|null}
     */
    _colorLUT2: Texture | null;
    colorLUTIntensity: number;
    colorLUT2Intensity: number;
    colorLUTBlend: number;
    _key: string;
    _debug: any;
    _sceneDepthAvailable: boolean;
    _customComposeChunks: Map<string, string>;
    cameraComponent: CameraComponent;
    sceneTextureId: import("../../index.js").ScopeId;
    bloomTextureId: import("../../index.js").ScopeId;
    cocTextureId: import("../../index.js").ScopeId;
    ssaoTextureId: import("../../index.js").ScopeId;
    blurTextureId: import("../../index.js").ScopeId;
    bloomIntensityId: import("../../index.js").ScopeId;
    bcsId: import("../../index.js").ScopeId;
    tintId: import("../../index.js").ScopeId;
    vignetterParamsId: import("../../index.js").ScopeId;
    vignetteColorId: import("../../index.js").ScopeId;
    fringingIntensityId: import("../../index.js").ScopeId;
    sceneTextureInvResId: import("../../index.js").ScopeId;
    sceneTextureInvResValue: Float32Array<ArrayBuffer>;
    sharpnessId: import("../../index.js").ScopeId;
    colorLUTId: import("../../index.js").ScopeId;
    colorLUT2Id: import("../../index.js").ScopeId;
    colorLUTParams: Float32Array<ArrayBuffer>;
    colorLUTParamsId: import("../../index.js").ScopeId;
    colorEnhanceParamsId: import("../../index.js").ScopeId;
    colorEnhanceMidtonesId: import("../../index.js").ScopeId;
    composeTargetFlipYId: import("../../index.js").ScopeId;
    cameraParams: Float32Array<ArrayBuffer>;
    cameraParamsId: import("../../index.js").ScopeId;
    set debug(value: any);
    get debug(): any;
    /**
     * Whether the scene depth this frame renders is available to sample, which the depth debug mode
     * displays instead of producing a depth of its own - a debug mode never changes what is rendered.
     *
     * @type {boolean}
     */
    set sceneDepthAvailable(value: boolean);
    get sceneDepthAvailable(): boolean;
    /**
     * The debug mode the shader is built for. This is the requested mode, except that a request for the
     * depth with no depth to sample renders black instead.
     *
     * @type {string|null}
     * @private
     */
    private get _debugMode();
    set colorLUT(value: Texture);
    get colorLUT(): Texture;
    set colorLUT2(value: Texture);
    get colorLUT2(): Texture;
    _validateColorLUT(value: any, slotName: any): void;
    set bloomTexture(value: any);
    get bloomTexture(): any;
    set cocTexture(value: any);
    get cocTexture(): any;
    set ssaoTexture(value: any);
    get ssaoTexture(): any;
    set taaEnabled(value: boolean);
    get taaEnabled(): boolean;
    set gradingEnabled(value: boolean);
    get gradingEnabled(): boolean;
    set vignetteEnabled(value: boolean);
    get vignetteEnabled(): boolean;
    set fringingEnabled(value: boolean);
    get fringingEnabled(): boolean;
    set colorEnhanceEnabled(value: boolean);
    get colorEnhanceEnabled(): boolean;
    set toneMapping(value: number);
    get toneMapping(): number;
    set sharpness(value: number);
    get sharpness(): number;
    get isSharpnessEnabled(): boolean;
    set hdrScene(value: boolean);
    get hdrScene(): boolean;
}
import { RenderPassShaderQuad } from '../../scene/graphics/render-pass-shader-quad.js';
import type { Texture } from '../../platform/graphics/texture.js';
import { Color } from '../../core/math/color.js';
import type { CameraComponent } from '../../framework/components/camera/component.js';
import type { GraphicsDevice } from '../../platform/graphics/graphics-device.js';
