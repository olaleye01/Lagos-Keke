import { Quat } from "../../../core/math/quat.js";
import { Vec3 } from "../../../core/math/vec3.js";
import { BODYTYPE_DYNAMIC } from "../rigid-body/constants.js";
const _position = new Vec3();
const _rotation = new Quat();
class Trigger {
	constructor(app, component) {
		this.entity = component.entity;
		this.component = component;
		this.app = app;
		this.initialize();
	}
	initialize() {
		const entity = this.entity;
		const shape = this.component.shape;
		const world = this.app.systems.rigidbody.physicsWorld;
		if (shape && world) {
			if (entity.trigger) {
				entity.trigger.destroy();
			}
			this._getEntityTransform(_position, _rotation);
			const body = world.createBody({
				type: BODYTYPE_DYNAMIC,
				mass: 1,
				shape,
				position: _position,
				rotation: _rotation,
				entity,
				noContactResponse: true
			});
			body.setRestitution(0);
			body.setFriction(0);
			body.setDamping(0, 0);
			body.setLinearFactor(Vec3.ZERO);
			body.setAngularFactor(Vec3.ZERO);
			this.body = body;
			if (this.component.enabled && entity.enabled) {
				this.enable();
			}
		}
	}
	destroy() {
		if (!this.body) return;
		this.disable();
		this.app.systems.rigidbody.physicsWorld.destroyBody(this.body);
		this.body = null;
	}
	_getEntityTransform(position, rotation) {
		position.copy(this.component.getShapePosition());
		rotation.copy(this.component.getShapeRotation());
	}
	updateTransform() {
		this._getEntityTransform(_position, _rotation);
		this.body.setTransform(_position, _rotation);
	}
	enable() {
		if (!this.body) return;
		this.app.systems.rigidbody.addTrigger(this);
		this.updateTransform();
	}
	disable() {
		if (!this.body) return;
		this.app.systems.rigidbody.removeTrigger(this);
	}
}
export {
	Trigger
};
