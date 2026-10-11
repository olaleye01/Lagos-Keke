import { array } from "../core/array-utils.js";
import { hashCode } from "../core/hash.js";
import { FOG_NONE, GAMMA_NONE, GAMMA_SRGB, gammaNames, TONEMAP_LINEAR, tonemapNames } from "./constants.js";
class CameraShaderParams {
	_gammaCorrection = GAMMA_SRGB;
	_toneMapping = TONEMAP_LINEAR;
	_srgbRenderTarget = false;
	_ssaoEnabled = false;
	_fog = FOG_NONE;
	_sceneDepthMapLinear = false;
	_sceneDepthMapPacked = false;
	_sceneDepthMapReciprocal = false;
	_sceneTextures = [];
	_hash;
	_defines = /* @__PURE__ */ new Map();
	_definesDirty = true;
	get hash() {
		if (this._hash === void 0) {
			const key = `${this.gammaCorrection}_${this.toneMapping}_${this.srgbRenderTarget}_${this.fog}_${this.ssaoEnabled}_${this.sceneDepthMapLinear}_${this.sceneDepthMapPacked}_${this.sceneDepthMapReciprocal}_${this._sceneTextures.join("-")}`;
			this._hash = hashCode(key);
		}
		return this._hash;
	}
	get defines() {
		const defines = this._defines;
		if (this._definesDirty) {
			this._definesDirty = false;
			defines.clear();
			if (this._sceneDepthMapLinear) {
				defines.set("SCENE_DEPTHMAP_LINEAR", "");
				if (this._sceneDepthMapPacked) defines.set("SCENE_DEPTHMAP_PACKED", "");
				if (this._sceneDepthMapReciprocal) defines.set("SCENE_DEPTHMAP_RECIPROCAL", "");
			}
			this._sceneTextures.forEach((name, index) => {
				const upperName = name.toUpperCase();
				defines.set(`SCENE_TEXTURE_${upperName}`, "");
				defines.set(`{SCENE_TEXTURE_${upperName}_SLOT}`, String(index + 1));
			});
			if (this.shaderOutputGamma === GAMMA_SRGB) defines.set("SCENE_COLORMAP_GAMMA", "");
			defines.set("FOG", this._fog.toUpperCase());
			defines.set("TONEMAP", tonemapNames[this._toneMapping]);
			defines.set("GAMMA", gammaNames[this.shaderOutputGamma]);
		}
		return defines;
	}
	markDirty() {
		this._hash = void 0;
		this._definesDirty = true;
	}
	set fog(type) {
		if (this._fog !== type) {
			this._fog = type;
			this.markDirty();
		}
	}
	get fog() {
		return this._fog;
	}
	set ssaoEnabled(value) {
		if (this._ssaoEnabled !== value) {
			this._ssaoEnabled = value;
			this.markDirty();
		}
	}
	get ssaoEnabled() {
		return this._ssaoEnabled;
	}
	set gammaCorrection(value) {
		this._gammaCorrectionAssigned = true;
		if (this._gammaCorrection !== value) {
			this._gammaCorrection = value;
			this.markDirty();
		}
	}
	get gammaCorrection() {
		return this._gammaCorrection;
	}
	set toneMapping(value) {
		if (this._toneMapping !== value) {
			this._toneMapping = value;
			this.markDirty();
		}
	}
	get toneMapping() {
		return this._toneMapping;
	}
	set srgbRenderTarget(value) {
		if (this._srgbRenderTarget !== value) {
			this._srgbRenderTarget = value;
			this.markDirty();
		}
	}
	get srgbRenderTarget() {
		return this._srgbRenderTarget;
	}
	set sceneDepthMapLinear(value) {
		if (this._sceneDepthMapLinear !== value) {
			this._sceneDepthMapLinear = value;
			this.markDirty();
		}
	}
	get sceneDepthMapLinear() {
		return this._sceneDepthMapLinear;
	}
	set sceneDepthMapPacked(value) {
		if (this._sceneDepthMapPacked !== value) {
			this._sceneDepthMapPacked = value;
			this.markDirty();
		}
	}
	get sceneDepthMapPacked() {
		return this._sceneDepthMapPacked;
	}
	set sceneDepthMapReciprocal(value) {
		if (this._sceneDepthMapReciprocal !== value) {
			this._sceneDepthMapReciprocal = value;
			this.markDirty();
		}
	}
	get sceneDepthMapReciprocal() {
		return this._sceneDepthMapReciprocal;
	}
	set sceneTextures(value) {
		const names = value ?? [];
		if (!array.equals(this._sceneTextures, names)) {
			this._sceneTextures = names.slice();
			this.markDirty();
		}
	}
	get sceneTextures() {
		return this._sceneTextures;
	}
	get shaderOutputGamma() {
		const gammaOutput = this._gammaCorrection === GAMMA_SRGB && !this._srgbRenderTarget;
		return gammaOutput ? GAMMA_SRGB : GAMMA_NONE;
	}
}
export {
	CameraShaderParams
};
