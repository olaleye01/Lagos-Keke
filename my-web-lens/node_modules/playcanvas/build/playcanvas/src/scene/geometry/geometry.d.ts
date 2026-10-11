/**
 * The Geometry class serves as a container for storing geometric information. It encapsulates data
 * such as positions, normals, colors, and indices.
 *
 * @category Graphics
 */
export class Geometry {
    /**
     * Positions.
     *
     * @type {ArrayLike<number>|undefined}
     */
    positions: ArrayLike<number> | undefined;
    /**
     * Normals.
     *
     * @type {ArrayLike<number>|undefined}
     */
    normals: ArrayLike<number> | undefined;
    /**
     * Colors.
     *
     * @type {ArrayLike<number>|undefined}
     */
    colors: ArrayLike<number> | undefined;
    /**
     * UVs.
     *
     * @type {ArrayLike<number>|undefined}
     */
    uvs: ArrayLike<number> | undefined;
    /**
     * Additional Uvs.
     *
     * @type {ArrayLike<number>|undefined}
     */
    uvs1: ArrayLike<number> | undefined;
    /**
     * Blend indices.
     *
     * @type {ArrayLike<number>|undefined}
     */
    blendIndices: ArrayLike<number> | undefined;
    /**
     * Blend weights.
     *
     * @type {ArrayLike<number>|undefined}
     */
    blendWeights: ArrayLike<number> | undefined;
    /**
     * Tangents.
     *
     * @type {ArrayLike<number>|undefined}
     */
    tangents: ArrayLike<number> | undefined;
    /**
     * Indices.
     *
     * @type {number[]|Uint8Array|Uint16Array|Uint32Array|undefined}
     */
    indices: number[] | Uint8Array | Uint16Array | Uint32Array | undefined;
    /**
     * Generates normal information from the positions and triangle indices.
     */
    calculateNormals(): void;
    /**
     * Generates tangent information from the positions, normals, texture coordinates and triangle
     * indices.
     */
    calculateTangents(): void;
}
