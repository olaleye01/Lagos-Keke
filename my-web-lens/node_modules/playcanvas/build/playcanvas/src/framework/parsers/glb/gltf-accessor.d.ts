/**
 * Utility functions for decoding glTF accessor data.
 *
 * @ignore
 */
export class GltfAccessor {
    static getNumComponents(accessorType: any): 16 | 3 | 1 | 2 | 4 | 9;
    static getComponentType(componentType: any): 0 | 3 | 1 | 2 | 4 | 5 | 6;
    static getComponentSizeInBytes(componentType: any): 0 | 1 | 2 | 4;
    static getComponentDataType(componentType: any): Int8ArrayConstructor | Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor | Float32ArrayConstructor;
    static getData(gltfAccessor: any, bufferViews: any, flatten?: boolean): any;
    static extractComponent(source: any, numComponents: any, component: any, count: any): Float32Array<any>;
    static getDataFloat32(gltfAccessor: any, bufferViews: any): any;
    static getBoundingBox(gltfAccessor: any): BoundingBox;
}
export function getPrimitiveType(primitive: any): 0 | 3 | 1 | 2 | 4 | 5 | 6;
export function isTriangleMode(primitiveType: any): boolean;
export namespace gltfToEngineSemanticMap {
    export { SEMANTIC_POSITION as POSITION };
    export { SEMANTIC_NORMAL as NORMAL };
    export { SEMANTIC_TANGENT as TANGENT };
    export { SEMANTIC_COLOR as COLOR_0 };
    export { SEMANTIC_BLENDINDICES as JOINTS_0 };
    export { SEMANTIC_BLENDWEIGHT as WEIGHTS_0 };
    export { SEMANTIC_TEXCOORD0 as TEXCOORD_0 };
    export { SEMANTIC_TEXCOORD1 as TEXCOORD_1 };
    export { SEMANTIC_TEXCOORD2 as TEXCOORD_2 };
    export { SEMANTIC_TEXCOORD3 as TEXCOORD_3 };
    export { SEMANTIC_TEXCOORD4 as TEXCOORD_4 };
    export { SEMANTIC_TEXCOORD5 as TEXCOORD_5 };
    export { SEMANTIC_TEXCOORD6 as TEXCOORD_6 };
    export { SEMANTIC_TEXCOORD7 as TEXCOORD_7 };
}
import { BoundingBox } from '../../../core/shape/bounding-box.js';
import { SEMANTIC_POSITION } from '../../../platform/graphics/constants.js';
import { SEMANTIC_NORMAL } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TANGENT } from '../../../platform/graphics/constants.js';
import { SEMANTIC_COLOR } from '../../../platform/graphics/constants.js';
import { SEMANTIC_BLENDINDICES } from '../../../platform/graphics/constants.js';
import { SEMANTIC_BLENDWEIGHT } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD0 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD1 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD2 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD3 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD4 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD5 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD6 } from '../../../platform/graphics/constants.js';
import { SEMANTIC_TEXCOORD7 } from '../../../platform/graphics/constants.js';
