var outline_output_default = (
  /* glsl */
  `
#ifdef PCOUTLINE_PASS
gl_FragColor.rgb = gammaCorrectOutput(pcOutlineColor);
#endif
`
);
export {
  outline_output_default as default
};
