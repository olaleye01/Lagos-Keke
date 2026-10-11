/**
 * Generates normal information from the specified positions and triangle indices.
 *
 * @param {ArrayLike<number>} positions - An array of 3-dimensional vertex positions.
 * @param {ArrayLike<number>} indices - An array of triangle indices.
 * @returns {number[]} An array of 3-dimensional vertex normals.
 * @example
 * const normals = calculateNormals(positions, indices);
 * @category Graphics
 */
export function calculateNormals(positions: ArrayLike<number>, indices: ArrayLike<number>): number[];
/**
 * Generates tangent information from the specified positions, normals, texture coordinates and
 * triangle indices.
 *
 * @param {ArrayLike<number>} positions - An array of 3-dimensional vertex positions.
 * @param {ArrayLike<number>} normals - An array of 3-dimensional vertex normals.
 * @param {ArrayLike<number>} uvs - An array of 2-dimensional vertex texture coordinates.
 * @param {ArrayLike<number>} indices - An array of triangle indices.
 * @returns {number[]} An array of 3-dimensional vertex tangents.
 * @example
 * const tangents = calculateTangents(positions, normals, uvs, indices);
 * @category Graphics
 */
export function calculateTangents(positions: ArrayLike<number>, normals: ArrayLike<number>, uvs: ArrayLike<number>, indices: ArrayLike<number>): number[];
