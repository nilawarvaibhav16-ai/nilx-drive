import * as THREE from '../vendor/three.module.js';
import { Car } from './car.js';
import { World } from './world.js';
import { OBB2 } from './collision.js';
import { ParticleField } from './particles.js';
import { InputController } from './input.js';
import {
    FIXED_STEP, MAX_SUBSTEPS, TAU, byId, clamp, damp, rand
} from './util.js';

function shortestAngle(from, to) {
    let delta = (to - from + Math.PI) % TAU;
    if (delta < 0) delta += TAU;
    return delta - Math.PI;
}

export class Game {
    constructor({ canvas, data, prefs, ui, initialVehicle, initialWorld }) {
        this.data = data;
        this.prefs = prefs;
        this.ui = ui;
        this.canvas = canvas;
        this.vehicle = initialVehicle;
        this.worldProfile = initialWorld;
        this.state = 'ready';

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            stencil: false,
            powerPreference: 'high-performance'
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.03;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x05080c, 1);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);
        this.camera.position.set(10, 5, 18);
        this.camLook = new THREE.Vector3();
        this.camInit = false;

        this.systems = {
            tc: prefs.systems.tc,
            esp: prefs.systems.esp,
            abs: prefs.systems.abs
        };
        this.input = new InputController();
        this.inputEnabled = false;
        this.particles = new ParticleField(this.scene);

        this.world = null;
        this.player = null;
        this.rival = null;
        this.impacts = 0;
        this.milestones = new Set();
        this.shake = 0;
        this.lastBigToast = -20;
        this.simTime = 0;
        this.accumulator = 0;
        this.lastTimestamp = performance.now();
        this.orbit = Math.PI * 0.78;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
        this.fps = 60;
        this.hudTimer = 0;
        this.cameraMode = 0;
        this.rivalTargets = [];
        this.rivalTargetIndex = 0;
        this.rivalStuckTime = 0;

        this.resize = this.resize.bind(this);
        window.addEventListener('resize', this.resize);
        this.resize();

        this.loadWorld(initialWorld, initialVehicle, true);
        this.frame = this.frame.bind(this);
        requestAnimationFrame(this.frame);
    }

    makeCar(vehicleData, spawn, isPlayer) {
        const car = new Car({
            data: vehicleData,
            scene: this.scene,
            position: spawn.position.clone(),
            yaw: spawn.yaw,
            isPlayer
        });
        car.onLanding = (speed) => this.handleLanding(car, speed);
        return car;
    }

    loadWorld(profile, vehicle, initial = false) {
        if (!profile?.playable) return;

        this.player?.dispose();
        this.rival?.dispose();
        this.world?.dispose();
        this.particles.clear();

        this.vehicle = vehicle;
        this.worldProfile = profile;
        this.world = new World(profile);
        this.world.attach(this.scene);

        const rivalData = byId(this.data.vehicles, this.data.featured?.rivalVehicleId)
            || this.data.vehicles.find((entry) => entry.chassis === 'sport')
            || this.data.vehicles[1];
        this.rivalVehicle = rivalData;

        this.player = this.makeCar(vehicle, this.world.spawnPlayer, true);
        this.rival = this.makeCar(rivalData, this.world.spawnRival, false);
        this.rivalTargets = this.buildRivalTargets();
        this.rivalTargetIndex = 0;
        this.rivalStuckTime = 0;
        this.impacts = 0;
        this.milestones.clear();
        this.shake = 0;
        this.simTime = 0;
        this.accumulator = 0;
        this.orbit = Math.PI * 0.78;
        this.camInit = false;
        this.camLook.set(
            this.player.group.position.x,
            this.player.group.position.y + 1,
            this.player.group.position.z
        );

        this.ui.setActiveWorld(profile);
        this.ui.setActiveVehicle(vehicle);
        this.ui.setSystems(this.systems);
        this.prefs.setSelection(vehicle.id, profile.id);

        if (!initial) {
            this.ui.toast(`${profile.name.toUpperCase()} // ${vehicle.name.toUpperCase()} DEPLOYED`, 'accent');
        }
    }

    start() {
        if (this.state === 'running' || this.ui.fatalVisible) return;
        this.state = 'running';
        this.lastTimestamp = performance.now();
        this.accumulator = 0;
        this.camInit = false;
        this.ui.enterGame();
        this.ui.toast(`${this.worldProfile.name.toUpperCase()} // SIMULATION LIVE`, 'accent');
    }

    pause() {
        if (this.state !== 'running' || this.ui.isOverlayOpen()) return;
        this.input.clear();
        this.ui.showPause(this.stats());
    }

    resume() {
        if (this.state !== 'running') return;
        this.ui.hidePause();
        this.input.clear();
        this.accumulator = 0;
    }

    openGarageFromPause() {
        this.ui.hidePause();
        this.ui.openSheet('garage');
    }

    restart() {
        if (this.state !== 'running' || !this.world) return;
        this.respawnCars();
        this.impacts = 0;
        this.milestones.clear();
        this.shake = 0;
        this.accumulator = 0;
        this.ui.hidePause();
        this.ui.closeSheets();
        this.ui.toast('RIG REBUILT // DEFORMATION RESET', 'accent');
    }

    respawnCars() {
        const world = this.world;
        this.player?.dispose();
        this.rival?.dispose();
        this.player = this.makeCar(this.vehicle, world.spawnPlayer, true);
        this.rival = this.makeCar(this.rivalVehicle, world.spawnRival, false);
        this.rivalTargetIndex = 0;
        this.rivalStuckTime = 0;
        this.simTime = 0;
        this.camInit = false;
    }

    deployVehicle(vehicle) {
        if (!vehicle || !this.world) return;
        this.vehicle = vehicle;
        this.player?.dispose();
        this.player = this.makeCar(vehicle, this.world.spawnPlayer, true);
        this.impacts = 0;
        this.milestones.clear();
        this.shake = 0;
        this.camInit = false;
        this.simTime = 0;
        this.accumulator = 0;
        this.ui.setActiveVehicle(vehicle);
        this.prefs.setSelection(vehicle.id, this.worldProfile.id);
        this.ui.toast(`${vehicle.name.toUpperCase()} DEPLOYED // ${vehicle.chassis === 'sport' ? 'EXOTIC' : 'DERBY'} CHASSIS`, 'accent');
    }

    deployWorld(profile) {
        if (!profile?.playable) return;
        this.loadWorld(profile, this.vehicle, false);
        this.ui.closeSheets();
    }

    setSystem(name, value) {
        if (!(name in this.systems)) return;
        this.systems[name] = Boolean(value);
        this.prefs.setSystem(name, Boolean(value));
        this.ui.toast(`${name.toUpperCase()} ${value ? 'ONLINE' : 'DISABLED'}`, value ? 'accent' : '');
    }

    toggleCamera() {
        this.cameraMode = (this.cameraMode + 1) % 2;
        this.ui.toast(this.cameraMode === 0 ? 'CHASE CAMERA' : 'WIDE CHASE CAMERA');
    }

    hostPause() {
        if (this.state === 'running') this.pause();
    }

    stats() {
        return {
            speedKph: this.player?.speedKph || 0,
            damage: this.player?.damage || 0,
            impacts: this.impacts
        };
    }

    quit() {
        if (window.NilxHost && typeof window.NilxHost.exitGame === 'function') {
            try {
                window.NilxHost.exitGame();
                return;
            } catch {
                // Fall through to the browser-friendly start screen.
            }
        }
        this.state = 'ready';
        this.ui.showStart();
        this.input.setEnabled(false);
        this.inputEnabled = false;
        this.camInit = false;
    }

    frame(timestamp) {
        this.frameHandle = requestAnimationFrame(this.frame);
        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        let dt = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;
        if (!Number.isFinite(dt) || dt < 0) dt = 0;
        dt = Math.min(dt, 0.12);
        this.orbit += dt * 0.17;

        const active = this.state === 'running'
            && !this.ui.isOverlayOpen()
            && !document.hidden;

        if (active !== this.inputEnabled) {
            this.input.setEnabled(active);
            this.inputEnabled = active;
        }

        if (active) {
            this.accumulator += dt;
            let steps = 0;
            while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
                this.simulate(FIXED_STEP);
                this.accumulator -= FIXED_STEP;
                steps++;
            }
            if (steps >= MAX_SUBSTEPS) this.accumulator = 0;
            this.particles.update(dt);
            this.shake = Math.max(0, this.shake - dt * 1.9);
        } else {
            this.accumulator = 0;
        }

        this.updateCamera(dt, active);
        this.renderer.render(this.scene, this.camera);

        this.fpsAcc += dt;
        this.fpsFrames++;
        if (this.fpsAcc >= 0.45) {
            this.fps = this.fpsFrames / this.fpsAcc;
            this.fpsAcc = 0;
            this.fpsFrames = 0;
        }

        if (this.player && this.state === 'running') {
            this.hudTimer += dt;
            if (this.hudTimer >= 0.075) {
                this.hudTimer = 0;
                this.pushTelemetry();
            }
        }
    }

    resize() {
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.85));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    updateCamera(dt, active) {
        const car = this.player;
        if (!car) return;

        if (this.state === 'ready') {
            const position = car.group.position;
            const radius = 8.8;
            const x = position.x + Math.sin(this.orbit) * radius;
            const z = position.z + Math.cos(this.orbit) * radius;
            this.camera.position.set(x, position.y + 3.5, z);
            this.camera.lookAt(position.x, position.y + 0.85, position.z);
            this.camera.fov = damp(this.camera.fov, 50, 2.2, dt);
            this.camera.updateProjectionMatrix();
            return;
        }

        if (!active) return;

        const forwardX = Math.sin(car.yaw);
        const forwardZ = Math.cos(car.yaw);
        const rightX = Math.cos(car.yaw);
        const rightZ = -Math.sin(car.yaw);
        const speedRatio = clamp(car.speedKph / 220, 0, 1);
        const wide = this.cameraMode === 1;
        const compact = window.innerHeight < 560;
        const distance = (wide ? 11.4 : 7.2)
            + speedRatio * (wide ? 2.6 : 1.7)
            + (compact ? 0.9 : 0);
        const height = (wide ? 4.3 : 2.9)
            + speedRatio * 0.75
            + (compact ? 0.28 : 0);

        const desiredX = car.group.position.x - forwardX * distance + rightX * 0.28;
        const desiredY = car.group.position.y + height;
        const desiredZ = car.group.position.z - forwardZ * distance + rightZ * 0.28;
        const lookAhead = compact ? (wide ? 3.2 : 2.7) : wide ? 4.2 : 5.6;
        const lookX = car.group.position.x + forwardX * lookAhead;
        const lookY = car.group.position.y + (compact ? 0.82 : 1.05);
        const lookZ = car.group.position.z + forwardZ * lookAhead;

        if (!this.camInit) {
            this.camera.position.set(desiredX, desiredY, desiredZ);
            this.camLook.set(lookX, lookY, lookZ);
            this.camInit = true;
        } else {
            const lambda = wide ? 4.4 : 6.4;
            this.camera.position.x = damp(this.camera.position.x, desiredX, lambda, dt);
            this.camera.position.y = damp(this.camera.position.y, desiredY, lambda, dt);
            this.camera.position.z = damp(this.camera.position.z, desiredZ, lambda, dt);
            this.camLook.x = damp(this.camLook.x, lookX, 8.5, dt);
            this.camLook.y = damp(this.camLook.y, lookY, 8.5, dt);
            this.camLook.z = damp(this.camLook.z, lookZ, 8.5, dt);
        }

        if (this.shake > 0.002) {
            this.camera.position.x += rand(-1, 1) * this.shake * 0.32;
            this.camera.position.y += rand(-1, 1) * this.shake * 0.2;
            this.camera.position.z += rand(-1, 1) * this.shake * 0.32;
        }
        this.camera.lookAt(this.camLook);
        this.camera.fov = damp(this.camera.fov, 57 + speedRatio * 8, 3.2, dt);
        this.camera.updateProjectionMatrix();
    }

    simulate(dt) {
        this.simTime += dt;

        if (this.player) this.player.setControls(this.input.snapshot());
        if (this.rival) this.updateRival(dt);
        this.player?.step(dt, this.systems, this.world, this.simTime);
        this.rival?.step(dt, this.systems, this.world, this.simTime);

        this.resolveCarCar();
        if (this.player) {
            this.resolveObstacles(this.player);
            this.resolveBoundary(this.player);
        }
        if (this.rival) {
            this.resolveObstacles(this.rival);
            this.resolveBoundary(this.rival);
        }
        this.checkMilestones();
    }

    buildRivalTargets() {
        if (!this.world) return [];
        if (this.world.airport) {
            return [
                new THREE.Vector3(-18, 0, -40),
                new THREE.Vector3(-18, 0, 90),
                new THREE.Vector3(-18, 0, 195),
                new THREE.Vector3(18, 0, 195),
                new THREE.Vector3(18, 0, 80),
                new THREE.Vector3(18, 0, -60),
                new THREE.Vector3(18, 0, -185),
                new THREE.Vector3(-18, 0, -160)
            ];
        }
        return [
            new THREE.Vector3(31, 0, 4),
            new THREE.Vector3(6, 0, 31),
            new THREE.Vector3(-31, 0, 7),
            new THREE.Vector3(-5, 0, -31)
        ];
    }

    updateRival(dt) {
        const car = this.rival;
        if (!car || this.rivalTargets.length === 0) return;

        let target = this.rivalTargets[this.rivalTargetIndex];
        let dx = target.x - car.group.position.x;
        let dz = target.z - car.group.position.z;
        let distance = Math.hypot(dx, dz);
        if (distance < 11) {
            this.rivalTargetIndex = (this.rivalTargetIndex + 1) % this.rivalTargets.length;
            target = this.rivalTargets[this.rivalTargetIndex];
            dx = target.x - car.group.position.x;
            dz = target.z - car.group.position.z;
            distance = Math.hypot(dx, dz);
        }

        const desiredYaw = Math.atan2(dx, dz);
        const error = shortestAngle(car.yaw, desiredYaw);
        let steer = clamp(error * 2.15, -1, 1);
        const cruise = this.world.airport ? 31 : 17;
        const speed = car.forwardSpeed;
        let throttle = speed < cruise ? 0.82 : 0;
        let brake = speed > cruise + 7 ? 0.58 : 0;
        if (Math.abs(error) > 1.12 && speed > 10) {
            throttle = 0.3;
            brake = Math.max(brake, 0.28);
        }

        if (Math.abs(speed) < 1.4) this.rivalStuckTime += dt;
        else this.rivalStuckTime = 0;

        if (this.rivalStuckTime > 2.4) {
            car.setControls({ throttle: 0, brake: 1, steer: -steer, handbrake: false });
            if (this.rivalStuckTime > 4.1) this.rivalStuckTime = 0;
            return;
        }

        car.setControls({ throttle, brake, steer, handbrake: false });
    }

    resolveObstacles(car) {
        if (!this.world) return;
        const position = car.group.position;
        const carObb = car.obb;

        for (const obstacle of this.world.obstacles) {
            if (position.y > obstacle.height + 0.6) continue;
            const obstacleObb = new OBB2(
                obstacle.x, obstacle.z,
                obstacle.halfWidth, obstacle.halfDepth, obstacle.yaw
            );
            const hit = carObb.overlap(obstacleObb);
            if (!hit) continue;

            const normal = hit.normal;
            position.x += normal.x * (hit.depth + 0.004);
            position.z += normal.z * (hit.depth + 0.004);

            const vn = car.velocity.x * normal.x + car.velocity.z * normal.z;
            let impactSpeed = 0;
            if (vn < 0) {
                impactSpeed = -vn;
                car.velocity.x -= normal.x * vn * 1.42;
                car.velocity.z -= normal.z * vn * 1.42;
                car.velocity.x *= 0.84;
                car.velocity.z *= 0.84;
                car.yawRate *= 0.86;
            }

            if (impactSpeed > 3) {
                const extent = carObb.extentAlong(normal.x, normal.z);
                const contact = new THREE.Vector3(
                    position.x - normal.x * extent,
                    position.y + 0.82,
                    position.z - normal.z * extent
                );
                this.registerImpact(car, contact, normal, impactSpeed);
            }
        }
    }

    resolveBoundary(car) {
        if (!this.world) return;
        const position = car.group.position;
        const bounds = this.world.bounds;

        if (bounds.type === 'circle') {
            const distance = Math.hypot(position.x, position.z);
            const limit = bounds.radius - Math.max(1.7, car.boundingRadius * 0.7);
            if (distance <= limit || distance < 0.001) return;

            const outward = { x: position.x / distance, z: position.z / distance };
            const penetration = distance - limit;
            position.x -= outward.x * penetration;
            position.z -= outward.z * penetration;

            const crownSpeed = car.velocity.x * outward.x + car.velocity.z * outward.z;
            if (crownSpeed > 0) {
                car.velocity.x -= outward.x * crownSpeed * 1.48;
                car.velocity.z -= outward.z * crownSpeed * 1.48;
                car.yawRate *= 0.72;
            }
            if (crownSpeed > 3) {
                const dentNormal = { x: -outward.x, z: -outward.z };
                const extent = car.obb.extentAlong(dentNormal.x, dentNormal.z);
                const contact = new THREE.Vector3(
                    position.x + outward.x * extent,
                    position.y + 0.72,
                    position.z + outward.z * extent
                );
                this.registerImpact(car, contact, dentNormal, crownSpeed);
            }
            return;
        }

        const limitX = bounds.halfX - Math.max(2.0, car.model.dimensions.width * 0.52);
        const limitZ = bounds.halfZ - Math.max(2.6, car.model.dimensions.length * 0.54);

        if (Math.abs(position.x) > limitX) {
            const sign = Math.sign(position.x) || 1;
            position.x = sign * limitX;
            const outwardX = car.velocity.x * sign;
            if (outwardX > 0) {
                car.velocity.x -= sign * outwardX * 1.48;
                car.yawRate *= 0.76;
            }
            if (outwardX > 3) {
                const dentNormal = { x: -sign, z: 0 };
                const extent = car.obb.extentAlong(dentNormal.x, dentNormal.z);
                const contact = new THREE.Vector3(
                    position.x + sign * extent,
                    position.y + 0.72,
                    position.z
                );
                this.registerImpact(car, contact, dentNormal, outwardX);
            }
        }

        if (Math.abs(position.z) > limitZ) {
            const sign = Math.sign(position.z) || 1;
            position.z = sign * limitZ;
            const outwardZ = car.velocity.z * sign;
            if (outwardZ > 0) {
                car.velocity.z -= sign * outwardZ * 1.48;
                car.yawRate *= 0.76;
            }
            if (outwardZ > 3) {
                const dentNormal = { x: 0, z: -sign };
                const extent = car.obb.extentAlong(dentNormal.x, dentNormal.z);
                const contact = new THREE.Vector3(
                    position.x,
                    position.y + 0.72,
                    position.z + sign * extent
                );
                this.registerImpact(car, contact, dentNormal, outwardZ);
            }
        }
    }

    resolveCarCar() {
        const player = this.player;
        const rival = this.rival;
        if (!player || !rival) return;
        if (Math.abs(player.group.position.y - rival.group.position.y) > 1.4) return;

        const hit = player.obb.overlap(rival.obb);
        if (!hit) return;

        const normal = hit.normal;
        const massPlayer = player.stats.massKg;
        const massRival = rival.stats.massKg;
        const totalMass = massPlayer + massRival;
        const playerShare = massRival / totalMass;
        const rivalShare = massPlayer / totalMass;

        player.group.position.x += normal.x * hit.depth * playerShare;
        player.group.position.z += normal.z * hit.depth * playerShare;
        rival.group.position.x -= normal.x * hit.depth * rivalShare;
        rival.group.position.z -= normal.z * hit.depth * rivalShare;

        const relativeX = player.velocity.x - rival.velocity.x;
        const relativeZ = player.velocity.z - rival.velocity.z;
        const closing = relativeX * normal.x + relativeZ * normal.z;
        let impactSpeed = 0;

        if (closing < 0) {
            impactSpeed = -closing;
            const restitution = 0.3;
            const impulse = -(1 + restitution) * closing / (1 / massPlayer + 1 / massRival);
            player.velocity.x += normal.x * impulse / massPlayer;
            player.velocity.z += normal.z * impulse / massPlayer;
            rival.velocity.x -= normal.x * impulse / massRival;
            rival.velocity.z -= normal.z * impulse / massRival;
            player.yawRate *= 0.9;
            rival.yawRate *= 0.9;
        }

        if (impactSpeed > 3) {
            const playerExtent = player.obb.extentAlong(normal.x, normal.z);
            const rivalExtent = rival.obb.extentAlong(normal.x, normal.z);
            const playerContact = new THREE.Vector3(
                player.group.position.x - normal.x * playerExtent,
                player.group.position.y + 0.8,
                player.group.position.z - normal.z * playerExtent
            );
            const rivalContact = new THREE.Vector3(
                rival.group.position.x + normal.x * rivalExtent,
                rival.group.position.y + 0.8,
                rival.group.position.z + normal.z * rivalExtent
            );
            this.registerImpact(
                player, playerContact, normal, impactSpeed, { count: true, particles: false }
            );
            this.registerImpact(
                rival, rivalContact, { x: -normal.x, z: -normal.z }, impactSpeed,
                { count: false, particles: false }
            );

            const midpoint = playerContact.clone().lerp(rivalContact, 0.5);
            this.particles.spawn(midpoint, normal, impactSpeed);
            if (impactSpeed > 3.5) {
                this.shake = Math.min(1.2, this.shake + impactSpeed * 0.025);
                this.ui.flashImpact();
            }
        }
    }

    registerImpact(car, contact, dentNormal, impactSpeed, { count = car.isPlayer, particles = true } = {}) {
        if (!car || !Number.isFinite(impactSpeed) || impactSpeed < 3) return false;
        const deformed = car.applyImpact(contact, dentNormal, impactSpeed, this.simTime);
        if (!deformed) return false;

        if (particles) {
            this.particles.spawn(contact, { x: -dentNormal.x, z: -dentNormal.z }, impactSpeed);
        }

        if (count) {
            this.impacts++;
            this.shake = Math.min(1.15, this.shake + impactSpeed * 0.02);
            this.ui.flashImpact();
            if (impactSpeed > 12 && this.simTime - this.lastBigToast > 7) {
                this.lastBigToast = this.simTime;
                this.ui.toast(`HEAVY IMPACT // ${Math.round(impactSpeed * 3.6)} KM/H`, 'danger');
            }
        }
        return true;
    }

    handleLanding(car, speed) {
        if (speed < 3.5) return;
        const contact = new THREE.Vector3(
            car.group.position.x,
            car.group.position.y + 0.12,
            car.group.position.z
        );
        this.particles.spawn(contact, { x: rand(-0.8, 0.8), z: rand(-0.8, 0.8) }, Math.min(26, speed * 1.9));
        if (car.isPlayer) {
            this.shake = Math.min(1.1, this.shake + speed * 0.035);
            this.ui.flashImpact();
            if (speed > 8 && this.simTime - this.lastBigToast > 6) {
                this.lastBigToast = this.simTime;
                this.ui.toast(`HARD LANDING // ${Math.round(speed * 3.6)} KM/H`, 'danger');
            }
        }
    }

    checkMilestones() {
        if (!this.player) return;
        const damage = this.player.damage;
        const messages = [
            [25, 'PANELS BUCKLED // 25% DAMAGE'],
            [50, 'FRAME STRESS // 50% DAMAGE'],
            [75, 'CHASSIS COMPROMISED // 75% DAMAGE'],
            [92, 'TOTAL LOSS IMMINENT', 'danger']
        ];
        for (const [threshold, message, tone] of messages) {
            if (damage >= threshold && !this.milestones.has(threshold)) {
                this.milestones.add(threshold);
                this.ui.toast(message, tone || '');
            }
        }
    }

    pushTelemetry() {
        if (!this.player) return;
        const car = this.player;
        this.ui.updateTelemetry({
            speedKph: car.speedKph,
            topSpeedKph: car.stats.topSpeedKph,
            gear: car.gear,
            rpm: car.rpm,
            damage: car.damage,
            lateralG: car.lateralG,
            tcActive: car.tcActive,
            espActive: car.espActive,
            absActive: car.absActive,
            impacts: this.impacts,
            fps: this.fps
        });
    }

    dispose() {
        cancelAnimationFrame(this.frameHandle);
        window.removeEventListener('resize', this.resize);
        this.input.clear();
        this.particles?.points.removeFromParent();
        this.player?.dispose();
        this.rival?.dispose();
        this.world?.dispose();
        this.renderer.dispose();
    }
}
