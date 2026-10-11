declare const _default: "\n#ifdef PCOUTLINE_PASS\noutput.color = vec4f(gammaCorrectOutput(uniform.pcOutlineColor), output.color.a);\n#endif\n";
export default _default;
