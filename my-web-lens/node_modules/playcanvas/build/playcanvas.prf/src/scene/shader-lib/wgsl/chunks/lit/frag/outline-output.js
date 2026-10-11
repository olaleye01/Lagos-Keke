var outline_output_default = `
#ifdef PCOUTLINE_PASS
output.color = vec4f(gammaCorrectOutput(uniform.pcOutlineColor), output.color.a);
#endif
`;
export {
	outline_output_default as default
};
