/**
 * @import { CameraComponent } from '../../framework/components/camera/component.js'
 * @import { Layer } from '../layer.js'
 * @import { RenderTarget } from '../../platform/graphics/render-target.js'
 * @import { WorldClusters } from '../lighting/world-clusters.js'
 */
/**
 * Represents a single layer rendered by a {@link RenderPassForward}: one layer (its opaque or
 * transparent sublayer) rendered with one camera to one render target.
 *
 * @ignore
 */
export class LayerRenderStep {
    /**
     * @param {CameraComponent} cameraComponent - The camera component used to render the layer.
     * @param {Layer} layer - The layer to render.
     * @param {boolean} transparent - True to render the transparent sublayer, opaque otherwise.
     * @param {RenderTarget|null} renderTarget - The render target to render to.
     */
    constructor(cameraComponent: CameraComponent, layer: Layer, transparent: boolean, renderTarget: RenderTarget | null);
    /** @type {CameraComponent|null} */
    cameraComponent: CameraComponent | null;
    /** @type {Layer|null} */
    layer: Layer | null;
    /** True if this uses the transparent sublayer, opaque otherwise. */
    transparent: boolean;
    /** @type {RenderTarget|null} */
    renderTarget: RenderTarget | null;
    /**
     * The world clusters to use for clustered lighting. Assigned later by the
     * {@link WorldClustersAllocator}, so it always starts as null.
     *
     * @type {WorldClusters|null}
     */
    lightClusters: WorldClusters | null;
    clearColor: boolean;
    clearDepth: boolean;
    clearStencil: boolean;
    firstCameraUse: boolean;
    lastCameraUse: boolean;
    setupClears(cameraComponent: any, layer: any): void;
}
import type { CameraComponent } from '../../framework/components/camera/component.js';
import type { Layer } from '../layer.js';
import type { RenderTarget } from '../../platform/graphics/render-target.js';
import type { WorldClusters } from '../lighting/world-clusters.js';
