/**
 * @import { GraphicsDevice } from '../graphics-device.js'
 * @import { Shader } from '../shader.js'
 * @import { ShaderProcessorOptions } from '../shader-processor-options.js'
 * @import { UniformBufferFormat } from '../uniform-buffer-format.js'
 * @import { UniformLine } from '../shader-processor-glsl.js'
 */
/**
 * A WebGL2-specific GLSL shader processor. Unlike the base {@link ShaderProcessorGLSL#run} - which
 * targets the WebGPU transpile path and emits Vulkan-flavored GLSL (separate texture/sampler,
 * `layout(set=, binding=)`, explicit varying locations) - this performs limited-scope processing:
 * it extracts only the standalone view-level uniform declarations and replaces them with a single
 * std140 `ub_view` block (valid GLSL ES 3.00). Attributes, varyings, outputs, textures and all
 * non-view (mesh / material / custom) uniforms are left untouched - they are handled by the gles3
 * compatibility macros and the per-uniform commit path.
 *
 * @ignore
 */
export class WebglShaderProcessorGLSL extends ShaderProcessorGLSL {
    /**
     * @param {GraphicsDevice} device - The graphics device.
     * @param {object} shaderDefinition - The shader definition.
     * @param {Shader} shader - The shader.
     * @returns {{ vshader: string, fshader: string }} The processed shader sources.
     */
    static run(device: GraphicsDevice, shaderDefinition: object, shader: Shader): {
        vshader: string;
        fshader: string;
    };
    /**
     * Generate the uniform code for a WebGL2 shader: a single std140 view uniform block plus all
     * non-view uniforms re-emitted as individual uniforms (which keep their per-uniform commit path).
     *
     * @param {Array<UniformLine>} uniforms - The parsed uniform lines.
     * @param {ShaderProcessorOptions} processingOptions - The shader processing options.
     * @returns {string} The generated GLSL.
     */
    static processUniformsGL2(uniforms: Array<UniformLine>, processingOptions: ShaderProcessorOptions): string;
    /**
     * Generate a WebGL2 std140 uniform block declaration. Unlike the base
     * {@link ShaderProcessorGLSL#getUniformShaderDeclaration} it emits no `set` / `binding` layout
     * qualifiers - the block is linked to its binding point at runtime by WebglShader via
     * `gl.uniformBlockBinding`.
     *
     * @param {UniformBufferFormat} format - The uniform buffer format.
     * @param {number} bindGroup - The bind group index, used to name the block `ub_<bindGroupName>`.
     * @returns {string} The block declaration.
     */
    static getUniformShaderDeclarationGL2(format: UniformBufferFormat, bindGroup: number): string;
}
import { ShaderProcessorGLSL } from '../shader-processor-glsl.js';
import type { GraphicsDevice } from '../graphics-device.js';
import type { Shader } from '../shader.js';
import type { UniformLine } from '../shader-processor-glsl.js';
import type { ShaderProcessorOptions } from '../shader-processor-options.js';
import type { UniformBufferFormat } from '../uniform-buffer-format.js';
