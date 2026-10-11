class LayerRenderStep {
	cameraComponent;
	layer;
	transparent;
	renderTarget;
	lightClusters = null;
	// clear flags
	clearColor = false;
	clearDepth = false;
	clearStencil = false;
	// true if this is the first render step using its camera
	firstCameraUse = false;
	// true if this is the last render step using its camera
	lastCameraUse = false;
	constructor(cameraComponent, layer, transparent, renderTarget) {
		this.cameraComponent = cameraComponent;
		this.layer = layer;
		this.transparent = transparent;
		this.renderTarget = renderTarget;
	}
	setupClears(cameraComponent, layer) {
		this.clearColor = cameraComponent?.clearColorBuffer || layer.clearColorBuffer;
		this.clearDepth = cameraComponent?.clearDepthBuffer || layer.clearDepthBuffer;
		this.clearStencil = cameraComponent?.clearStencilBuffer || layer.clearStencilBuffer;
	}
}
export {
	LayerRenderStep
};
