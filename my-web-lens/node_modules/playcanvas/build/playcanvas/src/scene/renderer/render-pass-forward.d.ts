/**
 * @import { CameraComponent } from '../../framework/components/camera/component.js'
 * @import { Camera } from '../camera.js'
 * @import { LayerComposition } from '../composition/layer-composition.js'
 * @import { Layer } from '../layer.js'
 * @import { Renderer } from './renderer.js'
 * @import { Scene } from '../scene.js'
 */
/**
 * A render pass used render a set of layers using a camera.
 *
 * @ignore
 */
export class RenderPassForward extends RenderPass {
    constructor(device: any, layerComposition: any, scene: any, renderer: any);
    /**
     * @type {LayerComposition}
     */
    layerComposition: LayerComposition;
    /**
     * @type {Scene}
     */
    scene: Scene;
    /**
     * @type {Renderer}
     */
    renderer: Renderer;
    /**
     * @type {LayerRenderStep[]}
     */
    layerRenderSteps: LayerRenderStep[];
    /**
     * The gamma correction setting for the render pass. If not set, the setting from the camera
     * is used. This allows render passes to override the camera's gamma correction during the
     * render pass.
     *
     * For HDR pipelines, scene render passes typically set this to {@link GAMMA_NONE} to output
     * linear values to an HDR render target, while subsequent passes (like UI) leave it undefined
     * to use the camera's default {@link GAMMA_SRGB} for correct display output.
     *
     * Can be:
     * - {@link GAMMA_NONE}
     * - {@link GAMMA_SRGB}
     * - `undefined` (uses camera setting)
     *
     * @type {number|undefined}
     */
    gammaCorrection: number | undefined;
    /**
     * The tone mapping setting for the render pass. If not set, setting from the camera is used.
     *
     * @type {number|undefined}
     */
    toneMapping: number | undefined;
    /**
     * The names of the scene textures this pass renders alongside the scene color, in the order of
     * the color attachments they are rendered to. If not set, setting from the camera is used. Only
     * the passes rendering to a render target the scene textures are attached to set this, so that
     * the camera's other passes, for example the one rendering the UI to the output render target,
     * do not write them.
     *
     * @type {string[]|undefined}
     */
    sceneTextures: string[] | undefined;
    /**
     * The camera whose scene textures this pass publishes when it finishes, making them available to
     * the passes which consume them, or null if it publishes none. Only the last pass rendering to the
     * render target they are attached to sets this - publishing earlier would expose an attachment of a
     * render target the remaining passes still render into, and the materials they render could then
     * sample it, which is not allowed.
     *
     * @type {Camera|null}
     */
    sceneTexturesCamera: Camera | null;
    /**
     * True if this pass clears the uniforms the scene textures are published to before it renders. Only
     * the first pass rendering to the render target they are attached to sets this, and only when no
     * depth prepass has published to those uniforms already - it is what stops a material from sampling
     * a scene texture which nothing has produced yet.
     *
     * @type {boolean}
     */
    clearSceneTextures: boolean;
    /**
     * If true, do not clear the depth buffer before rendering, as it was already primed by a depth
     * pre-pass.
     */
    noDepthClear: boolean;
    get rendersAnything(): boolean;
    addLayerRenderStep(layerRenderStep: any): void;
    /**
     * Adds a layer to be rendered by this render pass.
     *
     * @param {CameraComponent} cameraComponent - The camera component that is used to render the
     * layers.
     * @param {Layer} layer - The layer to be added.
     * @param {boolean} transparent - True if the layer is transparent.
     * @param {boolean} autoClears - True if the render target should be cleared based on the camera
     * and layer clear flags. Defaults to true.
     */
    addLayer(cameraComponent: CameraComponent, layer: Layer, transparent: boolean, autoClears?: boolean): void;
    updateDirectionalShadows(): void;
    updateCameraBeforePasses(): void;
    updateClears(): void;
    /**
     * @param {LayerRenderStep} step - The layer render step.
     * @param {boolean} firstStep - True if this is the first render step in the render pass.
     */
    renderLayerRenderStep(step: LayerRenderStep, firstStep: boolean): void;
    log(device: any, index: any): void;
}
import { RenderPass } from '../../platform/graphics/render-pass.js';
import type { LayerComposition } from '../composition/layer-composition.js';
import type { Scene } from '../scene.js';
import type { Renderer } from './renderer.js';
import { LayerRenderStep } from './layer-render-step.js';
import type { Camera } from '../camera.js';
import type { CameraComponent } from '../../framework/components/camera/component.js';
import type { Layer } from '../layer.js';
