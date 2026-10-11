const KHR_materials_ior = {
	apply(data, material, textures) {
		if (data.hasOwnProperty("ior")) {
			material.refractionIndex = 1 / data.ior;
		}
	}
};
export {
	KHR_materials_ior
};
