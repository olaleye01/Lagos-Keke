class RenderAction {
	// {CameraComponent|null}
	camera = null;
	constructor() {
		this.layer = null;
		this.transparent = false;
		this.renderTarget = null;
		this.clearColor = false;
		this.clearDepth = false;
		this.clearStencil = false;
		this.triggerPostprocess = false;
		this.firstCameraUse = false;
		this.lastCameraUse = false;
		this.useCameraPasses = false;
	}
	setupClears(camera, layer) {
		this.clearColor = camera?.clearColorBuffer || layer.clearColorBuffer;
		this.clearDepth = camera?.clearDepthBuffer || layer.clearDepthBuffer;
		this.clearStencil = camera?.clearStencilBuffer || layer.clearStencilBuffer;
	}
}
export {
	RenderAction
};
