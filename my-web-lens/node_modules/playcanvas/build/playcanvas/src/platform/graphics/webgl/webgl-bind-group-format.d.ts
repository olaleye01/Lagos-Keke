/**
 * A WebGL implementation of the BindGroupFormat.
 *
 * Uniform buffer binding points on WebGL2 are derived directly from the bind group index (see
 * {@link WebglGraphicsDevice#setBindGroup} and {@link WebglShader} uniform block linking), so the
 * format itself needs no GPU-side resources.
 *
 * @ignore
 */
export class WebglBindGroupFormat {
    destroy(): void;
}
