/**
 * Returns a blend state matching the supplied one, but with the color writes to all attachments other
 * than the first disabled. Used when rendering to a render target with more color attachments than
 * the fragment shader writes - both WebGL2 and WebGPU require an attachment the shader does not write
 * to have its writes disabled, otherwise the draw is invalid.
 *
 * Note that masking the writes off requires {@link GraphicsDevice#supportsIndependentBlending}, as
 * without it the state of the attachment 0 applies to all attachments and the mask has no effect.
 *
 * Note also that a dual-source blend state cannot be used with multiple color attachments at all,
 * and masking does not change that - dual-source blending requires exactly one attachment, so a
 * material using it is incompatible with a render target carrying additional attachments.
 *
 * @param {BlendState} blendState - The blend state of the render, describing attachment 0.
 * @param {number} attachmentCount - The number of color attachments of the render target.
 * @returns {BlendState} The blend state to use.
 * @ignore
 */
export function getSingleAttachmentBlendState(blendState: BlendState, attachmentCount: number): BlendState;
import { BlendState } from './blend-state.js';
