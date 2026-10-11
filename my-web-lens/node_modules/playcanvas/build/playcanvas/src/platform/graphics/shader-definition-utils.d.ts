/**
 * A class providing utility functions for shader definition creation.
 *
 * @ignore
 */
export class ShaderDefinitionUtils {
    /**
     * Creates a shader definition.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {object} options - Object for passing optional arguments.
     * @param {string} [options.name] - A name of the shader.
     * @param {object} [options.attributes] - Attributes. Will be extracted from the vertexCode if
     * not provided.
     * @param {string} options.vertexCode - The vertex shader code.
     * @param {string} [options.fragmentCode] - The fragment shader code.
     * @param {string} [options.fragmentPreamble] - The preamble string for the fragment shader.
     * @param {string[]} [options.feedbackVaryings] - A list of shader output variable
     * names that will be captured when using transform feedback. This setting is only effective
     * if the useTransformFeedback property is enabled.
     * @param {number} [options.feedbackVaryingsMode] - Specifies how transform feedback varyings
     * are written into GPU buffers. Use {@link TRANSFORM_FEEDBACK_INTERLEAVED} to pack all captured
     * varyings into a single buffer, or {@link TRANSFORM_FEEDBACK_SEPARATE} to store each varying
     * in its own buffer. This setting is only effective when useTransformFeedback property is enabled.
     * Defaults to {@link TRANSFORM_FEEDBACK_INTERLEAVED}.
     * @param {boolean} [options.useTransformFeedback] - Whether to use transform feedback. Defaults
     * to false.
     * @param {Map<string, string>} [options.vertexIncludes] - A map containing key-value pairs of
     * include names and their content. These are used for resolving #include directives in the
     * vertex shader source.
     * @param {Map<string, string>} [options.vertexDefines] - A map containing key-value pairs of
     * define names and their values. These are used for resolving #ifdef style of directives in the
     * vertex code.
     * @param {Map<string, string>} [options.fragmentIncludes] - A map containing key-value pairs
     * of include names and their content. These are used for resolving #include directives in the
     * fragment shader source.
     * @param {Map<string, string>} [options.fragmentDefines] - A map containing key-value pairs of
     * define names and their values. These are used for resolving #ifdef style of directives in the
     * fragment code.
     * @param {string | string[]} [options.fragmentOutputTypes] - Fragment shader output types,
     * which default to vec4. Passing a string will set the output type for all color attachments.
     * Passing an array will set the output type for each color attachment.
     * @param {boolean} [options.useDualSourceBlending] - Whether the fragment shader outputs a
     * secondary color for dual-source blending. Defaults to false.
     * @returns {object} Returns the created shader definition.
     */
    static createDefinition(device: GraphicsDevice, options: {
        name?: string;
        attributes?: object;
        vertexCode: string;
        fragmentCode?: string;
        fragmentPreamble?: string;
        feedbackVaryings?: string[];
        feedbackVaryingsMode?: number;
        useTransformFeedback?: boolean;
        vertexIncludes?: Map<string, string>;
        vertexDefines?: Map<string, string>;
        fragmentIncludes?: Map<string, string>;
        fragmentDefines?: Map<string, string>;
        fragmentOutputTypes?: string | string[];
        useDualSourceBlending?: boolean;
    }): object;
    /**
     * Generates WGSL `enable` / `requires` directives based on device capabilities. They must come
     * before all global declarations in WGSL shaders.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {'vertex'|'fragment'|'compute'} shaderType - The type of shader.
     * @param {boolean} [useDualSourceBlending] - Whether to enable dual-source blending.
     * @returns {string} The WGSL enable directives code.
     * @ignore
     */
    static getWGSLEnables(device: GraphicsDevice, shaderType: "vertex" | "fragment" | "compute", useDualSourceBlending?: boolean): string;
    /**
     * @param {GraphicsDevice} device - The graphics device.
     * @param {Map<string, string>} [defines] - A map containing key-value pairs.
     * @returns {string} The shader code for the defines.
     * @ignore
     */
    static getDefinesCode(device: GraphicsDevice, defines?: Map<string, string>): string;
    static getShaderNameCode(name: any): string;
    static versionCode(device: any): "#version 450\n" | "#version 300 es\n";
    static precisionCode(device: any, forcePrecision: any): string;
    /**
     * Extract the attributes specified in a vertex shader.
     *
     * @param {string} vsCode - The vertex shader code.
     * @returns {Object<string, string>} The attribute name to semantic map.
     * @ignore
     */
    static collectAttributes(vsCode: string): {
        [x: string]: string;
    };
}
import type { GraphicsDevice } from './graphics-device.js';
