/**
 * Internal camera shader parameters, used to generate and use matching shaders.
 *
 * @ignore
 */
export class CameraShaderParams {
    /** @private */
    private _gammaCorrection;
    /** @private */
    private _toneMapping;
    /** @private */
    private _srgbRenderTarget;
    /** @private */
    private _ssaoEnabled;
    /** @private */
    private _fog;
    /** @private */
    private _sceneDepthMapLinear;
    /**
     * True when each depth in the linear scene depth map is stored as a float bit-packed into an
     * RGBA8 texel, the encoding the producer of the map falls back to when float textures cannot be
     * rendered to. Only meaningful when {@link CameraShaderParams#sceneDepthMapLinear} is set.
     *
     * @private
     */
    private _sceneDepthMapPacked;
    /**
     * True when the linear scene depth map holds a coverage weighted average of the reciprocals of the
     * depths, which a consumer inverts to recover the depth. This is how the scene pass accumulates a
     * depth the blended gaussian splats contribute to. A pixel nothing was rendered to holds the
     * reciprocal of the far clip the map was cleared to, and so reads back as the far clip itself. Only
     * meaningful when {@link CameraShaderParams#sceneDepthMapLinear} is set.
     *
     * @private
     */
    private _sceneDepthMapReciprocal;
    /**
     * The names of the scene textures the scene pass renders alongside the scene color, in the order
     * of the color attachments they are rendered to - the name at index i goes to the attachment at
     * index i + 1, as attachment 0 is the scene color itself. Empty when the scene pass renders the
     * scene color alone.
     *
     * The render pass is what owns this, as only the passes rendering to a render target the scene
     * textures are attached to may write them - a camera's pass rendering the UI to the output render
     * target must not. It is mirrored here because shader generation is given no more than the camera
     * shader params, so this is how a material learns that its shader has to write the additional
     * attachments, and how those attachments take part in the shader variant key.
     *
     * That makes the value transient: {@link RenderPassForward} assigns it and restores the previous
     * value around each layer step it renders, in the same way it overrides the gamma correction and
     * the tone mapping. Outside of those draws the camera reads as rendering no scene textures.
     *
     * @type {string[]}
     * @private
     */
    private _sceneTextures;
    /**
     * The hash of the rendering parameters, or undefined if the hash has not been computed yet.
     *
     * @type {number|undefined}
     * @private
     */
    private _hash;
    /**
     * Content of this class relevant to shader generation, which is supplied as defines for the
     * shader.
     *
     * @type {Map<string, string>}
     * @private
     */
    private _defines;
    _definesDirty: boolean;
    /**
     * The hash of the rendering parameters.
     *
     * @type {number}
     * @ignore
     */
    get hash(): number;
    get defines(): Map<string, string>;
    markDirty(): void;
    set fog(type: string);
    get fog(): string;
    set ssaoEnabled(value: boolean);
    get ssaoEnabled(): boolean;
    set gammaCorrection(value: number);
    get gammaCorrection(): number;
    _gammaCorrectionAssigned: boolean;
    set toneMapping(value: number);
    get toneMapping(): number;
    set srgbRenderTarget(value: boolean);
    get srgbRenderTarget(): boolean;
    set sceneDepthMapLinear(value: boolean);
    get sceneDepthMapLinear(): boolean;
    set sceneDepthMapPacked(value: boolean);
    get sceneDepthMapPacked(): boolean;
    set sceneDepthMapReciprocal(value: boolean);
    get sceneDepthMapReciprocal(): boolean;
    /**
     * Sets the names of the scene textures the scene pass renders alongside the scene color, for
     * example `['depth']`. Their order is the order of the color attachments they are rendered to,
     * so the name at index i is written to the attachment at index i + 1. Assign an empty array when
     * the scene pass renders the scene color alone. This is assigned by the render pass rendering
     * them, for the duration of its draws only - see the note on the backing field.
     *
     * Each name generates a pair of shader defines, following the same naming as the shader passes:
     * `'depth'` supplies `SCENE_TEXTURE_DEPTH`, which enables the write, and
     * `{SCENE_TEXTURE_DEPTH_SLOT}`, which the sceneTexturesPS chunk substitutes into the name of the
     * output it writes. A name can only contain letters, numbers and underscores, and start with a
     * letter.
     *
     * @type {string[]}
     */
    set sceneTextures(value: string[]);
    get sceneTextures(): string[];
    /**
     * Returns {@link GAMMA_SRGB} if the shader code needs to output gamma corrected color, otherwise
     * returns {@link GAMMA_NONE}.
     *
     * @type {number}
     * @ignore
     */
    get shaderOutputGamma(): number;
}
