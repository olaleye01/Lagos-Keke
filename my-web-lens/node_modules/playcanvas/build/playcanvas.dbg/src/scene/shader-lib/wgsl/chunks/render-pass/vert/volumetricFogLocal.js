var volumetricFogLocal_default = (
  /* wgsl */
  `
    attribute aPosition: vec2f;

    // normalized device coordinates of the light volume bounds: xy = min, zw = max
    uniform uVolLightRect: vec4f;

    varying uv0: vec2f;

    @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        let ndc: vec2f = mix(uniform.uVolLightRect.xy, uniform.uVolLightRect.zw, input.aPosition * 0.5 + 0.5);
        output.position = vec4f(ndc, 0.0, 1.0);
        output.uv0 = getImageEffectUV(ndc * 0.5 + 0.5);
        return output;
    }
`
);
export {
  volumetricFogLocal_default as default
};
