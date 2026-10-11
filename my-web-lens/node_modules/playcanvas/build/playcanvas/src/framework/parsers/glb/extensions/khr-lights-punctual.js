import { Color } from "../../../../core/math/color.js";
import { math } from "../../../../core/math/math.js";
import { LIGHTFALLOFF_INVERSESQUARED } from "../../../../scene/constants.js";
import { Light, lightTypes } from "../../../../scene/light.js";
import { Entity } from "../../../entity.js";
const createLight = (gltfLight, node, app) => {
	const lightProps = {
		enabled: false,
		type: gltfLight.type === "point" ? "omni" : gltfLight.type,
		color: gltfLight.hasOwnProperty("color") ? new Color(gltfLight.color) : Color.WHITE,
		// when range is not defined, infinity should be used - but that causes infinity in bounds calculations
		range: gltfLight.hasOwnProperty("range") ? gltfLight.range : 9999,
		falloffMode: LIGHTFALLOFF_INVERSESQUARED,
		// TODO: (engine issue #3252) Set intensity to match glTF specification, which uses physically based values:
		// - Omni and spot lights use luminous intensity in candela (lm/sr)
		// - Directional lights use illuminance in lux (lm/m2).
		// Current implementation: clamps specified intensity to 0..2 range
		intensity: gltfLight.hasOwnProperty("intensity") ? math.clamp(gltfLight.intensity, 0, 2) : 1
	};
	if (gltfLight.hasOwnProperty("spot")) {
		lightProps.innerConeAngle = gltfLight.spot.hasOwnProperty("innerConeAngle") ? gltfLight.spot.innerConeAngle * math.RAD_TO_DEG : 0;
		lightProps.outerConeAngle = gltfLight.spot.hasOwnProperty("outerConeAngle") ? gltfLight.spot.outerConeAngle * math.RAD_TO_DEG : 45;
	}
	if (gltfLight.hasOwnProperty("intensity")) {
		const outerAngleRad = gltfLight.spot?.outerConeAngle ?? Math.PI / 4;
		const innerAngleRad = gltfLight.spot?.innerConeAngle ?? 0;
		lightProps.luminance = gltfLight.intensity * Light.getLightUnitConversion(lightTypes[lightProps.type], outerAngleRad, innerAngleRad);
	}
	const lightEntity = new Entity(node.name, app);
	lightEntity.rotateLocal(90, 0, 0);
	lightEntity.addComponent("light", lightProps);
	return lightEntity;
};
const createLights = (gltf, nodes, options, app) => {
	let lights = null;
	if (gltf.hasOwnProperty("nodes") && gltf.hasOwnProperty("extensions") && gltf.extensions.hasOwnProperty("KHR_lights_punctual") && gltf.extensions.KHR_lights_punctual.hasOwnProperty("lights")) {
		const gltfLights = gltf.extensions.KHR_lights_punctual.lights;
		if (gltfLights.length) {
			const preprocess = options?.light?.preprocess;
			const process = options?.light?.process;
			const postprocess = options?.light?.postprocess;
			gltf.nodes.forEach((gltfNode, nodeIndex) => {
				if (gltfNode.hasOwnProperty("extensions") && gltfNode.extensions.hasOwnProperty("KHR_lights_punctual") && gltfNode.extensions.KHR_lights_punctual.hasOwnProperty("light")) {
					const lightIndex = gltfNode.extensions.KHR_lights_punctual.light;
					const gltfLight = gltfLights[lightIndex];
					if (gltfLight) {
						if (preprocess) {
							preprocess(gltfLight);
						}
						const light = process ? process(gltfLight, nodes[nodeIndex]) : createLight(gltfLight, nodes[nodeIndex], app);
						if (postprocess) {
							postprocess(gltfLight, light);
						}
						if (light) {
							if (!lights) lights = /* @__PURE__ */ new Map();
							lights.set(gltfNode, light);
						}
					}
				}
			});
		}
	}
	return lights;
};
export {
	createLights
};
