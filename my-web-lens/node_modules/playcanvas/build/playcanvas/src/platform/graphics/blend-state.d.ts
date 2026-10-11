/**
 * BlendState is a descriptor that defines how output of fragment shader is written and blended
 * into render target. A blend state can be set on a material using {@link Material#blendState},
 * or in some cases on the graphics device using {@link GraphicsDevice#setBlendState}.
 *
 * For the best performance, do not modify blend state after it has been created, but create
 * multiple blend states and assign them to the material or graphics device as needed.
 *
 * By default the blend state applies to all color attachments of the render target. When multiple
 * color attachments are used, individual attachments can be given an independent blend state using
 * {@link BlendState#setAttachment}. This requires {@link GraphicsDevice#supportsIndependentBlending} -
 * on devices without support, the state of the attachment 0 is used for all attachments.
 *
 * @category Graphics
 */
export class BlendState {
    /**
     * A blend state that has blending disabled and writes to all color channels.
     *
     * @type {BlendState}
     * @readonly
     */
    static readonly NOBLEND: BlendState;
    /**
     * @deprecated Use BlendState.NOBLEND instead.
     * @ignore
     */
    static get DEFAULT(): BlendState;
    /**
     * A blend state that does not write to color channels.
     *
     * @type {BlendState}
     * @readonly
     */
    static readonly NOWRITE: BlendState;
    /**
     * A blend state that does simple translucency using alpha channel.
     *
     * @type {BlendState}
     * @readonly
     */
    static readonly ALPHABLEND: BlendState;
    /**
     * A blend state that does simple additive blending.
     *
     * @type {BlendState}
     * @readonly
     */
    static readonly ADDBLEND: BlendState;
    /**
     * Create a new BlendState instance.
     *
     * All factor parameters can take the following values:
     *
     * - {@link BLENDMODE_ZERO}
     * - {@link BLENDMODE_ONE}
     * - {@link BLENDMODE_SRC_COLOR}
     * - {@link BLENDMODE_ONE_MINUS_SRC_COLOR}
     * - {@link BLENDMODE_DST_COLOR}
     * - {@link BLENDMODE_ONE_MINUS_DST_COLOR}
     * - {@link BLENDMODE_SRC_ALPHA}
     * - {@link BLENDMODE_SRC_ALPHA_SATURATE}
     * - {@link BLENDMODE_ONE_MINUS_SRC_ALPHA}
     * - {@link BLENDMODE_DST_ALPHA}
     * - {@link BLENDMODE_ONE_MINUS_DST_ALPHA}
     * - {@link BLENDMODE_CONSTANT}
     * - {@link BLENDMODE_ONE_MINUS_CONSTANT}
     * - {@link BLENDMODE_SRC1_COLOR}
     * - {@link BLENDMODE_ONE_MINUS_SRC1_COLOR}
     * - {@link BLENDMODE_SRC1_ALPHA}
     * - {@link BLENDMODE_ONE_MINUS_SRC1_ALPHA}
     *
     * All op parameters can take the following values:
     *
     * - {@link BLENDEQUATION_ADD}
     * - {@link BLENDEQUATION_SUBTRACT}
     * - {@link BLENDEQUATION_REVERSE_SUBTRACT}
     * - {@link BLENDEQUATION_MIN}
     * - {@link BLENDEQUATION_MAX}
     *
     * @param {boolean} [blend] - Enables or disables blending. Defaults to false.
     * @param {number} [colorOp] - Configures color blending operation. Defaults to
     * {@link BLENDEQUATION_ADD}.
     * @param {number} [colorSrcFactor] - Configures source color blending factor. Defaults to
     * {@link BLENDMODE_ONE}.
     * @param {number} [colorDstFactor] - Configures destination color blending factor. Defaults to
     * {@link BLENDMODE_ZERO}.
     * @param {number} [alphaOp] - Configures alpha blending operation. Defaults to
     * {@link BLENDEQUATION_ADD}.
     * @param {number} [alphaSrcFactor] - Configures source alpha blending factor. Defaults to
     * {@link BLENDMODE_ONE}.
     * @param {number} [alphaDstFactor] - Configures destination alpha blending factor. Defaults to
     * {@link BLENDMODE_ZERO}.
     * @param {boolean} [redWrite] - True to enable writing of the red channel and false otherwise.
     * Defaults to true.
     * @param {boolean} [greenWrite] - True to enable writing of the green channel and false
     * otherwise. Defaults to true.
     * @param {boolean} [blueWrite] - True to enable writing of the blue channel and false otherwise.
     * Defaults to true.
     * @param {boolean} [alphaWrite] - True to enable writing of the alpha channel and false
     * otherwise. Defaults to true.
     */
    constructor(blend?: boolean, colorOp?: number, colorSrcFactor?: number, colorDstFactor?: number, alphaOp?: number, alphaSrcFactor?: number, alphaDstFactor?: number, redWrite?: boolean, greenWrite?: boolean, blueWrite?: boolean, alphaWrite?: boolean);
    /**
     * Bit field representing the blend state for attachment 0. Bit 31 additionally flags the
     * presence of per-attachment overrides.
     *
     * @private
     */
    private attachment0;
    /**
     * Per-attachment blend states, indexed directly by the attachment index. Slot 0 is unused and
     * always zero, as attachment 0 is stored in `attachment0`. A slot value of zero means the
     * attachment follows attachment 0. Allocated lazily, only when an override is set.
     *
     * @type {Int32Array|null}
     * @private
     */
    private _attachments;
    /**
     * Interned key of a state with per-attachment overrides. Unused by states without overrides,
     * which use attachment0 as their key directly.
     *
     * @private
     */
    private _key;
    /**
     * True when `_key` needs re-evaluating. Set by all attachment 0 mutations, and only relevant
     * when per-attachment overrides are present.
     *
     * @private
     */
    private _keyDirty;
    /**
     * Sets whether blending is enabled.
     *
     * @type {boolean}
     */
    set blend(value: boolean);
    /**
     * Gets whether blending is enabled.
     *
     * @type {boolean}
     */
    get blend(): boolean;
    setColorBlend(op: any, srcFactor: any, dstFactor: any): void;
    setAlphaBlend(op: any, srcFactor: any, dstFactor: any): void;
    setColorWrite(redWrite: any, greenWrite: any, blueWrite: any, alphaWrite: any): void;
    set redWrite(value: boolean);
    get redWrite(): boolean;
    set greenWrite(value: boolean);
    get greenWrite(): boolean;
    set blueWrite(value: boolean);
    get blueWrite(): boolean;
    set alphaWrite(value: boolean);
    get alphaWrite(): boolean;
    get colorOp(): number;
    get colorSrcFactor(): number;
    get colorDstFactor(): number;
    get alphaOp(): number;
    get alphaSrcFactor(): number;
    get alphaDstFactor(): number;
    get allWrite(): number;
    /**
     * Gets whether any color attachment has been given an independent blend state using
     * {@link BlendState#setAttachment}.
     *
     * @type {boolean}
     */
    get hasAttachmentOverrides(): boolean;
    /**
     * Assigns an independent blend state to the specified color attachment. The blend state of the
     * supplied source is copied, and so subsequent changes to either the source or to attachment 0 do
     * not affect it. An attachment which has not been assigned an independent state instead follows
     * attachment 0.
     *
     * Note that this requires {@link GraphicsDevice#supportsIndependentBlending} - on devices
     * without support, the state of attachment 0 is used for all attachments.
     *
     * @param {number} index - The index of the color attachment, in 1 to 7 range. Attachment 0 is
     * configured using the other functions and properties of this class.
     * @param {BlendState|null} src - The blend state to copy from, or null to make the attachment
     * follow attachment 0 again.
     * @example
     * // attachment 1 keeps the blending of attachment 0, but does not write any channels
     * const state = material.blendState.clone();
     * const noWrite = state.clone();
     * noWrite.setColorWrite(false, false, false, false);
     * state.setAttachment(1, noWrite);
     */
    setAttachment(index: number, src: BlendState | null): void;
    /**
     * Removes the independent blend state of the specified color attachment, making it follow
     * attachment 0 again.
     *
     * @param {number} index - The index of the color attachment, in 1 to 7 range.
     */
    clearAttachment(index: number): void;
    /**
     * Stores the blend state of the specified color attachment in the supplied blend state. When
     * the attachment does not have an independent blend state, the state of attachment 0 is stored.
     *
     * @param {number} index - The index of the color attachment, in 0 to 7 range.
     * @param {BlendState} dst - The blend state to store the result in. This avoids allocations, as
     * a single instance can be reused.
     * @returns {BlendState} The supplied dst, for chaining.
     */
    getAttachment(index: number, dst: BlendState): BlendState;
    /**
     * Refreshes the overrides flag and the interned key after the per-attachment states have changed.
     *
     * @private
     */
    private _attachmentsUpdated;
    /**
     * Assigns a unique key to the combination of attachment 0 and the per-attachment states.
     *
     * @private
     */
    private _evalKey;
    /**
     * True if any blend factor uses the secondary fragment output.
     *
     * @type {boolean}
     * @ignore
     */
    get usesDualSourceBlending(): boolean;
    /**
     * Copies the contents of a source blend state to this blend state.
     *
     * @param {BlendState} rhs - A blend state to copy from.
     * @returns {BlendState} Self for chaining.
     */
    copy(rhs: BlendState): BlendState;
    /**
     * Returns an identical copy of the specified blend state.
     *
     * @returns {this} The result of the cloning.
     */
    clone(): this;
    get key(): number;
    /**
     * Reports whether two BlendStates are equal.
     *
     * @param {BlendState} rhs - The blend state to compare to.
     * @returns {boolean} True if the blend states are equal and false otherwise.
     */
    equals(rhs: BlendState): boolean;
}
