import { Color } from "../../core/math/color.js";
import { Mat4 } from "../../core/math/mat4.js";
import { Vec3 } from "../../core/math/vec3.js";
import { Vec4 } from "../../core/math/vec4.js";
import { BoundingSphere } from "../../core/shape/bounding-sphere.js";
import {
	ADDRESS_CLAMP_TO_EDGE,
	BLENDEQUATION_ADD,
	BLENDMODE_ONE,
	BLENDMODE_SRC_ALPHA,
	BLENDMODE_ZERO,
	FILTER_LINEAR,
	PIXELFORMAT_RGBA16F,
	PIXELFORMAT_RGBA32F,
	PIXELFORMAT_RGBA8,
	SEMANTIC_POSITION,
	SHADERLANGUAGE_GLSL,
	SHADERLANGUAGE_WGSL
} from "../../platform/graphics/constants.js";
import { BlendState } from "../../platform/graphics/blend-state.js";
import { FramePass } from "../../platform/graphics/frame-pass.js";
import { RenderTarget } from "../../platform/graphics/render-target.js";
import { Texture } from "../../platform/graphics/texture.js";
import { RenderPassShaderQuad } from "../../scene/graphics/render-pass-shader-quad.js";
import { LIGHTFALLOFF_LINEAR, LIGHTTYPE_SPOT, shadowTypeInfo } from "../../scene/constants.js";
import { LightCamera } from "../../scene/renderer/light-camera.js";
import { ShaderChunks } from "../../scene/shader-lib/shader-chunks.js";
import { ShaderUtils } from "../../scene/shader-lib/shader-utils.js";
import glslVolumetricFogPS from "../../scene/shader-lib/glsl/chunks/render-pass/frag/volumetricFog.js";
import wgslVolumetricFogPS from "../../scene/shader-lib/wgsl/chunks/render-pass/frag/volumetricFog.js";
import glslVolumetricFogCombinePS from "../../scene/shader-lib/glsl/chunks/render-pass/frag/volumetricFogCombine.js";
import wgslVolumetricFogCombinePS from "../../scene/shader-lib/wgsl/chunks/render-pass/frag/volumetricFogCombine.js";
import glslVolumetricFogLocalPS from "../../scene/shader-lib/glsl/chunks/render-pass/frag/volumetricFogLocal.js";
import wgslVolumetricFogLocalPS from "../../scene/shader-lib/wgsl/chunks/render-pass/frag/volumetricFogLocal.js";
import glslVolumetricFogLocalVS from "../../scene/shader-lib/glsl/chunks/render-pass/vert/volumetricFogLocal.js";
import wgslVolumetricFogLocalVS from "../../scene/shader-lib/wgsl/chunks/render-pass/vert/volumetricFogLocal.js";
const _tempDir = new Vec3();
const _tempVec3 = new Vec3();
const _tempSphere = new BoundingSphere();
const _tempCorner = new Vec4();
const _tempProjected = new Vec4();
const _tempRect = new Vec4();
const _cookieChannelMasks = {
	"rrr": [1, 0, 0, 0],
	"ggg": [0, 1, 0, 0],
	"bbb": [0, 0, 1, 0],
	"aaa": [0, 0, 0, 1],
	"rgb": [1, 1, 1, 0]
};
const _cookieChannelMaskNone = [0, 0, 0, 0];
class RenderPassVolumetricFog extends RenderPassShaderQuad {
	light = null;
	shadowsEnabled = false;
	lightRenderData = null;
	tint = new Color(1, 1, 1);
	density = 0.01;
	heightBase = 0;
	heightFalloff = 0.05;
	extinction = 1;
	anisotropy = 0.6;
	intensity = 1;
	ambientColor = new Color(1, 1, 1);
	ambientIntensity = 0.02;
	maxDistance = 300;
	steps = 24;
	noiseOffset = 0;
	exposure = 1;
	_variantKey = null;
	constructor(device, cameraComponent) {
		super(device);
		this.cameraComponent = cameraComponent;
		const scope = device.scope;
		this.cameraPosId = scope.resolve("uFogCameraPos");
		this.cameraFwdId = scope.resolve("uFogCameraFwd");
		this.invViewId = scope.resolve("uFogInvView");
		this.projScaleId = scope.resolve("uFogProjScale");
		this.tintId = scope.resolve("uFogTint");
		this.lightColorId = scope.resolve("uFogLightColor");
		this.lightDirId = scope.resolve("uFogLightDir");
		this.ambientId = scope.resolve("uFogAmbient");
		this.fogParamsId = scope.resolve("uFogParams");
		this.scatterParamsId = scope.resolve("uFogScatterParams");
		this.extinctionId = scope.resolve("uFogExtinction");
		this.shadowMapId = scope.resolve("uFogShadowMap");
		this.shadowMatrixPaletteId = scope.resolve("uFogShadowMatrixPalette[0]");
		this.shadowCascadeDistancesId = scope.resolve("uFogShadowCascadeDistances");
		this.shadowParamsId = scope.resolve("uFogShadowParams");
		this._cameraPos = new Float32Array(3);
		this._cameraFwd = new Float32Array(3);
		this._projScale = new Float32Array(2);
		this._tint = new Float32Array(3);
		this._lightColor = new Float32Array(3);
		this._lightDir = new Float32Array(3);
		this._ambient = new Float32Array(3);
		this._fogParams = new Float32Array(4);
		this._scatterParams = new Float32Array(4);
		this._shadowParams = new Float32Array(4);
	}
	updateShaderVariant(shadows, pcf) {
		const depthKey = ShaderUtils.getScreenDepthChunkKey(this.cameraComponent.shaderParams);
		const key = `${shadows}-${pcf}${depthKey}`;
		if (this._variantKey !== key) {
			this._variantKey = key;
			const defines = /* @__PURE__ */ new Map();
			ShaderUtils.addScreenDepthChunkDefines(this.cameraComponent.shaderParams, defines);
			if (shadows) defines.set("FOG_SHADOWS", "");
			if (pcf) defines.set("FOG_SHADOW_PCF", "");
			this.shader = ShaderUtils.createShader(this.device, {
				uniqueName: `VolumetricFogShader-${key}`,
				attributes: { aPosition: SEMANTIC_POSITION },
				vertexChunk: "quadVS",
				fragmentChunk: "volumetricFogPS",
				fragmentDefines: defines
			});
		}
	}
	execute() {
		const { light } = this;
		const camera = this.cameraComponent.camera;
		const node = camera._node;
		this.invViewId.setValue(node.getWorldTransform().data);
		const pos = node.getPosition();
		this._cameraPos[0] = pos.x;
		this._cameraPos[1] = pos.y;
		this._cameraPos[2] = pos.z;
		this.cameraPosId.setValue(this._cameraPos);
		const fwd = node.forward;
		this._cameraFwd[0] = fwd.x;
		this._cameraFwd[1] = fwd.y;
		this._cameraFwd[2] = fwd.z;
		this.cameraFwdId.setValue(this._cameraFwd);
		const projData = camera.projectionMatrix.data;
		this._projScale[0] = 1 / projData[0];
		this._projScale[1] = 1 / projData[5];
		this.projScaleId.setValue(this._projScale);
		const lightScale = this.intensity * this.exposure;
		if (light) {
			light._node.getWorldTransform().getY(_tempDir).normalize();
			this._lightDir[0] = _tempDir.x;
			this._lightDir[1] = _tempDir.y;
			this._lightDir[2] = _tempDir.z;
			const color = light._colorLinear;
			this._lightColor[0] = color[0] * lightScale;
			this._lightColor[1] = color[1] * lightScale;
			this._lightColor[2] = color[2] * lightScale;
		} else {
			this._lightDir[0] = 0;
			this._lightDir[1] = 1;
			this._lightDir[2] = 0;
			this._lightColor[0] = 0;
			this._lightColor[1] = 0;
			this._lightColor[2] = 0;
		}
		this.lightDirId.setValue(this._lightDir);
		this.lightColorId.setValue(this._lightColor);
		if (this.shadowsEnabled && light && this.lightRenderData) {
			const lightRenderData = this.lightRenderData;
			const biases = light._getUniformBiasValues(lightRenderData);
			this.shadowMapId.setValue(lightRenderData.shadowBuffer);
			this.shadowMatrixPaletteId.setValue(light._shadowMatrixPalette);
			this.shadowCascadeDistancesId.setValue(light._shadowCascadeDistances);
			this._shadowParams[0] = light.numCascades;
			this._shadowParams[1] = biases.bias;
			this._shadowParams[2] = 0;
			this._shadowParams[3] = light.shadowDistance;
			this.shadowParamsId.setValue(this._shadowParams);
		}
		const { tint, ambientColor, ambientIntensity } = this;
		this._tint[0] = tint.r;
		this._tint[1] = tint.g;
		this._tint[2] = tint.b;
		this.tintId.setValue(this._tint);
		const ambientScale = ambientIntensity * this.exposure;
		this._ambient[0] = ambientColor.r * ambientScale;
		this._ambient[1] = ambientColor.g * ambientScale;
		this._ambient[2] = ambientColor.b * ambientScale;
		this.ambientId.setValue(this._ambient);
		this._fogParams[0] = this.density;
		this._fogParams[1] = this.heightBase;
		this._fogParams[2] = this.heightFalloff;
		this._fogParams[3] = this.maxDistance;
		this.fogParamsId.setValue(this._fogParams);
		this.extinctionId.setValue(this.extinction);
		this._scatterParams[0] = this.anisotropy;
		this._scatterParams[1] = this.steps;
		this._scatterParams[2] = this.noiseOffset;
		this._scatterParams[3] = light ? light.shadowIntensity : 1;
		this.scatterParamsId.setValue(this._scatterParams);
		super.execute();
	}
}
class RenderPassVolumetricFogLocal extends RenderPassShaderQuad {
	scenePass = null;
	omniLights = true;
	spotLights = true;
	tint = new Color(1, 1, 1);
	density = 0.01;
	heightBase = 0;
	heightFalloff = 0.05;
	extinction = 1;
	anisotropy = 0.6;
	intensity = 1;
	maxDistance = 300;
	steps = 12;
	noiseOffset = 0;
	exposure = 1;
	_variantKey = null;
	constructor(device, cameraComponent) {
		super(device);
		this.cameraComponent = cameraComponent;
		this.blendState = new BlendState(
			true,
			BLENDEQUATION_ADD,
			BLENDMODE_ONE,
			BLENDMODE_ONE,
			BLENDEQUATION_ADD,
			BLENDMODE_ZERO,
			BLENDMODE_ONE
		);
		const scope = device.scope;
		this.cameraPosId = scope.resolve("uVolCameraPos");
		this.cameraFwdId = scope.resolve("uVolCameraFwd");
		this.invViewId = scope.resolve("uVolInvView");
		this.projScaleId = scope.resolve("uVolProjScale");
		this.tintId = scope.resolve("uVolTint");
		this.fogParamsId = scope.resolve("uVolFogParams");
		this.marchParamsId = scope.resolve("uVolMarchParams");
		this.lightRectId = scope.resolve("uVolLightRect");
		this.lightPosRangeId = scope.resolve("uVolLightPosRange");
		this.lightSphereId = scope.resolve("uVolLightSphere");
		this.lightColorId = scope.resolve("uVolLightColor");
		this.lightDirId = scope.resolve("uVolLightDir");
		this.lightSpotId = scope.resolve("uVolLightSpot");
		this.lightAttenId = scope.resolve("uVolLightAtten");
		this.lightProjMatrixId = scope.resolve("uVolLightProjMatrix");
		this.lightAtlasId = scope.resolve("uVolLightAtlas");
		this.lightCookieChannelId = scope.resolve("uVolLightCookieChannel");
		this._cameraPos = new Float32Array(3);
		this._cameraFwd = new Float32Array(3);
		this._projScale = new Float32Array(2);
		this._tint = new Float32Array(3);
		this._fogParams = new Float32Array(4);
		this._marchParams = new Float32Array(4);
		this._lightRect = new Float32Array(4);
		this._lightPosRange = new Float32Array(4);
		this._lightSphere = new Float32Array(4);
		this._lightColor = new Float32Array(3);
		this._lightDir = new Float32Array(4);
		this._lightSpot = new Float32Array(4);
		this._lightAtten = new Float32Array(4);
		this._lightAtlas = new Float32Array(4);
	}
	updateShaderVariant(shadows, cookies) {
		const depthKey = ShaderUtils.getScreenDepthChunkKey(this.cameraComponent.shaderParams);
		const key = `${shadows}-${cookies}${depthKey}`;
		if (this._variantKey !== key) {
			this._variantKey = key;
			const defines = /* @__PURE__ */ new Map();
			ShaderUtils.addScreenDepthChunkDefines(this.cameraComponent.shaderParams, defines);
			if (shadows) defines.set("VOL_SHADOWS", "");
			if (cookies) defines.set("VOL_COOKIES", "");
			this.shader = ShaderUtils.createShader(this.device, {
				uniqueName: `VolumetricFogLocalShader-${key}`,
				attributes: { aPosition: SEMANTIC_POSITION },
				vertexChunk: "volumetricFogLocalVS",
				fragmentChunk: "volumetricFogLocalPS",
				fragmentDefines: defines
			});
		}
	}
	_getLightClusters() {
		const steps = this.scenePass?.layerRenderSteps;
		if (steps) {
			for (let i = 0; i < steps.length; i++) {
				const clusters = steps[i].lightClusters;
				if (clusters && clusters.usedLights.length > 1) {
					return clusters;
				}
			}
		}
		return null;
	}
	_evalLightRect(light, camera, rect) {
		light.getBoundingSphere(_tempSphere);
		const radius = _tempSphere.radius;
		camera.viewMatrix.transformPoint(_tempSphere.center, _tempVec3);
		if (-_tempVec3.z - radius <= camera.nearClip) {
			rect.set(-1, -1, 1, 1);
			return true;
		}
		const projection = camera.projectionMatrix;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (let i = 0; i < 8; i++) {
			_tempCorner.set(
				_tempVec3.x + (i & 1 ? radius : -radius),
				_tempVec3.y + (i & 2 ? radius : -radius),
				_tempVec3.z + (i & 4 ? radius : -radius),
				1
			);
			projection.transformVec4(_tempCorner, _tempProjected);
			const x = _tempProjected.x / _tempProjected.w;
			const y = _tempProjected.y / _tempProjected.w;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
		rect.set(Math.max(minX, -1), Math.max(minY, -1), Math.min(maxX, 1), Math.min(maxY, 1));
		return rect.x < rect.z && rect.y < rect.w;
	}
	_setupLight(light, shadows, cookies) {
		const camera = this.cameraComponent.camera;
		const isSpot = light._type === LIGHTTYPE_SPOT;
		if (!this._evalLightRect(light, camera, _tempRect)) {
			return false;
		}
		this._lightRect[0] = _tempRect.x;
		this._lightRect[1] = _tempRect.y;
		this._lightRect[2] = _tempRect.z;
		this._lightRect[3] = _tempRect.w;
		this.lightRectId.setValue(this._lightRect);
		this._lightSphere[0] = _tempSphere.center.x;
		this._lightSphere[1] = _tempSphere.center.y;
		this._lightSphere[2] = _tempSphere.center.z;
		this._lightSphere[3] = _tempSphere.radius;
		this.lightSphereId.setValue(this._lightSphere);
		const pos = light._node.getPosition();
		this._lightPosRange[0] = pos.x;
		this._lightPosRange[1] = pos.y;
		this._lightPosRange[2] = pos.z;
		this._lightPosRange[3] = light.attenuationEnd;
		this.lightPosRangeId.setValue(this._lightPosRange);
		const scale = this.intensity * this.exposure * light.volumetricScattering;
		const color = light._colorLinear;
		this._lightColor[0] = color[0] * scale;
		this._lightColor[1] = color[1] * scale;
		this._lightColor[2] = color[2] * scale;
		this.lightColorId.setValue(this._lightColor);
		if (isSpot) {
			light._node.getWorldTransform().getY(_tempDir).mulScalar(-1).normalize();
		}
		this._lightDir[0] = isSpot ? _tempDir.x : 0;
		this._lightDir[1] = isSpot ? _tempDir.y : 0;
		this._lightDir[2] = isSpot ? _tempDir.z : 0;
		this._lightDir[3] = isSpot ? 1 : 0;
		this.lightDirId.setValue(this._lightDir);
		this._lightAtten[0] = light._falloffMode === LIGHTFALLOFF_LINEAR ? 1 : 0;
		this.lightAttenId.setValue(this._lightAtten);
		const hasAtlasSlot = light.atlasViewportAllocated;
		const hasShadowMap = shadows && hasAtlasSlot && light.castShadows;
		const useShadow = hasShadowMap && light.shadowIntensity > 0;
		const useCookie = cookies && hasAtlasSlot && !!light._cookie && light.cookieIntensity > 0;
		this._lightSpot[0] = light._innerConeAngleCos;
		this._lightSpot[1] = light._outerConeAngleCos;
		this._lightSpot[2] = useShadow ? light.shadowIntensity : 0;
		this._lightSpot[3] = useCookie ? light.cookieIntensity : 0;
		this.lightSpotId.setValue(this._lightSpot);
		if (shadows || cookies) {
			const lightRenderData = hasShadowMap ? light.getRenderData(null, 0) : null;
			if (isSpot) {
				const matrix = lightRenderData?.shadowMatrix ?? (useCookie ? LightCamera.evalSpotCookieMatrix(light) : Mat4.IDENTITY);
				this.lightProjMatrixId.setValue(matrix.data);
			} else {
				this.lightProjMatrixId.setValue(Mat4.IDENTITY.data);
			}
			const viewport = light.atlasViewport;
			this._lightAtlas[0] = viewport.x;
			this._lightAtlas[1] = viewport.y;
			this._lightAtlas[2] = viewport.z / 3;
			this._lightAtlas[3] = lightRenderData ? light._getUniformBiasValues(lightRenderData).bias : 0;
			this.lightAtlasId.setValue(this._lightAtlas);
		}
		if (cookies) {
			this.lightCookieChannelId.setValue(useCookie ? _cookieChannelMasks[light._cookieChannel] ?? _cookieChannelMasks.rgb : _cookieChannelMaskNone);
		}
		return true;
	}
	execute() {
		const clusters = this._getLightClusters();
		if (!clusters || !this.quadRender) {
			return;
		}
		const camera = this.cameraComponent.camera;
		const node = camera._node;
		const { lighting } = this.cameraComponent.system.app.scene;
		this.invViewId.setValue(node.getWorldTransform().data);
		const pos = node.getPosition();
		this._cameraPos[0] = pos.x;
		this._cameraPos[1] = pos.y;
		this._cameraPos[2] = pos.z;
		this.cameraPosId.setValue(this._cameraPos);
		const fwd = node.forward;
		this._cameraFwd[0] = fwd.x;
		this._cameraFwd[1] = fwd.y;
		this._cameraFwd[2] = fwd.z;
		this.cameraFwdId.setValue(this._cameraFwd);
		const projData = camera.projectionMatrix.data;
		this._projScale[0] = 1 / projData[0];
		this._projScale[1] = 1 / projData[5];
		this.projScaleId.setValue(this._projScale);
		const { tint } = this;
		this._tint[0] = tint.r;
		this._tint[1] = tint.g;
		this._tint[2] = tint.b;
		this.tintId.setValue(this._tint);
		this._fogParams[0] = this.density;
		this._fogParams[1] = this.heightBase;
		this._fogParams[2] = this.heightFalloff;
		this._fogParams[3] = this.maxDistance;
		this.fogParamsId.setValue(this._fogParams);
		this._marchParams[0] = this.anisotropy;
		this._marchParams[1] = this.steps;
		this._marchParams[2] = this.noiseOffset;
		this._marchParams[3] = this.extinction;
		this.marchParamsId.setValue(this._marchParams);
		this.device.setDrawStates(
			this.blendState,
			this.depthState,
			this.cullMode,
			this.frontFace,
			this.stencilFront,
			this.stencilBack
		);
		const { shadowsEnabled, cookiesEnabled } = lighting;
		const { omniLights, spotLights } = this;
		const lights = clusters.usedLights;
		for (let i = 1; i < lights.length; i++) {
			const light = lights[i].light;
			const enabled = light?.volumetricScattering > 0 && (light._type === LIGHTTYPE_SPOT ? spotLights : omniLights);
			if (enabled && this._setupLight(light, shadowsEnabled, cookiesEnabled)) {
				this.quadRender.render();
			}
		}
	}
}
class RenderPassVolumetricFogCombine extends RenderPassShaderQuad {
	constructor(device, cameraComponent, fogTexture) {
		super(device);
		this.fogTexture = fogTexture;
		const defines = /* @__PURE__ */ new Map();
		const depthKey = ShaderUtils.addScreenDepthChunkDefines(cameraComponent.shaderParams, defines);
		this.shader = ShaderUtils.createShader(device, {
			uniqueName: `VolumetricFogCombineShader${depthKey}`,
			attributes: { aPosition: SEMANTIC_POSITION },
			vertexChunk: "quadVS",
			fragmentChunk: "volumetricFogCombinePS",
			fragmentDefines: defines
		});
		this.blendState = new BlendState(
			true,
			BLENDEQUATION_ADD,
			BLENDMODE_ONE,
			BLENDMODE_SRC_ALPHA,
			BLENDEQUATION_ADD,
			BLENDMODE_ZERO,
			BLENDMODE_ONE
		);
		this.fogTextureId = device.scope.resolve("uFogTexture");
		this.fogTextureSizeId = device.scope.resolve("uFogTextureSize");
		this._fogTextureSize = new Float32Array(4);
	}
	execute() {
		const { fogTexture } = this;
		this.fogTextureId.setValue(fogTexture);
		this._fogTextureSize[0] = fogTexture.width;
		this._fogTextureSize[1] = fogTexture.height;
		this._fogTextureSize[2] = 1 / fogTexture.width;
		this._fogTextureSize[3] = 1 / fogTexture.height;
		this.fogTextureSizeId.setValue(this._fogTextureSize);
		super.execute();
	}
}
class FramePassVolumetricFog extends FramePass {
	light = null;
	tint = new Color(1, 1, 1);
	density = 0.01;
	heightBase = 0;
	heightFalloff = 0.05;
	extinction = 1;
	anisotropy = 0.6;
	intensity = 1;
	ambientColor = new Color(1, 1, 1);
	ambientIntensity = 0.02;
	maxDistance = 300;
	steps = 24;
	temporalDither = false;
	localOmniLights = false;
	localSpotLights = false;
	localIntensity = 1;
	localSteps = 12;
	_scale = 0.5;
	_frameIndex = 0;
	constructor(device, cameraComponent, sceneTexture, sceneRenderTarget, scenePass = null) {
		super(device);
		this.cameraComponent = cameraComponent;
		ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set("volumetricFogPS", glslVolumetricFogPS);
		ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set("volumetricFogPS", wgslVolumetricFogPS);
		ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set("volumetricFogCombinePS", glslVolumetricFogCombinePS);
		ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set("volumetricFogCombinePS", wgslVolumetricFogCombinePS);
		ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set("volumetricFogLocalPS", glslVolumetricFogLocalPS);
		ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set("volumetricFogLocalPS", wgslVolumetricFogLocalPS);
		ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set("volumetricFogLocalVS", glslVolumetricFogLocalVS);
		ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set("volumetricFogLocalVS", wgslVolumetricFogLocalVS);
		const format = device.getRenderableHdrFormat([PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F], true, 1) ?? PIXELFORMAT_RGBA8;
		this.fogTexture = new Texture(device, {
			name: "VolumetricFogTexture",
			width: 4,
			height: 4,
			format,
			mipmaps: false,
			minFilter: FILTER_LINEAR,
			magFilter: FILTER_LINEAR,
			addressU: ADDRESS_CLAMP_TO_EDGE,
			addressV: ADDRESS_CLAMP_TO_EDGE
		});
		this.fogRenderTarget = new RenderTarget({
			name: "VolumetricFogRT",
			colorBuffer: this.fogTexture,
			depth: false
		});
		this.fogPass = new RenderPassVolumetricFog(device, cameraComponent);
		this.fogPass.init(this.fogRenderTarget, {
			resizeSource: sceneTexture,
			scaleX: this._scale,
			scaleY: this._scale
		});
		this.fogPass.setClearColor(new Color(0, 0, 0, 1));
		this.beforePasses.push(this.fogPass);
		this.localPass = new RenderPassVolumetricFogLocal(device, cameraComponent);
		this.localPass.scenePass = scenePass;
		this.localPass.init(this.fogRenderTarget);
		this.beforePasses.push(this.localPass);
		this.combinePass = new RenderPassVolumetricFogCombine(device, cameraComponent, this.fogTexture);
		this.combinePass.init(sceneRenderTarget);
		this.beforePasses.push(this.combinePass);
	}
	destroy() {
		this.beforePasses.forEach((pass) => pass.destroy());
		this.beforePasses.length = 0;
		this.fogPass = null;
		this.localPass = null;
		this.combinePass = null;
		if (this.fogRenderTarget) {
			this.fogRenderTarget.destroyTextureBuffers();
			this.fogRenderTarget.destroy();
			this.fogRenderTarget = null;
			this.fogTexture = null;
		}
	}
	set scale(value) {
		this._scale = value;
		this.fogPass.scaleX = value;
		this.fogPass.scaleY = value;
	}
	get scale() {
		return this._scale;
	}
	frameUpdate() {
		super.frameUpdate();
		const { light, fogPass, localPass } = this;
		const camera = this.cameraComponent.camera;
		const scene = this.cameraComponent.system.app.scene;
		let shadows = false;
		let pcf = false;
		let lightRenderData = null;
		if (light && light.castShadows && light.shadowIntensity > 0) {
			lightRenderData = light.getRenderData(camera, 0);
			if (lightRenderData.shadowBuffer) {
				shadows = true;
				pcf = !!shadowTypeInfo.get(light._shadowType)?.pcf;
			}
		}
		fogPass.updateShaderVariant(shadows, pcf);
		fogPass.shadowsEnabled = shadows;
		fogPass.lightRenderData = shadows ? lightRenderData : null;
		fogPass.light = light;
		fogPass.tint.copy(this.tint);
		fogPass.density = this.density;
		fogPass.heightBase = this.heightBase;
		fogPass.heightFalloff = this.heightFalloff;
		fogPass.extinction = this.extinction;
		fogPass.anisotropy = this.anisotropy;
		fogPass.intensity = this.intensity;
		fogPass.ambientColor.copy(this.ambientColor);
		fogPass.ambientIntensity = this.ambientIntensity;
		fogPass.maxDistance = this.maxDistance;
		fogPass.steps = Math.max(1, Math.floor(this.steps));
		fogPass.exposure = scene.exposure;
		this._frameIndex = (this._frameIndex + 1) % 16;
		fogPass.noiseOffset = this.temporalDither ? this._frameIndex * 0.618034 : 0;
		const { localOmniLights, localSpotLights } = this;
		localPass.enabled = (localOmniLights || localSpotLights) && scene.clusteredLightingEnabled;
		if (localPass.enabled) {
			const { shadowsEnabled, cookiesEnabled } = scene.lighting;
			localPass.updateShaderVariant(shadowsEnabled, cookiesEnabled);
			localPass.omniLights = localOmniLights;
			localPass.spotLights = localSpotLights;
			localPass.tint.copy(this.tint);
			localPass.density = this.density;
			localPass.heightBase = this.heightBase;
			localPass.heightFalloff = this.heightFalloff;
			localPass.extinction = this.extinction;
			localPass.anisotropy = this.anisotropy;
			localPass.maxDistance = this.maxDistance;
			localPass.intensity = this.localIntensity;
			localPass.steps = Math.max(1, Math.floor(this.localSteps));
			localPass.exposure = scene.exposure;
			localPass.noiseOffset = fogPass.noiseOffset;
		}
	}
}
export {
	FramePassVolumetricFog
};
