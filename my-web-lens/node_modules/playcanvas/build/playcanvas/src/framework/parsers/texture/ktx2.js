import { ReadStream } from "../../../core/read-stream.js";
import { ADDRESS_CLAMP_TO_EDGE, ADDRESS_REPEAT, TEXHINT_ASSET } from "../../../platform/graphics/constants.js";
import { Texture } from "../../../platform/graphics/texture.js";
import { Http } from "../../../platform/net/http.js";
import { basisTranscode } from "../../handlers/basis.js";
import { TextureParser } from "./texture.js";
const KHRConstants = {
	KHR_DF_MODEL_ETC1S: 163,
	KHR_DF_MODEL_UASTC: 166
};
class Ktx2Parser extends TextureParser {
	constructor(device) {
		super();
		this.device = device;
	}
	canParse(context) {
		return context.ext === "ktx2";
	}
	load(url, callback, asset) {
		this.handler.fetch(url, Http.ResponseType.ARRAY_BUFFER, (err, result) => {
			if (err) {
				callback(err, result);
			} else {
				this.parse(result, url, callback, asset);
			}
		}, asset);
	}
	open(url, data, device, textureOptions = {}) {
		const texture = new Texture(device, {
			name: url,
			addressU: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
			addressV: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
			width: data.width,
			height: data.height,
			format: data.format,
			cubemap: data.cubemap,
			levels: data.levels,
			// derive mipmaps from the actual level count, so a single-level file isn't treated as an
			// incomplete mip chain (which renders black); matches the dds parser
			mipmaps: data.levels.length > 1,
			...textureOptions
		});
		texture.upload();
		return texture;
	}
	parse(arraybuffer, url, callback, asset) {
		const rs = new ReadStream(arraybuffer);
		const magic = [rs.readU32be(), rs.readU32be(), rs.readU32be()];
		if (magic[0] !== 2873840728 || magic[1] !== 540160187 || magic[2] !== 218765834) {
			return null;
		}
		const header = {
			vkFormat: rs.readU32(),
			typeSize: rs.readU32(),
			pixelWidth: rs.readU32(),
			pixelHeight: rs.readU32(),
			pixelDepth: rs.readU32(),
			layerCount: rs.readU32(),
			faceCount: rs.readU32(),
			levelCount: rs.readU32(),
			supercompressionScheme: rs.readU32()
		};
		const index = {
			dfdByteOffset: rs.readU32(),
			dfdByteLength: rs.readU32(),
			kvdByteOffset: rs.readU32(),
			kvdByteLength: rs.readU32(),
			sgdByteOffset: rs.readU64(),
			sgdByteLength: rs.readU64()
		};
		const levels = [];
		for (let i = 0; i < Math.max(1, header.levelCount); ++i) {
			levels.push({
				byteOffset: rs.readU64(),
				byteLength: rs.readU64(),
				uncompressedByteLength: rs.readU64()
			});
		}
		const dfdTotalSize = rs.readU32();
		if (dfdTotalSize !== index.kvdByteOffset - index.dfdByteOffset) {
			return null;
		}
		rs.skip(8);
		const colorModel = rs.readU8();
		rs.skip(index.dfdByteLength - 9);
		rs.skip(index.kvdByteLength);
		if (header.supercompressionScheme === 1 || colorModel === KHRConstants.KHR_DF_MODEL_UASTC) {
			const basisModuleFound = basisTranscode(
				this.device,
				url.load,
				arraybuffer,
				callback,
				{
					isGGGR: (asset?.file?.variants?.basis?.opt & 8) !== 0,
					isKTX2: true,
					// a six-face ktx2 file is a cubemap
					isCubemap: header.faceCount === 6
				}
			);
			if (!basisModuleFound) {
				callback(`Basis module not found. Asset [${asset.name}](${asset.getFileUrl()}) basis texture variant will not be loaded.`);
			}
		} else {
			callback("unsupported KTX2 pixel format");
		}
	}
}
export {
	Ktx2Parser
};
