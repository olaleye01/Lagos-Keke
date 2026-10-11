var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class PhysicsJoint {
  constructor() {
    /**
     * The backend-native constraint object - btTypedConstraint when the Ammo backend is
     * active, null otherwise. Surfaced by JointComponent#constraint.
     *
     * @type {object|null}
     */
    __publicField(this, "nativeJoint", null);
  }
  /**
   * Applies the limit-related settings for the joint's type.
   *
   * @param {PhysicsJointSettings} settings - The joint parameter bag.
   * @returns {boolean} True if the joint's type supports limits and they were applied.
   */
  updateLimits(settings) {
    return false;
  }
  /**
   * Applies the motor-related settings for the joint's type.
   *
   * @param {PhysicsJointSettings} settings - The joint parameter bag.
   * @returns {boolean} True if the joint's type supports a motor and it was applied.
   */
  updateMotor(settings) {
    return false;
  }
  /**
   * Applies the spring-related settings for the joint's type.
   *
   * @param {PhysicsJointSettings} settings - The joint parameter bag.
   * @returns {boolean} True if the joint's type supports springs and they were applied.
   */
  updateSpring(settings) {
    return false;
  }
  /**
   * Sets the impulse threshold above which the joint breaks. Infinity makes the joint
   * unbreakable.
   *
   * @param {number} impulse - The break impulse threshold.
   */
  setBreakImpulse(impulse) {
  }
  /**
   * Returns whether the joint broke during simulation, or null when the backend cannot
   * determine it - the caller then falls back to its own heuristic.
   *
   * @returns {boolean|null} True if broken, false if intact, null if undeterminable.
   */
  isBroken() {
    return false;
  }
}
export {
  PhysicsJoint
};
