import { Mat4 } from "../../../core/math/mat4.js";
import { Vec2 } from "../../../core/math/vec2.js";
import { Vec3 } from "../../../core/math/vec3.js";
import { GraphNode } from "../../../scene/graph-node.js";
import { Component } from "../component.js";
import { BODYTYPE_DYNAMIC } from "../rigid-body/constants.js";
import {
	JOINTTYPE_6DOF,
	JOINTTYPE_BALL,
	JOINTTYPE_FIXED,
	JOINTTYPE_HINGE,
	JOINTTYPE_SLIDER,
	MOTION_LOCKED
} from "./constants.js";
const _mat = new Mat4();
const _jointMat = new Mat4();
const _frameMatA = new Mat4();
const _frameMatB = new Mat4();
const _vec3 = new Vec3();
const _vec3b = new Vec3();
const _jointTypes = /* @__PURE__ */ new Set([JOINTTYPE_FIXED, JOINTTYPE_BALL, JOINTTYPE_HINGE, JOINTTYPE_SLIDER, JOINTTYPE_6DOF]);
const _breakSeparation = 0.2;
function setVec2(target, value) {
	const x = value instanceof Vec2 ? value.x : value[0];
	const y = value instanceof Vec2 ? value.y : value[1];
	if (target.x !== x || target.y !== y) {
		target.set(x, y);
		return true;
	}
	return false;
}
function setVec3(target, value) {
	const x = value instanceof Vec3 ? value.x : value[0];
	const y = value instanceof Vec3 ? value.y : value[1];
	const z = value instanceof Vec3 ? value.z : value[2];
	if (target.x !== x || target.y !== y || target.z !== z) {
		target.set(x, y, z);
		return true;
	}
	return false;
}
class JointComponent extends Component {
	static EVENT_BREAK = "break";
	_joint = null;
	_type = JOINTTYPE_FIXED;
	_entityA = null;
	_entityB = null;
	_enableCollision = false;
	_breakImpulse = Infinity;
	_broken = false;
	_initialized = false;
	// hinge, slider and ball
	_enableLimits = false;
	_limits = new Vec2(-45, 45);
	_motorSpeed = 0;
	_maxMotorForce = 0;
	_swingLimitY = 45;
	_swingLimitZ = 45;
	_twistLimit = 20;
	// 6dof
	_linearMotionX = MOTION_LOCKED;
	_linearMotionY = MOTION_LOCKED;
	_linearMotionZ = MOTION_LOCKED;
	_linearLimitsX = new Vec2();
	_linearLimitsY = new Vec2();
	_linearLimitsZ = new Vec2();
	_linearStiffness = new Vec3();
	_linearDamping = new Vec3(1, 1, 1);
	_linearEquilibrium = new Vec3();
	_angularMotionX = MOTION_LOCKED;
	_angularMotionY = MOTION_LOCKED;
	_angularMotionZ = MOTION_LOCKED;
	_angularLimitsX = new Vec2();
	_angularLimitsY = new Vec2();
	_angularLimitsZ = new Vec2();
	_angularStiffness = new Vec3();
	_angularDamping = new Vec3(1, 1, 1);
	_angularEquilibrium = new Vec3();
	// event bookkeeping
	_evtEntityADestroy = null;
	_evtEntityBDestroy = null;
	_evtSimEnabledA = null;
	_evtSimEnabledB = null;
	_evtBodyTeardown = [];
	// joint frame anchors captured at constraint creation, used for break detection on ammo
	// builds that expose no constraint state
	_anchorA = new Vec3();
	_anchorB = new Vec3();
	_axisA = new Vec3();
	set type(type) {
		if (this._type !== type) {
			if (!_jointTypes.has(type)) {
				return;
			}
			this._destroyConstraint();
			this._broken = false;
			this._type = type;
			this._tryCreateConstraint();
		}
	}
	get type() {
		return this._type;
	}
	set entityA(arg) {
		this._setJointEntity("_entityA", "_evtEntityADestroy", arg);
	}
	get entityA() {
		return this._entityA;
	}
	set entityB(arg) {
		this._setJointEntity("_entityB", "_evtEntityBDestroy", arg);
	}
	get entityB() {
		return this._entityB;
	}
	set enableCollision(enableCollision) {
		if (this._enableCollision !== enableCollision) {
			this._destroyConstraint();
			this._enableCollision = enableCollision;
			this._tryCreateConstraint();
		}
	}
	get enableCollision() {
		return this._enableCollision;
	}
	set breakImpulse(impulse) {
		if (this._breakImpulse !== impulse) {
			this._breakImpulse = impulse;
			const joint = this._joint;
			if (joint) {
				joint.setBreakImpulse(impulse);
				if (Number.isFinite(impulse)) {
					this.system._breakable.add(this);
				} else {
					this.system._breakable.delete(this);
				}
			}
		}
	}
	get breakImpulse() {
		return this._breakImpulse;
	}
	get constraint() {
		return this._joint ? this._joint.nativeJoint : null;
	}
	get isBroken() {
		return this._broken;
	}
	set enableLimits(arg) {
		if (this._enableLimits !== arg) {
			this._enableLimits = arg;
			this._updateLimits();
		}
	}
	get enableLimits() {
		return this._enableLimits;
	}
	set limits(arg) {
		if (setVec2(this._limits, arg)) {
			this._updateLimits();
		}
	}
	get limits() {
		return this._limits;
	}
	set motorSpeed(arg) {
		if (this._motorSpeed !== arg) {
			this._motorSpeed = arg;
			this._updateMotor();
		}
	}
	get motorSpeed() {
		return this._motorSpeed;
	}
	set maxMotorForce(arg) {
		if (this._maxMotorForce !== arg) {
			this._maxMotorForce = arg;
			this._updateMotor();
		}
	}
	get maxMotorForce() {
		return this._maxMotorForce;
	}
	set swingLimitY(arg) {
		if (this._swingLimitY !== arg) {
			this._swingLimitY = arg;
			this._updateLimits();
		}
	}
	get swingLimitY() {
		return this._swingLimitY;
	}
	set swingLimitZ(arg) {
		if (this._swingLimitZ !== arg) {
			this._swingLimitZ = arg;
			this._updateLimits();
		}
	}
	get swingLimitZ() {
		return this._swingLimitZ;
	}
	set twistLimit(arg) {
		if (this._twistLimit !== arg) {
			this._twistLimit = arg;
			this._updateLimits();
		}
	}
	get twistLimit() {
		return this._twistLimit;
	}
	set linearMotionX(arg) {
		if (this._linearMotionX !== arg) {
			this._linearMotionX = arg;
			this._updateLimits();
		}
	}
	get linearMotionX() {
		return this._linearMotionX;
	}
	set linearMotionY(arg) {
		if (this._linearMotionY !== arg) {
			this._linearMotionY = arg;
			this._updateLimits();
		}
	}
	get linearMotionY() {
		return this._linearMotionY;
	}
	set linearMotionZ(arg) {
		if (this._linearMotionZ !== arg) {
			this._linearMotionZ = arg;
			this._updateLimits();
		}
	}
	get linearMotionZ() {
		return this._linearMotionZ;
	}
	set linearLimitsX(arg) {
		if (setVec2(this._linearLimitsX, arg)) {
			this._updateLimits();
		}
	}
	get linearLimitsX() {
		return this._linearLimitsX;
	}
	set linearLimitsY(arg) {
		if (setVec2(this._linearLimitsY, arg)) {
			this._updateLimits();
		}
	}
	get linearLimitsY() {
		return this._linearLimitsY;
	}
	set linearLimitsZ(arg) {
		if (setVec2(this._linearLimitsZ, arg)) {
			this._updateLimits();
		}
	}
	get linearLimitsZ() {
		return this._linearLimitsZ;
	}
	set linearStiffness(arg) {
		if (setVec3(this._linearStiffness, arg)) {
			this._updateSpring();
		}
	}
	get linearStiffness() {
		return this._linearStiffness;
	}
	set linearDamping(arg) {
		if (setVec3(this._linearDamping, arg)) {
			this._updateSpring();
		}
	}
	get linearDamping() {
		return this._linearDamping;
	}
	set linearEquilibrium(arg) {
		if (setVec3(this._linearEquilibrium, arg)) {
			this._updateSpring();
		}
	}
	get linearEquilibrium() {
		return this._linearEquilibrium;
	}
	set angularMotionX(arg) {
		if (this._angularMotionX !== arg) {
			this._angularMotionX = arg;
			this._updateLimits();
		}
	}
	get angularMotionX() {
		return this._angularMotionX;
	}
	set angularMotionY(arg) {
		if (this._angularMotionY !== arg) {
			this._angularMotionY = arg;
			this._updateLimits();
		}
	}
	get angularMotionY() {
		return this._angularMotionY;
	}
	set angularMotionZ(arg) {
		if (this._angularMotionZ !== arg) {
			this._angularMotionZ = arg;
			this._updateLimits();
		}
	}
	get angularMotionZ() {
		return this._angularMotionZ;
	}
	set angularLimitsX(arg) {
		if (setVec2(this._angularLimitsX, arg)) {
			this._updateLimits();
		}
	}
	get angularLimitsX() {
		return this._angularLimitsX;
	}
	set angularLimitsY(arg) {
		if (setVec2(this._angularLimitsY, arg)) {
			this._updateLimits();
		}
	}
	get angularLimitsY() {
		return this._angularLimitsY;
	}
	set angularLimitsZ(arg) {
		if (setVec2(this._angularLimitsZ, arg)) {
			this._updateLimits();
		}
	}
	get angularLimitsZ() {
		return this._angularLimitsZ;
	}
	set angularStiffness(arg) {
		if (setVec3(this._angularStiffness, arg)) {
			this._updateSpring();
		}
	}
	get angularStiffness() {
		return this._angularStiffness;
	}
	set angularDamping(arg) {
		if (setVec3(this._angularDamping, arg)) {
			this._updateSpring();
		}
	}
	get angularDamping() {
		return this._angularDamping;
	}
	set angularEquilibrium(arg) {
		if (setVec3(this._angularEquilibrium, arg)) {
			this._updateSpring();
		}
	}
	get angularEquilibrium() {
		return this._angularEquilibrium;
	}
	refreshFrames() {
		this._destroyConstraint();
		this._broken = false;
		this._tryCreateConstraint();
	}
	_setJointEntity(prop, evtProp, arg) {
		let entity;
		if (arg instanceof GraphNode) {
			entity = arg;
		} else if (typeof arg === "string") {
			entity = this.system.app.getEntityFromIndex(arg) ?? null;
		} else {
			entity = null;
		}
		if (this[prop] === entity) {
			return;
		}
		this._destroyConstraint();
		this[evtProp]?.off();
		this[evtProp] = null;
		this[prop] = entity;
		if (entity) {
			this[evtProp] = entity.once("destroy", () => {
				this[evtProp] = null;
				this[prop] = null;
				this._destroyConstraint();
			});
		}
		this._broken = false;
		this._tryCreateConstraint();
	}
	_isBodyReady(entity) {
		const rigidbody = entity.rigidbody;
		return !!(rigidbody && rigidbody._body && rigidbody._simulationEnabled);
	}
	_subscribeBodyAvailable() {
		if (!this._evtSimEnabledA && this._entityA?.rigidbody) {
			this._evtSimEnabledA = this._entityA.rigidbody.once("simulationenabled", this._onBodyAvailable, this);
		}
		if (!this._evtSimEnabledB && this._entityB?.rigidbody) {
			this._evtSimEnabledB = this._entityB.rigidbody.once("simulationenabled", this._onBodyAvailable, this);
		}
	}
	_clearBodyAvailableSubscriptions() {
		this._evtSimEnabledA?.off();
		this._evtSimEnabledA = null;
		this._evtSimEnabledB?.off();
		this._evtSimEnabledB = null;
	}
	_onBodyAvailable() {
		this._clearBodyAvailableSubscriptions();
		this._tryCreateConstraint();
	}
	_onBodyLost() {
		this._destroyConstraint();
		this._tryCreateConstraint();
	}
	_tryCreateConstraint() {
		const system = this.system;
		if (this._joint || !this._initialized || !this.enabled || !this.entity.enabled || this._broken || !this._entityA || this._entityA === this._entityB) {
			system._pending.delete(this);
			this._clearBodyAvailableSubscriptions();
			return;
		}
		if (!this._isBodyReady(this._entityA) || this._entityB && !this._isBodyReady(this._entityB)) {
			system._pending.add(this);
			this._subscribeBodyAvailable();
			return;
		}
		system._pending.delete(this);
		this._clearBodyAvailableSubscriptions();
		this._createConstraint();
	}
	_createFrame(bodyEntity, anchor, axis, frame) {
		_jointMat.setTRS(this.entity.getPosition(), this.entity.getRotation(), Vec3.ONE);
		if (bodyEntity) {
			_mat.setTRS(bodyEntity.getPosition(), bodyEntity.getRotation(), Vec3.ONE);
			_mat.invert();
			_mat.mul(_jointMat);
		} else {
			_mat.copy(_jointMat);
		}
		_mat.getTranslation(_vec3);
		anchor.copy(_vec3);
		_mat.getX(axis).normalize();
		frame.copy(_mat);
	}
	_createConstraint() {
		const entityA = this._entityA;
		const entityB = this._entityB;
		const rigidbodyA = entityA.rigidbody;
		const rigidbodyB = entityB ? entityB.rigidbody : null;
		this._createFrame(entityA, this._anchorA, this._axisA, _frameMatA);
		this._createFrame(entityB, this._anchorB, _vec3b, _frameMatB);
		const world = this.system.app.systems.rigidbody.physicsWorld;
		this._joint = world.createJoint({
			type: this._type,
			bodyA: rigidbodyA._body,
			bodyB: rigidbodyB ? rigidbodyB._body : null,
			frameA: _frameMatA,
			frameB: _frameMatB,
			enableCollision: this._enableCollision,
			settings: this
		});
		if (Number.isFinite(this._breakImpulse)) {
			this.system._breakable.add(this);
		}
		this._evtBodyTeardown.push(
			rigidbodyA.on("simulationdisabled", this._onBodyLost, this),
			rigidbodyA.on("beforeremove", this._onBodyLost, this)
		);
		if (rigidbodyB) {
			this._evtBodyTeardown.push(
				rigidbodyB.on("simulationdisabled", this._onBodyLost, this),
				rigidbodyB.on("beforeremove", this._onBodyLost, this)
			);
		}
		this._activateBodies();
	}
	_destroyConstraint() {
		this.system._pending.delete(this);
		this._clearBodyAvailableSubscriptions();
		const joint = this._joint;
		if (joint) {
			this.system._breakable.delete(this);
			for (let i = 0; i < this._evtBodyTeardown.length; i++) {
				this._evtBodyTeardown[i].off();
			}
			this._evtBodyTeardown.length = 0;
			this.system.app.systems.rigidbody.physicsWorld.destroyJoint(joint);
			this._joint = null;
			this._activateBodies();
		}
	}
	_isAnchorSeparated() {
		if (this._type === JOINTTYPE_6DOF) {
			return false;
		}
		const entityA = this._entityA;
		_mat.setTRS(entityA.getPosition(), entityA.getRotation(), Vec3.ONE);
		_mat.transformPoint(this._anchorA, _vec3);
		const entityB = this._entityB;
		if (entityB) {
			_jointMat.setTRS(entityB.getPosition(), entityB.getRotation(), Vec3.ONE);
			_jointMat.transformPoint(this._anchorB, _vec3b);
		} else {
			_vec3b.copy(this._anchorB);
		}
		_vec3b.sub(_vec3);
		if (this._type === JOINTTYPE_SLIDER) {
			_mat.transformVector(this._axisA, _vec3);
			const slide = _vec3b.dot(_vec3);
			_vec3b.sub(_vec3.mulScalar(slide));
		}
		return _vec3b.lengthSq() > _breakSeparation * _breakSeparation;
	}
	_checkBroken() {
		const joint = this._joint;
		if (!joint) {
			return;
		}
		let broken = joint.isBroken();
		if (broken === null) {
			broken = this._isAnchorSeparated();
		}
		if (broken) {
			this._broken = true;
			this._destroyConstraint();
			this.fire("break");
		}
	}
	_activateBodies() {
		this._entityA?.rigidbody?.activate();
		this._entityB?.rigidbody?.activate();
	}
	_updateLimits() {
		if (this._joint && this._joint.updateLimits(this)) {
			this._activateBodies();
		}
	}
	_updateMotor() {
		if (this._joint && this._joint.updateMotor(this)) {
			this._activateBodies();
		}
	}
	_updateSpring() {
		if (this._joint && this._joint.updateSpring(this)) {
			this._activateBodies();
		}
	}
	onEnable() {
		this._broken = false;
		this._tryCreateConstraint();
	}
	onDisable() {
		this._destroyConstraint();
	}
	onBeforeRemove() {
		this._destroyConstraint();
		this._evtEntityADestroy?.off();
		this._evtEntityADestroy = null;
		this._evtEntityBDestroy?.off();
		this._evtEntityBDestroy = null;
	}
	resolveDuplicatedEntityReferenceProperties(oldJoint, duplicatedIdsMap) {
		if (oldJoint.entityA) {
			const newEntityA = duplicatedIdsMap[oldJoint.entityA.guid];
			if (newEntityA) {
				this.entityA = newEntityA;
			}
		}
		if (oldJoint.entityB) {
			const newEntityB = duplicatedIdsMap[oldJoint.entityB.guid];
			if (newEntityB) {
				this.entityB = newEntityB;
			}
		}
	}
}
export {
	JointComponent
};
