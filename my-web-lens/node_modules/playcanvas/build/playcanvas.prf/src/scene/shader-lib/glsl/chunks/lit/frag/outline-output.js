var outline_output_default = `
#ifdef PCOUTLINE_PASS
gl_FragColor.rgb = gammaCorrectOutput(pcOutlineColor);
#endif
`;
export {
	outline_output_default as default
};
