export class WorldClusters {
    constructor(device: any);
    /** @type {Texture} */
    clusterTexture: Texture;
    device: any;
    name: string;
    reportCount: number;
    boundsMin: Vec3;
    boundsMax: Vec3;
    boundsDelta: Vec3;
    _cells: Vec3;
    _cellsLimit: Vec3;
    set cells(value: Vec3);
    get cells(): Vec3;
    set maxCellLightCount(count: any);
    get maxCellLightCount(): any;
    _usedLights: ClusterLight[];
    lightsBuffer: LightsBuffer;
    /**
     * The lights stored in the cluster structure. The index of a light in this array matches its
     * index in the lights texture, and the index 0 is reserved for 'no light'. This is the array
     * used internally by the clustering and must not be modified.
     *
     * @type {ReadonlyArray<ClusterLight>}
     */
    get usedLights(): ReadonlyArray<ClusterLight>;
    _maxCellLightCount: any;
    _cellsDirty: boolean;
    set maxLights(count: number);
    get maxLights(): number;
    destroy(): void;
    releaseClusterTexture(): void;
    registerUniforms(device: any): void;
    _numClusteredLightsId: any;
    _clusterMaxCellsId: any;
    _clusterWorldTextureId: any;
    _clusterBoundsMinId: any;
    _clusterBoundsMinData: Float32Array<ArrayBuffer>;
    _clusterBoundsDeltaId: any;
    _clusterBoundsDeltaData: Float32Array<ArrayBuffer>;
    _clusterCellsCountByBoundsSizeId: any;
    _clusterCellsCountByBoundsSizeData: Float32Array<ArrayBuffer>;
    _clusterCellsDotId: any;
    _clusterCellsDotData: Int32Array<ArrayBuffer>;
    _clusterCellsMaxId: any;
    _clusterCellsMaxData: Int32Array<ArrayBuffer>;
    _clusterTextureWidthId: any;
    updateParams(lightingParams: any): void;
    updateCells(): void;
    clusters: Uint16Array<ArrayBuffer> | Uint8ClampedArray<ArrayBuffer>;
    counts: Int32Array<ArrayBuffer>;
    uploadTextures(): void;
    updateUniforms(): void;
    evalLightCellMinMax(clusteredLight: any, min: any, max: any): void;
    collectLights(lights: any): void;
    evaluateBounds(): void;
    updateClusters(lightingParams: any): void;
    update(lights: any, lightingParams?: any): void;
    activate(): void;
}
import type { Texture } from '../../platform/graphics/texture.js';
import { Vec3 } from '../../core/math/vec3.js';
declare class ClusterLight {
    light: any;
    min: Vec3;
    max: Vec3;
}
import { LightsBuffer } from './lights-buffer.js';
export {};
