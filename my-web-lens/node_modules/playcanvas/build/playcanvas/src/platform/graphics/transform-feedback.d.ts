/**
 * Gives a vertex buffer its role in a {@link TransformFeedback}. At least one of the two properties
 * must be specified.
 */
export type TransformFeedbackStream = {
    /**
     * - A buffer read by the shader as a vertex stream.
     */
    input?: VertexBuffer;
    /**
     * - A buffer written by transform feedback.
     */
    output?: VertexBuffer;
};
/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */
/**
 * Gives a vertex buffer its role in a {@link TransformFeedback}. At least one of the two properties
 * must be specified.
 *
 * @typedef {object} TransformFeedbackStream
 * @property {VertexBuffer} [input] - A buffer read by the shader as a vertex stream.
 * @property {VertexBuffer} [output] - A buffer written by transform feedback.
 */
/**
 * This object allows you to configure and use the transform feedback feature (WebGL2 only). How to
 * use:
 *
 * 1. First, check that you're on WebGL2, by looking at the `app.graphicsDevice.isWebGL2`` value.
 * 2. Define the outputs in your vertex shader. The syntax is `out vec3 out_vertex_position`,
 * note that there must be out_ in the name. You can then simply assign values to these outputs in
 * VS. The order and size of shader outputs must match the output buffer layout.
 * 3. Create the shader using `TransformFeedback.createShader(device, vsCode, yourShaderName)`.
 * 4. Create/acquire the input vertex buffer. Can be any VertexBuffer, either manually created, or
 * from a Mesh.
 * 5. Create the TransformFeedback object: `const tf = new TransformFeedback(inputBuffer)`. This
 * object will internally create an output buffer.
 * 6. Run the shader: `tf.process(shader)`. Shader will take the input buffer, process it and write
 * to the output buffer, then the input/output buffers will be automatically swapped, so you'll
 * immediately see the result.
 *
 * ```javascript
 * // *** shader asset ***
 * attribute vec3 vertex_position;
 * attribute vec3 vertex_normal;
 * attribute vec2 vertex_texCoord0;
 * out vec3 out_vertex_position;
 * out vec3 out_vertex_normal;
 * out vec2 out_vertex_texCoord0;
 * void main(void) {
 *     // read position and normal, write new position (push away)
 *     out_vertex_position = vertex_position + vertex_normal * 0.01;
 *     // pass other attributes unchanged
 *     out_vertex_normal = vertex_normal;
 *     out_vertex_texCoord0 = vertex_texCoord0;
 * }
 * ```
 *
 * ```javascript
 * // *** script asset ***
 * var TransformExample = createScript('transformExample');
 *
 * // attribute that references shader asset and material
 * TransformExample.attributes.add('shaderCode', { type: 'asset', assetType: 'shader' });
 * TransformExample.attributes.add('material', { type: 'asset', assetType: 'material' });
 *
 * TransformExample.prototype.initialize = function() {
 *     const device = this.app.graphicsDevice;
 *     const mesh = Mesh.fromGeometry(app.graphicsDevice, new TorusGeometry({ tubeRadius: 0.01, ringRadius: 3 }));
 *     const meshInstance = new MeshInstance(mesh, this.material.resource);
 *     const entity = new Entity();
 *     entity.addComponent('render', {
 *         type: 'asset',
 *         meshInstances: [meshInstance]
 *     });
 *     app.root.addChild(entity);
 *
 *     // if webgl2 is not supported, transform-feedback is not available
 *     if (!device.isWebGL2) return;
 *     const inputBuffer = mesh.vertexBuffer;
 *     this.tf = new TransformFeedback(inputBuffer);
 *     this.shader = TransformFeedback.createShader(device, this.shaderCode.resource, "tfMoveUp");
 * };
 *
 * TransformExample.prototype.update = function(dt) {
 *     if (!this.app.graphicsDevice.isWebGL2) return;
 *     this.tf.process(this.shader);
 * };
 * ```
 *
 * @category Graphics
 */
export class TransformFeedback {
    /**
     * Creates a transform feedback ready vertex shader from code.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used by the renderer.
     * @param {string} vertexCode - Vertex shader code. Should contain output variables starting with "out_" or feedbackVaryings.
     * @param {string} name - Unique name for caching the shader.
     * @param {string[]} [feedbackVaryings] - A list of shader output variable names that will be captured.
     * @param {number} [feedbackVaryingsMode] - Specifies how transform feedback varyings
     * are written into GPU buffers. Use {@link TRANSFORM_FEEDBACK_INTERLEAVED} to pack all captured
     * varyings into a single buffer, or {@link TRANSFORM_FEEDBACK_SEPARATE} to store each varying
     * in its own buffer. This setting is only effective when useTransformFeedback property is enabled.
     * Defaults to {@link TRANSFORM_FEEDBACK_INTERLEAVED}.
     * @returns {Shader} A shader to use in the process() function.
     */
    static createShader(graphicsDevice: GraphicsDevice, vertexCode: string, name: string, feedbackVaryings?: string[], feedbackVaryingsMode?: number): Shader;
    /**
     * Create a new TransformFeedback instance.
     *
     * @param {VertexBuffer|TransformFeedbackStream[]} inputBuffer - The input vertex buffer, or an
     * array of buffer descriptors when more than one buffer takes part. Each descriptor gives a
     * buffer one of three roles:
     *
     * - `{ input, output }` - read by the shader and written by transform feedback. The pair is
     * swapped after each step, so `input` always holds the freshest data.
     * - `{ input }` - read by the shader only. Suitable for per-item data which never changes, and
     * which would otherwise have to be copied through transform feedback every step.
     * - `{ output }` - written by transform feedback only. Suitable for data which only a later
     * pass consumes, such as a stream feeding instanced rendering.
     *
     * Descriptors with an `output` are assigned transform feedback buffer indices in the order they
     * appear, skipping those without one, and so must match the order of the captured varyings.
     * @param {VertexBuffer} [outputBuffer] - The optional output buffer, when a single input buffer
     * is specified. If omitted, a buffer with parameters matching the input buffer is created.
     * @param {number} [usage] - The optional usage type of the created output vertex buffer. Can be:
     *
     * - {@link BUFFER_STATIC}
     * - {@link BUFFER_DYNAMIC}
     * - {@link BUFFER_STREAM}
     * - {@link BUFFER_GPUDYNAMIC}
     *
     * Defaults to {@link BUFFER_GPUDYNAMIC} (which is recommended for continuous update).
     * @example
     * // a simulation writing its state back to itself, plus a stream consumed by instancing
     * const tf = new TransformFeedback([
     *     { input: positions, output: positionsOut },  // read and written, swapped each step
     *     { input: constants },                        // read only, never modified
     *     { output: instances }                        // written only, for the render pass
     * ]);
     */
    constructor(inputBuffer: VertexBuffer | TransformFeedbackStream[], outputBuffer?: VertexBuffer, usage?: number);
    device: any;
    _inputBuffers: (VertexBuffer | TransformFeedbackStream[])[];
    _outputBuffers: any[];
    _swapPairs: any[];
    _ownedOutputBuffers: any[];
    /**
     * Creates an output buffer matching the supplied input buffer.
     *
     * @param {VertexBuffer} inputBuffer - The buffer to match.
     * @param {number} usage - The usage type of the created buffer.
     * @returns {VertexBuffer} The created buffer.
     * @private
     */
    private _createOutputBuffer;
    /**
     * Destroys the transform feedback helper object.
     */
    destroy(): void;
    /**
     * Runs the specified shader on the input buffer, writes results into the new buffer, then
     * optionally swaps input/output.
     *
     * @param {Shader} shader - A vertex shader to run. Should be created with
     * {@link TransformFeedback.createShader}.
     * @param {boolean} [swap] - Swap input/output buffer data. Useful for continuous buffer
     * processing. Default is true.
     */
    process(shader: Shader, swap?: boolean): void;
    /**
     * The current input buffer. When multiple input buffers are used, this is the first one - see
     * {@link TransformFeedback#inputBuffers}.
     *
     * @type {VertexBuffer}
     */
    get inputBuffer(): VertexBuffer;
    /**
     * The current output buffer. When multiple output buffers are used, this is the first one - see
     * {@link TransformFeedback#outputBuffers}.
     *
     * @type {VertexBuffer}
     */
    get outputBuffer(): VertexBuffer;
    /**
     * The buffers read by the shader, in the order they were supplied.
     *
     * @type {VertexBuffer[]}
     */
    get inputBuffers(): VertexBuffer[];
    /**
     * The buffers written by transform feedback, in the order of the captured varyings.
     *
     * @type {VertexBuffer[]}
     */
    get outputBuffers(): VertexBuffer[];
}
import { VertexBuffer } from './vertex-buffer.js';
import { Shader } from './shader.js';
import type { GraphicsDevice } from './graphics-device.js';
