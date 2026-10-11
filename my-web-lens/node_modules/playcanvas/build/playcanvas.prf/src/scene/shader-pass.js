import { DeviceCache } from "../platform/graphics/device-cache.js";
import {
	SHADER_FORWARD,
	SHADER_PICK,
	SHADER_SHADOW,
	SHADER_PREPASS,
	SHADER_DEPTH_PICK,
	LIGHTTYPE_DIRECTIONAL,
	LIGHTTYPE_SPOT,
	lightTypeNames,
	shadowTypeInfo
} from "./constants.js";
const shaderPassDeviceCache = new DeviceCache();
class ShaderPassInfo {
	index;
	name;
	defines = /* @__PURE__ */ new Map();
	constructor(name, index, options = {}) {
		this.name = name;
		this.index = index;
		Object.assign(this, options);
		this.buildShaderDefines();
	}
	buildShaderDefines() {
		let keyword;
		if (this.isShadow) {
			keyword = "SHADOW";
			if (this.lightType !== void 0) {
				const shadowInfo = shadowTypeInfo.get(this.shadowType);
				const perspectiveDepth = this.lightType === LIGHTTYPE_DIRECTIONAL || !shadowInfo.vsm && this.lightType === LIGHTTYPE_SPOT;
				if (perspectiveDepth) this.defines.set("PERSPECTIVE_DEPTH", "");
				this.defines.set("LIGHT_TYPE", `${lightTypeNames[this.lightType]}`);
				this.defines.set("SHADOW_TYPE", `${shadowInfo.name}`);
			}
		} else if (this.isForward) {
			keyword = "FORWARD";
		} else if (this.index === SHADER_PICK) {
			keyword = "PICK";
		} else if (this.index === SHADER_DEPTH_PICK) {
			keyword = "PICK";
			this.defines.set("DEPTH_PICK_PASS", "");
		}
		if (keyword) {
			this.defines.set(`${keyword}_PASS`, "");
		}
		this.defines.set(`${this.name.toUpperCase()}_PASS`, "");
	}
}
class ShaderPass {
	passesNamed = /* @__PURE__ */ new Map();
	passesIndexed = [];
	nextIndex = 0;
	constructor() {
		const add = (name, index, options) => {
			const info = this.allocate(name, options);
		};
		add("forward", SHADER_FORWARD, { isForward: true });
		add("prepass", SHADER_PREPASS);
		add("shadow", SHADER_SHADOW);
		add("pick", SHADER_PICK);
		add("depth_pick", SHADER_DEPTH_PICK);
	}
	static get(device) {
		return shaderPassDeviceCache.get(device, () => {
			return new ShaderPass();
		});
	}
	allocate(name, options) {
		let info = this.passesNamed.get(name);
		if (info === void 0) {
			info = new ShaderPassInfo(name, this.nextIndex, options);
			this.passesNamed.set(info.name, info);
			this.passesIndexed[info.index] = info;
			this.nextIndex++;
		}
		return info;
	}
	getByIndex(index) {
		const info = this.passesIndexed[index];
		return info;
	}
	getByName(name) {
		return this.passesNamed.get(name);
	}
}
export {
	ShaderPass,
	ShaderPassInfo
};
