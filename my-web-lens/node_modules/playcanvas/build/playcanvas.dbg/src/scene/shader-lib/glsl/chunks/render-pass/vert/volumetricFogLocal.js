var volumetricFogLocal_default = (
  /* glsl */
  `
    attribute vec2 aPosition;

    // normalized device coordinates of the light volume bounds: xy = min, zw = max
    uniform vec4 uVolLightRect;

    varying vec2 uv0;

    void main(void)
    {
        vec2 ndc = mix(uVolLightRect.xy, uVolLightRect.zw, aPosition * 0.5 + 0.5);
        gl_Position = vec4(ndc, 0.0, 1.0);
        uv0 = getImageEffectUV(ndc * 0.5 + 0.5);
    }
`
);
export {
  volumetricFogLocal_default as default
};
