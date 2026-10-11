import { ComponentSystem } from "../system.js";
import { JointComponent } from "./component.js";
const _properties = [
	"type",
	"enableCollision",
	"breakImpulse",
	"enableLimits",
	"limits",
	"motorSpeed",
	"maxMotorForce",
	"swingLimitY",
	"swingLimitZ",
	"twistLimit",
	"linearMotionX",
	"linearMotionY",
	"linearMotionZ",
	"linearLimitsX",
	"linearLimitsY",
	"linearLimitsZ",
	"linearStiffness",
	"linearDamping",
	"linearEquilibrium",
	"angularMotionX",
	"angularMotionY",
	"angularMotionZ",
	"angularLimitsX",
	"angularLimitsY",
	"angularLimitsZ",
	"angularStiffness",
	"angularDamping",
	"angularEquilibrium",
	// entity references are assigned last so the constraint is created with full configuration
	"entityA",
	"entityB"
];
class JointComponentSystem extends ComponentSystem {
	_pending = /* @__PURE__ */ new Set();
	_breakable = /* @__PURE__ */ new Set();
	constructor(app) {
		super(app);
		this.id = "joint";
		this.ComponentType = JointComponent;
		this.on("beforeremove", this.onBeforeRemove, this);
		this.app.systems.on("update", this.onUpdate, this);
		this.app.systems.on("postUpdate", this.onPostUpdate, this);
	}
	initializeComponentData(component, data, properties) {
		for (let i = 0; i < _properties.length; i++) {
			const property = _properties[i];
			if (data[property] !== void 0) {
				component[property] = data[property];
			}
		}
		component._initialized = true;
		super.initializeComponentData(component, data);
	}
	cloneComponent(entity, clone) {
		const c = entity.joint;
		const data = {
			enabled: c.enabled
		};
		for (let i = 0; i < _properties.length; i++) {
			const property = _properties[i];
			data[property] = c[property];
		}
		return this.addComponent(clone, data);
	}
	onBeforeRemove(entity, component) {
		component.onBeforeRemove();
	}
	onUpdate(dt) {
		for (const component of this._pending) {
			component._tryCreateConstraint();
		}
	}
	onPostUpdate(dt) {
		for (const component of this._breakable) {
			component._checkBroken();
		}
	}
	destroy() {
		super.destroy();
		this.app.systems.off("update", this.onUpdate, this);
		this.app.systems.off("postUpdate", this.onPostUpdate, this);
	}
}
export {
	JointComponentSystem
};
