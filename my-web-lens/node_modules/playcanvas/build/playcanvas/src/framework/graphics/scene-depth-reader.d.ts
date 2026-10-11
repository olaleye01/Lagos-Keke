/**
 * Reads the scene depth of a camera back to the CPU.
 *
 * A sample is the distance from the camera to the surface at that point, in world units, measured
 * along the camera's view direction.
 *
 * Reads are asynchronous and land a frame or two later. Any number of them may be in flight at once, so
 * a read can be issued every frame without waiting for the previous one to finish.
 *
 * Note that something has to be rendering the depth for there to be anything to read: an effect which
 * consumes it, or {@link CameraComponent#requestSceneDepthMap}.
 *
 * ```javascript
 * const reader = new SceneDepthReader(camera.camera);
 * const rect = new Vec4(0.45, 0.45, 0.1, 0.1);
 *
 * app.on('update', () => {
 *     reader.read(rect, 8, 8)?.then((samples) => {
 *         const hit = samples.filter(Number.isFinite);
 *         console.log(hit.length ? Math.min(...hit) : 'nothing in view');
 *     });
 * });
 * ```
 *
 * @category Graphics
 * @alpha
 */
export class SceneDepthReader {
    /**
     * @param {CameraComponent} camera - The camera whose depth is read.
     */
    constructor(camera: CameraComponent);
    /**
     * The camera whose depth is read.
     *
     * @type {CameraComponent}
     * @private
     */
    private camera;
    /**
     * Reads requested this frame, rendered and handed to the readback when the camera has finished.
     *
     * @type {object[]}
     * @private
     */
    private _requests;
    /**
     * Readback buffers not currently in flight, keyed by their byte length. Each entry holds the bytes
     * and a view over them, so a read allocates neither.
     *
     * @type {Map<number, object[]>}
     * @private
     */
    private _buffers;
    /**
     * Whether the camera rendered a depth the last time it finished a frame. Assumed true until then,
     * so that a read issued before the first frame is not turned away.
     *
     * @type {boolean}
     * @private
     */
    private _depthRendered;
    /**
     * False once this reader, the camera it reads or the device has gone, after which nothing further
     * is rendered for it and a read in flight has nothing meaningful left to report.
     *
     * @type {boolean}
     * @private
     */
    private _valid;
    /** @private */
    private device;
    /** @private */
    private pass;
    /**
     * Sized to the largest read so far, and never shrunk.
     *
     * @private
     */
    private renderTarget;
    /** @private */
    private viewport;
    /** @private */
    private _shaderKey;
    /** @private */
    private _onPostRender;
    /** @private */
    private _onDeviceDestroy;
    /** @private */
    private _onCameraRemove;
    /** @private */
    private rectId;
    /** @private */
    private rectValue;
    /** @private */
    private gridId;
    /** @private */
    private gridValue;
    /** @private */
    private farId;
    /** @private */
    private emptyId;
    /** @private */
    private depthMapId;
    /** @private */
    private cameraParamsId;
    /** @private */
    private cameraParams;
    /**
     * Requests the depth of a region of the view, as `width * height` samples in row major order. The
     * region is point sampled rather than averaged - one sample per cell, taken at its centre - so
     * asking for more samples than the region resolves to repeats them.
     *
     * Samples where nothing was rendered read as `Infinity`, as do the few which land within a hair of
     * the far clip, that being the depth an empty pixel reports.
     *
     * Note that on a device which stores the scene depth at a lower precision - see
     * {@link GSplatParams#sceneDepthWrite} - a far clip beyond about 16384 leaves an empty pixel
     * reporting a large distance rather than `Infinity`, as the two stop being far enough apart to
     * tell one from the other.
     *
     * @param {Vec4} rect - The region of the view to sample, normalized, with its origin in the bottom
     * left as {@link CameraComponent#rect}.
     * @param {number} width - The number of samples across the region. Not pixels.
     * @param {number} height - The number of samples down the region.
     * @param {Float32Array} [target] - An array to fill, at least `width * height` long. One is
     * allocated when not given. It is filled when the returned promise resolves, so an array must not
     * be shared between reads which overlap in time.
     * @returns {Promise<Float32Array>|null} The samples, in world units, or null when the camera is
     * disabled or is not rendering a scene depth, leaving nothing to read.
     */
    read(rect: Vec4, width: number, height: number, target?: Float32Array): Promise<Float32Array> | null;
    /**
     * Renders and reads back everything requested this frame.
     *
     * @private
     */
    private _process;
    /**
     * Renders one request and starts its readback.
     *
     * @param {object} request - The request.
     * @private
     */
    private _readRequest;
    /**
     * Builds the shader, or rebuilds it when the encoding of the depth this camera renders has changed.
     *
     * @private
     */
    private _updateShader;
    /**
     * Grows the target to hold the requested number of samples. It is never shrunk, so a single large
     * read does not cost every following one an allocation.
     *
     * @param {number} width - Samples across.
     * @param {number} height - Samples down.
     * @private
     */
    private _updateRenderTarget;
    /** @private */
    private _destroyRenderTarget;
    /**
     * @param {number} byteLength - Bytes needed.
     * @returns {object} A buffer and a view over it.
     * @private
     */
    private _borrowBuffer;
    /**
     * @param {object} buffer - A buffer no longer in flight.
     * @private
     */
    private _returnBuffer;
    /**
     * Marks the reader as having nothing left to read, and settles what is queued. Called when the
     * device is destroyed, when the camera component is removed, and when the reader itself is
     * destroyed - each of which means no frame will ever service a read again.
     *
     * @private
     */
    private _invalidate;
    /**
     * Reports every queued read as empty, for the cases where the frame which would have serviced them
     * is never going to arrive.
     *
     * @private
     */
    private _settleRequests;
    /**
     * Frees the resources the reader owns and stops reading for this camera. Reads which have not been
     * rendered yet report their region as empty, and one already in flight does the same once it
     * completes, rather than writing samples read through resources this has let go of.
     */
    destroy(): void;
}
import { Vec4 } from '../../core/math/vec4.js';
import type { CameraComponent } from '../components/camera/component.js';
