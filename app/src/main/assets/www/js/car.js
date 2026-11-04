import * as THREE from '../vendor/three.module.js';
import { buildVehicleModel } from './models.js';
import { OBB2, DeformationEngine } from './collision.js';
import { clamp, damp, disposeObject, TAU } from './util.js';

const EMPTY_OBB = new OBB2(0, 0, 1, 1, 0);

export class Car {
    constructor({ data, scene, position, yaw, isPlayer = false }) {
        this.data = data;
        this.stats = data.stats;
        this.isPlayer = isPlayer;
        this.scene = scene;

        this.model = buildVehicleModel(data);
        this.group = this.model.group;
        this.group.rotation.order = 'YXZ';
        this.group.position.copy(position);
        this.group.rotation.y = yaw;
        this.group.updateMatrixWorld(true);
        scene.add(this.group);

        this.yaw = yaw;
        this.yawRate = 0;
        this.steer = 0;
        this.velocity = new THREE.Vector3();
        this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
        this.damage = 0;
        this.lastImpactAt = -10;
        this.wheelPinned = false;
        this.airborne = false;
        this.onRamp = false;
        this.groundHeight = 0;
        this.rampSlopeForward = 0;
        this.verticalSpeed = 0;
        this.y = position.y;
        this.wheelSpin = 0;
        this.absPhase = 0;
        this.absPulse = true;
        this.tcActive = false;
        this.espActive = false;
        this.absActive = false;
        this.forwardSpeed = 0;
        this.lateralSpeed = 0;
        this.rpm = 900;
        this.gear = 'N';
        this.pendingLanding = 0;
        this.onLanding = null;
        this.lastAcceleration = 0;

        this.maxSpeed = this.stats.topSpeedKph / 3.6;
        this.reverseMaxSpeed = 14;
        this.engineAccel = 3.0 + (this.stats.powerKw / this.stats.massKg) * 3.7;
        this.reverseAccel = Math.max(2.4, this.engineAccel * 0.54);
        this.brakeAccel = this.stats.braking * 1.12;
        this.turnRate = 0.7 + this.stats.handling * 0.33;
        this.dragCoefficient = 0.000052;
        this.boundingRadius = Math.max(this.model.dimensions.width, this.model.dimensions.length) * 0.48;

        this.forward = new THREE.Vector3();
        this.right = new THREE.Vector3();
        this.tempVelocity = new THREE.Vector3();
        this.wheelSpinVisual = 0;
    }

    get speedKph() {
        return this.velocity.length() * 3.6;
    }

    get lateralG() {
        return this.lateralSpeed / 9.81;
    }

    get slipKph() {
        return Math.abs(this.lateralSpeed) * 3.6;
    }

    get obb() {
        const position = this.group.position;
        return new OBB2(
            position.x,
            position.z,
            this.model.dimensions.width * 0.5,
            this.model.dimensions.length * 0.5,
            this.yaw
        );
    }

    setControls(controls) {
        this.controls.throttle = controls.throttle ?? 0;
        this.controls.brake = controls.brake ?? 0;
        this.controls.steer = controls.steer ?? 0;
        this.controls.handbrake = Boolean(controls.handbrake);
    }

    step(dt, systems, world, now) {
        this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

        const surface = world.getSurfaceAt(this.group.position.x, this.group.position.z);
        let forwardSpeed = this.velocity.dot(this.forward);
        let lateralSpeed = this.velocity.dot(this.right);
        let acceleration = 0;
        let braking = false;
        let tcActive = false;
        let espActive = false;
        let absActive = false;
        let absPulse = true;
        const speedAbs = Math.abs(forwardSpeed);
        const throttle = this.controls.throttle;
        const brake = this.controls.brake;

        this.steer = damp(this.steer, clamp(this.controls.steer, -1, 1), 9, dt);

        if (!this.airborne) {
            if (throttle > 0) {
                const speedRatio = clamp(Math.max(0, forwardSpeed) / this.maxSpeed, 0, 1);
                acceleration += throttle * this.engineAccel * (0.42 + 0.58 * (1 - speedRatio));
            }

            if (brake > 0) {
                if (forwardSpeed > 0.5) {
                    braking = true;
                    const demand = this.brakeAccel;
                    if (systems.abs && brake > 0.7 && speedAbs > 4) {
                        absActive = true;
                        this.absPhase += dt;
                        const pulse = Math.sin(this.absPhase * TAU * 10.5) > -0.35;
                        absPulse = pulse;
                        acceleration -= demand * (pulse ? 0.82 : 0.16);
                    } else {
                        acceleration -= demand;
                    }
                } else if (forwardSpeed > -this.reverseMaxSpeed) {
                    acceleration -= brake * this.reverseAccel;
                }
            }

            if (this.controls.handbrake) {
                acceleration -= Math.sign(forwardSpeed) * Math.min(5, 1.3 + speedAbs * 1.9);
            }

            const slip = Math.abs(lateralSpeed);
            const wheelSpin = throttle * clamp(1 - Math.max(0, forwardSpeed) / 11, 0, 1);
            tcActive = systems.tc && throttle > 0.1 && (slip > 2.2 || wheelSpin > 0.42);
            if (tcActive) {
                acceleration *= 0.74;
                lateralSpeed *= Math.exp(-5.8 * dt);
            }

            const drag = this.dragCoefficient * speedAbs * speedAbs;
            acceleration -= Math.sign(forwardSpeed) * drag;
            acceleration -= Math.sign(forwardSpeed) * (0.38 + speedAbs * 0.008) * (speedAbs > 0.05 ? 1 : 0);

            forwardSpeed += acceleration * dt;
            if (Math.abs(forwardSpeed) < 0.09 && throttle === 0 && brake === 0) forwardSpeed = 0;
            forwardSpeed = clamp(forwardSpeed, -this.reverseMaxSpeed, this.maxSpeed);

            const slipAngle = Math.atan2(lateralSpeed, Math.max(4, Math.abs(forwardSpeed)));
            if (systems.esp && speedAbs > 5) {
                espActive = Math.abs(slipAngle) > 0.085
                    && (Math.abs(this.steer) > 0.08 || Math.abs(lateralSpeed) > 2.4);
                if (espActive) {
                    lateralSpeed -= Math.sign(lateralSpeed) * Math.min(Math.abs(lateralSpeed) * 3.1, 9) * dt;
                    forwardSpeed *= 1 - 0.06 * dt;
                    this.yawRate *= Math.exp(-2.2 * dt);
                }
            }

            let grip = this.stats.grip * surface.grip * 4.8;
            if (systems.esp) grip *= 1.08;
            if (this.controls.handbrake) grip *= 0.24;
            lateralSpeed *= Math.exp(-grip * dt);

            const speedFactor = clamp(speedAbs / 6.5, 0, 1);
            const speedSteer = 1 - clamp(speedAbs / this.maxSpeed, 0, 1) * 0.42;
            const damageSteer = 1 - clamp(this.damage / 100, 0, 1) * 0.34;
            let targetYawRate = this.steer * this.turnRate * speedFactor * speedSteer * damageSteer
                * Math.sign(forwardSpeed || 1);
            if (speedAbs < 0.3) targetYawRate = 0;
            const yawResponse = systems.esp ? 8.2 : 4.9;
            this.yawRate += (targetYawRate - this.yawRate) * Math.min(1, yawResponse * dt);
            this.yawRate = clamp(this.yawRate, -1.35, 1.35);
            this.yaw += this.yawRate * dt;
        } else {
            this.absPhase += dt;
            this.yawRate = damp(this.yawRate, 0, 0.55, dt);
            this.yaw += this.yawRate * dt + this.steer * 0.1 * dt;
        }

        this.velocity.copy(this.forward).multiplyScalar(forwardSpeed)
            .addScaledVector(this.right, lateralSpeed);

        this.group.position.x += this.velocity.x * dt;
        this.group.position.z += this.velocity.z * dt;

        const ground = world.getGroundInfo(this.group.position.x, this.group.position.z);
        const slopeAlongForward = ground.slopeZ * Math.cos(this.yaw);
        let landingSpeed = 0;

        if (this.airborne) {
            this.verticalSpeed -= 18 * dt;
            this.y += this.verticalSpeed * dt;
            if (this.y <= ground.height) {
                landingSpeed = Math.max(0, -this.verticalSpeed);
                this.y = ground.height;
                this.verticalSpeed = 0;
                this.airborne = false;
                this.onRamp = ground.onRamp;
                this.rampSlopeForward = slopeAlongForward;
            }
        } else if (this.onRamp && !ground.onRamp && Math.abs(forwardSpeed) > 4) {
            this.airborne = true;
            this.verticalSpeed = Math.max(0, forwardSpeed * this.rampSlopeForward);
            this.y = this.groundHeight;
        } else if (ground.height < this.groundHeight - 0.22 && Math.abs(forwardSpeed) > 2) {
            this.airborne = true;
            this.verticalSpeed = 0;
            this.y = this.groundHeight;
        } else {
            this.y = ground.height;
        }

        this.groundHeight = ground.height;
        this.onRamp = ground.onRamp;
        this.rampSlopeForward = slopeAlongForward;
        this.group.position.y = this.y;

        let pitchTarget = 0;
        if (this.airborne) {
            pitchTarget = -clamp(this.verticalSpeed * 0.011, -0.2, 0.22);
        } else {
            pitchTarget = -Math.atan(slopeAlongForward) - clamp(acceleration * 0.0017, -0.024, 0.024);
        }
        this.group.rotation.y = this.yaw;
        this.group.rotation.x = damp(this.group.rotation.x, pitchTarget, 8, dt);
        this.group.rotation.z = damp(
            this.group.rotation.z,
            clamp(this.steer * this.turnRate * 0.018 + lateralSpeed * 0.002, -0.09, 0.09),
            5.5,
            dt
        );

        this.forwardSpeed = forwardSpeed;
        this.lateralSpeed = lateralSpeed;
        this.lastAcceleration = acceleration;
        this.tcActive = tcActive;
        this.espActive = espActive;
        this.absActive = absActive;
        this.absPulse = absPulse;
        this.wheelPinned = this.damage > 82;
        this.updateWheelVisuals(dt, forwardSpeed, braking, systems);
        this.updateTelemetry(forwardSpeed, throttle, braking);

        if (landingSpeed > 0.01 && this.onLanding) {
            this.onLanding(landingSpeed, this);
        }

        if (landingSpeed > 5) {
            this.damage = clamp(this.damage + landingSpeed * 0.35, 0, 100);
        }

        if (now - this.lastImpactAt > 8 && this.damage < 100) {
            this.damage = Math.max(0, this.damage - dt * 0.015);
        }
    }

    updateWheelVisuals(dt, forwardSpeed, braking, systems) {
        const damageFactor = 1 - clamp(this.damage / 100, 0, 1) * 0.55;
        const steeringLimit = this.wheelPinned ? 0.16 : 0.52;
        for (const pivot of this.model.frontSteerPivots) {
            pivot.rotation.y = damp(
                pivot.rotation.y,
                this.steer * steeringLimit * damageFactor,
                12,
                dt
            );
        }

        let spinDelta = (forwardSpeed / this.model.wheelRadius) * dt;
        if (braking && (!this.absActive || (this.absActive && !this.absPulse)) && Math.abs(forwardSpeed) > 3) {
            spinDelta *= 0.035;
        }
        if (this.controls.handbrake) spinDelta *= 0.08;
        this.wheelSpin = (this.wheelSpin + spinDelta) % TAU;
        const misalignment = this.damage > 65 ? (this.damage - 65) * 0.0009 : 0;
        for (let i = 0; i < this.model.wheelSpinners.length; i++) {
            this.model.wheelSpinners[i].rotation.x = this.wheelSpin + misalignment * (i % 2 === 0 ? 1 : -1);
        }
    }

    updateTelemetry(forwardSpeed, throttle, braking) {
        const ratio = clamp(Math.abs(forwardSpeed) / this.maxSpeed, 0, 1);
        this.rpm = Math.round(
            880 + ratio * 5700 + throttle * 520 + (braking ? 180 : 0) + (this.airborne ? 420 : 0)
        );
        if (forwardSpeed < -0.35) {
            this.gear = 'R';
        } else if (Math.abs(forwardSpeed) < 0.35) {
            this.gear = 'N';
        } else {
            this.gear = String(clamp(1 + Math.floor(ratio * 6), 1, 6));
        }
    }

    applyImpact(contactWorld, inwardNormal, impactSpeed, now) {
        if (now - this.lastImpactAt < 0.12) return false;
        if (impactSpeed < 3.0) return false;
        const moved = DeformationEngine.deform(this, contactWorld, inwardNormal, impactSpeed);
        if (moved <= 0) return false;

        this.lastImpactAt = now;
        const massFactor = clamp(1500 / this.stats.massKg, 0.45, 1.35);
        this.damage = clamp(this.damage + impactSpeed * 0.86 * massFactor, 0, 100);
        this.wheelPinned = this.damage > 82;
        return true;
    }

    reset(position, yaw) {
        this.group.position.copy(position);
        this.yaw = yaw;
        this.yawRate = 0;
        this.steer = 0;
        this.velocity.set(0, 0, 0);
        this.damage = 0;
        this.lastImpactAt = -10;
        this.airborne = false;
        this.onRamp = false;
        this.groundHeight = position.y;
        this.verticalSpeed = 0;
        this.y = position.y;
        this.absPhase = 0;
        this.tcActive = false;
        this.espActive = false;
        this.absActive = false;
        this.group.rotation.set(0, yaw, 0);
        this.group.position.y = position.y;
        this.group.updateMatrixWorld(true);
    }

    dispose() {
        this.group.removeFromParent();
        disposeObject(this.group);
    }
}
