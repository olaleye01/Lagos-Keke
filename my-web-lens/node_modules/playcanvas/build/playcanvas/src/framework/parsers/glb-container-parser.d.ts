export class GlbContainerParser {
    constructor(device: any, assets: any);
    _device: any;
    _assets: any;
    _defaultMaterial: import("../../index.js").StandardMaterial;
    canParse(): boolean;
    _getUrlWithoutParams(url: any): any;
    load(url: any, callback: any, asset: any): void;
    open(url: any, data: any, asset: any): any;
    patch(asset: any, assets: any): void;
}
