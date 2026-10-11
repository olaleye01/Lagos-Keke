/**
 * @import { PhysicsJointSettings } from './physics-world.js'
 */
/**
 * The base class for a joint (constraint) owned by a {@link PhysicsWorld}. Backends subclass
 * it and override every method. The base implementation is inert: parameter updates do nothing
 * and the joint never breaks.
 *
 * @ignore
 */
export class PhysicsJoint {
    /**
     * The backend-native constraint object - btTypedConstraint when the Ammo backend is
     * active, null otherwise. Surfaced by JointComponent#constraint.
     *
     * @type {object|null}
     */
    nativeJoint: object | null;
    /**
     * Applies the limit-related settings for the joint's type.
     *
     * @param {PhysicsJointSettings} settings - The joint parameter bag.
     * @returns {boolean} True if the joint's type supports limits and they were applied.
     */
    updateLimits(settings: PhysicsJointSettings): boolean;
    /**
     * Applies the motor-related settings for the joint's type.
     *
     * @param {PhysicsJointSettings} settings - The joint parameter bag.
     * @returns {boolean} True if the joint's type supports a motor and it was applied.
     */
    updateMotor(settings: PhysicsJointSettings): boolean;
    /**
     * Applies the spring-related settings for the joint's type.
     *
     * @param {PhysicsJointSettings} settings - The joint parameter bag.
     * @returns {boolean} True if the joint's type supports springs and they were applied.
     */
    updateSpring(settings: PhysicsJointSettings): boolean;
    /**
     * Sets the impulse threshold above which the joint breaks. Infinity makes the joint
     * unbreakable.
     *
     * @param {number} impulse - The break impulse threshold.
     */
    setBreakImpulse(impulse: number): void;
    /**
     * Returns whether the joint broke during simulation, or null when the backend cannot
     * determine it - the caller then falls back to its own heuristic.
     *
     * @returns {boolean|null} True if broken, false if intact, null if undeterminable.
     */
    isBroken(): boolean | null;
}
import type { PhysicsJointSettings } from './physics-world.js';
