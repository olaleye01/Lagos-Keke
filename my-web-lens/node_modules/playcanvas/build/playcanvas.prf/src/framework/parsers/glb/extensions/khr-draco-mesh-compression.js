import {
	BUFFER_STATIC,
	INDEXFORMAT_UINT16,
	INDEXFORMAT_UINT32,
	SEMANTIC_COLOR,
	SEMANTIC_NORMAL,
	TYPE_UINT8,
	TYPE_UINT16
} from "../../../../platform/graphics/constants.js";
import { IndexBuffer } from "../../../../platform/graphics/index-buffer.js";
import { VertexBuffer } from "../../../../platform/graphics/vertex-buffer.js";
import { VertexFormat } from "../../../../platform/graphics/vertex-format.js";
import { Mesh } from "../../../../scene/mesh.js";
import { dracoDecode } from "../../draco-decoder.js";
import { GltfAccessor, getPrimitiveType, isTriangleMode, gltfToEngineSemanticMap } from "../gltf-accessor.js";
import { registerMeshVariants } from "./khr-materials-variants.js";
const createDracoMesh = (device, primitive, accessors, bufferViews, meshVariants, meshDefaultMaterials, flatShadedMeshes, promises) => {
	const result = new Mesh(device);
	result.aabb = GltfAccessor.getBoundingBox(accessors[primitive.attributes.POSITION]);
	promises.push(new Promise((resolve, reject) => {
		const dracoExt = primitive.extensions.KHR_draco_mesh_compression;
		const initialized = dracoDecode(bufferViews[dracoExt.bufferView].slice().buffer, (err, decompressedData) => {
			if (err) {
				console.log(err);
				reject(err);
			} else {
				const idToSemantic = {};
				for (const [name, id] of Object.entries(dracoExt.attributes)) {
					idToSemantic[id] = gltfToEngineSemanticMap[name];
				}
				idToSemantic[-1] = SEMANTIC_NORMAL;
				const vertexDesc = [];
				for (const attr of decompressedData.attributes) {
					const semantic = idToSemantic[attr.id];
					if (semantic !== void 0) {
						let normalize = false;
						if (attr.id !== -1) {
							for (const [name, id] of Object.entries(dracoExt.attributes)) {
								if (id === attr.id && primitive.attributes[name] !== void 0) {
									const accessor = accessors[primitive.attributes[name]];
									normalize = accessor.normalized ?? (semantic === SEMANTIC_COLOR && (attr.dataType === TYPE_UINT8 || attr.dataType === TYPE_UINT16));
									break;
								}
							}
						}
						vertexDesc.push({
							semantic,
							components: attr.numComponents,
							type: attr.dataType,
							normalize,
							// use offset and stride from worker to handle cases where Draco mesh
							// has additional attributes not listed in glTF
							offset: attr.offset,
							stride: decompressedData.stride
						});
					}
				}
				const vertexFormat = new VertexFormat(device, vertexDesc);
				const numVertices = decompressedData.vertices.byteLength / decompressedData.stride;
				const indexFormat = numVertices <= 65535 ? INDEXFORMAT_UINT16 : INDEXFORMAT_UINT32;
				const numIndices = decompressedData.indices.byteLength / (numVertices <= 65535 ? 2 : 4);
				const vertexBuffer = new VertexBuffer(device, vertexFormat, numVertices, {
					data: decompressedData.vertices
				});
				const indexBuffer = new IndexBuffer(device, indexFormat, numIndices, BUFFER_STATIC, decompressedData.indices);
				result.vertexBuffer = vertexBuffer;
				result.indexBuffer[0] = indexBuffer;
				result.primitive[0].type = getPrimitiveType(primitive);
				result.primitive[0].base = 0;
				result.primitive[0].count = indexBuffer ? numIndices : numVertices;
				result.primitive[0].indexed = !!indexBuffer;
				resolve();
			}
		});
		if (!initialized) {
			const message = "glTF file contains Draco compressed meshes, but the Draco decoder is not configured. Call dracoInitialize() or WasmModule.setConfig('DracoDecoderModule', ...) before loading the asset.";
			reject(new Error(message));
		}
	}));
	registerMeshVariants(primitive, result.id, meshVariants);
	meshDefaultMaterials[result.id] = primitive.material;
	if (!primitive.attributes.hasOwnProperty("NORMAL") && isTriangleMode(getPrimitiveType(primitive))) {
		flatShadedMeshes.add(result.id);
	}
	return result;
};
export {
	createDracoMesh
};
