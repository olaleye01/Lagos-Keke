class PhysicsJoint {
	nativeJoint = null;
	updateLimits(settings) {
		return false;
	}
	updateMotor(settings) {
		return false;
	}
	updateSpring(settings) {
		return false;
	}
	setBreakImpulse(impulse) {
	}
	isBroken() {
		return false;
	}
}
export {
	PhysicsJoint
};
