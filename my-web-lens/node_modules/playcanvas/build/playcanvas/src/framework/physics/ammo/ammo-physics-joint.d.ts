/**
 * An Ammo.js joint (btTypedConstraint).
 *
 * @ignore
 */
export class AmmoPhysicsJoint extends PhysicsJoint {
    /**
     * @param {AmmoPhysicsWorld} world - The owning world.
     * @param {string} type - The joint type.
     */
    constructor(world: AmmoPhysicsWorld, type: string);
    /**
     * @type {AmmoPhysicsWorld}
     * @private
     */
    private _world;
    /**
     * The joint type the native constraint was created with.
     *
     * @type {string}
     * @private
     */
    private _type;
    /**
     * The break impulse threshold, used by the applied-impulse break probe.
     *
     * @private
     */
    private _breakImpulse;
    updateLimits(settings: any): boolean;
    updateMotor(settings: any): boolean;
    updateSpring(settings: any): boolean;
    setBreakImpulse(impulse: any): void;
}
/**
 * @param {AmmoPhysicsWorld} world - The owning world.
 * @param {PhysicsJointDesc} desc - The joint descriptor.
 * @returns {AmmoPhysicsJoint} The new joint, added to the simulation.
 */
export function createJoint(world: AmmoPhysicsWorld, desc: PhysicsJointDesc): AmmoPhysicsJoint;
/**
 * @param {AmmoPhysicsWorld} world - The owning world.
 * @param {AmmoPhysicsJoint} joint - The joint to remove and destroy.
 */
export function destroyJoint(world: AmmoPhysicsWorld, joint: AmmoPhysicsJoint): void;
/**
 * Destroys the world's shared fixed anchor body, if it was ever created.
 *
 * @param {AmmoPhysicsWorld} world - The owning world.
 */
export function destroyFixedBody(world: AmmoPhysicsWorld): void;
import { PhysicsJoint } from '../physics-joint.js';
import type { AmmoPhysicsWorld } from './ammo-physics-world.js';
import type { PhysicsJointDesc } from '../physics-world.js';
