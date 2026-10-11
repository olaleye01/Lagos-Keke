var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { Debug } from "../../core/debug.js";
import { calculateNormals, calculateTangents } from "./geometry-utils.js";
class Geometry {
  constructor() {
    /**
     * Positions.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "positions");
    /**
     * Normals.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "normals");
    /**
     * Colors.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "colors");
    /**
     * UVs.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "uvs");
    /**
     * Additional Uvs.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "uvs1");
    /**
     * Blend indices.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "blendIndices");
    /**
     * Blend weights.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "blendWeights");
    /**
     * Tangents.
     *
     * @type {ArrayLike<number>|undefined}
     */
    __publicField(this, "tangents");
    /**
     * Indices.
     *
     * @type {number[]|Uint8Array|Uint16Array|Uint32Array|undefined}
     */
    __publicField(this, "indices");
  }
  /**
   * Generates normal information from the positions and triangle indices.
   */
  calculateNormals() {
    Debug.assert(this.positions, "Geometry must have positions set");
    Debug.assert(this.indices, "Geometry must have indices set");
    this.normals = calculateNormals(this.positions, this.indices);
  }
  /**
   * Generates tangent information from the positions, normals, texture coordinates and triangle
   * indices.
   */
  calculateTangents() {
    Debug.assert(this.positions, "Geometry must have positions set");
    Debug.assert(this.normals, "Geometry must have normals set");
    Debug.assert(this.uvs, "Geometry must have uvs set");
    Debug.assert(this.indices, "Geometry must have indices set");
    this.tangents = calculateTangents(this.positions, this.normals, this.uvs, this.indices);
  }
}
export {
  Geometry
};
