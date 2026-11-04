import * as THREE from '../vendor/three.module.js';
import { clamp, disposeObject, titleCase } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);

function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0.08,
        ...options
    });
}

function createTextTexture(text, {
    width = 512,
    height = 256,
    color = '#ffffff',
    font = '900 168px Arial, sans-serif',
    letterSpacing = 0
} = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = font;
    context.fillStyle = color;
    if ('letterSpacing' in context) context.letterSpacing = `${letterSpacing}px`;
    context.fillText(text, width / 2, height / 2 + 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

function createWedgeGeometry(width, height, length) {
    const halfW = width / 2;
    const halfL = length / 2;
    const vertices = new Float32Array([
        -halfW, 0, -halfL,
        halfW, 0, -halfL,
        -halfW, 0, halfL,
        halfW, 0, halfL,
        -halfW, height, halfL,
        halfW, height, halfL
    ]);
    const indices = [
        0, 1, 5, 0, 5, 4,
        2, 3, 5, 2, 5, 4,
        0, 4, 2,
        1, 3, 5,
        0, 3, 1, 0, 2, 3
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

export class World {
    constructor(profile) {
        this.profile = profile;
        this.group = new THREE.Group();
        this.group.name = `world-${profile.id}`;
        this.scene = null;
        this.obstacles = [];
        this.ramps = [];
        this.airport = profile.layout === 'airport';
        this.bounds = this.airport
            ? { type: 'rect', halfX: 255, halfZ: 225 }
            : { type: 'circle', radius: 60.5 };
        this.spawnPlayer = { position: new THREE.Vector3(), yaw: 0 };
        this.spawnRival = { position: new THREE.Vector3(), yaw: 0 };
        this._materials = {};
        this._sky = null;

        if (this.airport) {
            this.buildAirport();
        } else {
            this.buildArena();
        }
    }

    attach(scene) {
        this.scene = scene;
        scene.add(this.group);
        scene.fog = this.fog;
    }

    addSky(top, horizon, bottom) {
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, top);
        gradient.addColorStop(0.55, horizon);
        gradient.addColorStop(1, bottom);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 4, 512);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const skyMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false
        });
        const sky = new THREE.Mesh(new THREE.SphereGeometry(540, 32, 16), skyMaterial);
        sky.renderOrder = -20;
        this.group.add(sky);
        this._sky = sky;
    }

    addLighting({ sunColor, sunIntensity, shadowSize, shadowExtent, skyColor, groundColor }) {
        const hemisphere = new THREE.HemisphereLight(skyColor, groundColor, 1.4);
        this.group.add(hemisphere);

        const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
        sun.position.set(-85, 130, -60);
        sun.castShadow = true;
        sun.shadow.mapSize.set(shadowSize, shadowSize);
        sun.shadow.camera.left = -shadowExtent;
        sun.shadow.camera.right = shadowExtent;
        sun.shadow.camera.top = shadowExtent;
        sun.shadow.camera.bottom = -shadowExtent;
        sun.shadow.camera.near = 15;
        sun.shadow.camera.far = 360;
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = 0.025;
        this.group.add(sun);
        this.group.add(sun.target);

        const fill = new THREE.DirectionalLight(0x6c93a8, 0.45);
        fill.position.set(90, 50, 100);
        this.group.add(fill);
    }

    baseMaterials() {
        this._materials.asphalt = material('#22282d', { roughness: 0.92, metalness: 0.02 });
        this._materials.concrete = material('#555b5d', { roughness: 0.88, metalness: 0.04 });
        this._materials.white = material('#e7e9e4', { roughness: 0.7, metalness: 0.02 });
        this._materials.hazard = material('#e9b949', { roughness: 0.65, metalness: 0.04 });
        this._materials.darkSteel = material('#1c252b', { roughness: 0.65, metalness: 0.48 });
        this._materials.rust = material('#8f442c', { roughness: 0.8, metalness: 0.18 });
        this._materials.glass = standardGlass();
    }

    addMesh(geometry, mat, { x = 0, y = 0, z = 0, rotY = 0, receive = true, cast = false } = {}) {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY;
        mesh.receiveShadow = receive;
        mesh.castShadow = cast;
        this.group.add(mesh);
        return mesh;
    }

    addObstacleBox({ x, z, width, depth, height, yaw = 0, mat, roof = false }) {
        const body = this.addMesh(
            new THREE.BoxGeometry(width, height, depth),
            mat ?? this._materials.concrete,
            { x, y: height / 2, z, rotY: yaw, cast: true }
        );
        if (roof) {
            const cap = this.addMesh(
                new THREE.BoxGeometry(width * 1.06, 0.7, depth * 1.06),
                this._materials.darkSteel,
                { x, y: height + 0.25, z, rotY: yaw, cast: true }
            );
            cap.rotation.y = yaw;
        }
        this.obstacles.push({
            x, z,
            halfWidth: width / 2,
            halfDepth: depth / 2,
            yaw,
            height
        });
        return body;
    }

    addRamp({ x, z, width, length, height, dir = 1 }) {
        const mesh = new THREE.Mesh(
            createWedgeGeometry(width, height, length),
            material('#3a4248', { roughness: 0.76, metalness: 0.15, side: THREE.DoubleSide })
        );
        mesh.position.set(x, 0.03, z);
        mesh.rotation.y = dir > 0 ? 0 : Math.PI;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);

        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.86, 0.08, 0.42),
            this._materials.hazard
        );
        stripe.position.set(
            x,
            height + 0.04,
            z + (dir > 0 ? length / 2 - 0.28 : -length / 2 + 0.28)
        );
        stripe.rotation.y = mesh.rotation.y;
        stripe.castShadow = false;
        this.group.add(stripe);

        this.ramps.push({ x, z, width, length, height, dir });
        return mesh;
    }

    addRing(radius, thickness, color, opacity = 0.35) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius, radius + thickness, 96),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        ring.renderOrder = 2;
        this.group.add(ring);
        return ring;
    }

    addFloorText(text, x, z, size, color = '#b6ff3c', opacity = 0.28, rotation = 0) {
        const texture = createTextTexture(text, {
            width: 512,
            height: 256,
            color,
            font: '900 190px Arial, sans-serif'
        });
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size * 0.5),
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.rotation.z = rotation;
        plane.position.set(x, 0.035, z);
        plane.renderOrder = 1;
        this.group.add(plane);
        return plane;
    }

    addFloodlight(x, z, height, intensity = 1) {
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.26, height, 8),
            this._materials.darkSteel
        );
        pole.position.set(x, height / 2, z);
        pole.castShadow = true;
        this.group.add(pole);

        const head = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.8, 0.45),
            new THREE.MeshStandardMaterial({
                color: '#d6e4da',
                emissive: '#fff4d2',
                emissiveIntensity: 1.8,
                roughness: 0.35
            })
        );
        head.position.set(x, height + 0.2, z);
        head.rotation.y = Math.atan2(-x, -z);
        head.rotation.x = 0.22;
        head.scale.setScalar(intensity);
        this.group.add(head);
    }

    buildArena() {
        this.baseMaterials();
        this.fog = new THREE.Fog('#0a1218', 78, 245);
        this.addSky('#08111a', '#26333a', '#8b573c');
        this.addLighting({
            sunColor: '#ffd1a0',
            sunIntensity: 2.0,
            shadowSize: 1024,
            shadowExtent: 72,
            skyColor: '#9db7c4',
            groundColor: '#17110d'
        });

        this.addMesh(
            new THREE.CylinderGeometry(74, 77, 2, 96),
            this._materials.asphalt,
            { y: -0.98, receive: true }
        );
        this.addMesh(
            new THREE.RingGeometry(50, 50.18, 96),
            new THREE.MeshBasicMaterial({
                color: '#b6ff3c',
                transparent: true,
                opacity: 0.22,
                side: THREE.DoubleSide,
                depthWrite: false
            }),
            { y: 0.03 }
        ).rotation.x = -Math.PI / 2;
        this.addRing(38, 0.13, '#d6e1d8', 0.18);
        this.addRing(22, 0.09, '#ff7a2f', 0.24);
        this.addFloorText('NILX', 0, 0, 26, '#b6ff3c', 0.16);
        this.addFloorText('DERBY DIVISION', 0, 15, 15, '#ffffff', 0.12);
        for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI / 2;
            this.addFloodlight(Math.cos(angle) * 66, Math.sin(angle) * 66, 17, 1.05);
        }

        const wallMaterial = material('#121b20', {
            roughness: 0.86,
            metalness: 0.18,
            side: THREE.BackSide
        });
        const wall = new THREE.Mesh(
            new THREE.CylinderGeometry(74, 70, 15, 64, 1, true),
            wallMaterial
        );
        wall.position.y = 7.3;
        wall.receiveShadow = true;
        this.group.add(wall);
        this.addMesh(
            new THREE.TorusGeometry(72.4, 0.45, 8, 72),
            this._materials.darkSteel,
            { y: 14.7, receive: true }
        );

        const barrierGeometry = new THREE.BoxGeometry(3.4, 1.25, 0.75);
        const barrierCount = 64;
        const barriers = new THREE.InstancedMesh(barrierGeometry, this._materials.concrete, barrierCount);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < barrierCount; i++) {
            const angle = (i / barrierCount) * Math.PI * 2;
            dummy.position.set(Math.cos(angle) * 62, 0.62, Math.sin(angle) * 62);
            dummy.rotation.set(0, -angle, 0);
            dummy.updateMatrix();
            barriers.setMatrixAt(i, dummy.matrix);
        }
        barriers.castShadow = true;
        barriers.receiveShadow = true;
        barriers.instanceMatrix.needsUpdate = true;
        this.group.add(barriers);

        const tireGeometry = new THREE.TorusGeometry(0.74, 0.3, 6, 12);
        tireGeometry.rotateX(Math.PI / 2);
        const tireMaterial = material('#101214', { roughness: 0.98 });
        const tireStacks = 44;
        const tires = new THREE.InstancedMesh(tireGeometry, tireMaterial, tireStacks * 3);
        let tireIndex = 0;
        for (let i = 0; i < tireStacks; i++) {
            const angle = (i / tireStacks) * Math.PI * 2 + 0.08;
            const radius = 58.5 + (i % 3) * 0.22;
            for (let level = 0; level < 3; level++) {
                dummy.position.set(Math.cos(angle) * radius, 0.32 + level * 0.45, Math.sin(angle) * radius);
                dummy.rotation.set(0, angle, 0);
                dummy.updateMatrix();
                tires.setMatrixAt(tireIndex++, dummy.matrix);
            }
        }
        tires.castShadow = true;
        tires.receiveShadow = true;
        tires.instanceMatrix.needsUpdate = true;
        this.group.add(tires);

        const hazardMat = this._materials.hazard;
        for (const spec of [
            { x: 18, z: 13, yaw: 0.6, width: 5.2, depth: 1.3, height: 1.5 },
            { x: -17, z: -14, yaw: -0.45, width: 5.2, depth: 1.3, height: 1.5 },
            { x: 25, z: -28, yaw: 1.1, width: 1.4, depth: 4.2, height: 1.5 }
        ]) {
            this.addObstacleBox({ ...spec, mat: hazardMat });
        }

        this.addRamp({ x: -32, z: 23, width: 9, length: 17, height: 2.4, dir: 1 });
        this.addRamp({ x: 33, z: -20, width: 10, length: 19, height: 2.8, dir: -1 });

        this.spawnPlayer = {
            position: new THREE.Vector3(0, 0, 27),
            yaw: Math.PI
        };
        this.spawnRival = {
            position: new THREE.Vector3(0, 0, -12),
            yaw: 0
        };
    }

    buildAirport() {
        this.baseMaterials();
        this.fog = new THREE.Fog('#7d94a4', 170, 620);
        this.addSky('#3f7197', '#bdc8c8', '#d79b6c');
        this.addLighting({
            sunColor: '#ffe0b8',
            sunIntensity: 2.3,
            shadowSize: 1024,
            shadowExtent: 210,
            skyColor: '#adc8d5',
            groundColor: '#34412e'
        });

        const grass = material('#384b32', { roughness: 1, metalness: 0 });
        this.addMesh(new THREE.PlaneGeometry(900, 700), grass, {
            x: 0, y: -0.035, z: 0, receive: true
        }).rotation.x = -Math.PI / 2;

        this.addMesh(new THREE.PlaneGeometry(78, 430), this._materials.asphalt, {
            x: 0, y: 0.015, z: 0, receive: true
        }).rotation.x = -Math.PI / 2;

        const shoulder = material('#3d474a', { roughness: 0.95 });
        for (const x of [-41, 41]) {
            this.addMesh(new THREE.PlaneGeometry(4.8, 430), shoulder, {
                x, y: 0.018, z: 0, receive: true
            }).rotation.x = -Math.PI / 2;
            this.addMesh(new THREE.BoxGeometry(0.34, 0.03, 420), this._materials.white, {
                x: x - 1.4, y: 0.045, z: 0, receive: false
            });
        }

        const dashes = new THREE.InstancedMesh(
            new THREE.BoxGeometry(0.34, 0.02, 4.8),
            this._materials.white,
            42
        );
        const dummy = new THREE.Object3D();
        for (let i = 0; i < 42; i++) {
            dummy.position.set(0, 0.045, -198 + i * 9.6);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            dashes.setMatrixAt(i, dummy.matrix);
        }
        dashes.instanceMatrix.needsUpdate = true;
        this.group.add(dashes);

        for (const z of [-202, 202]) {
            const threshold = new THREE.InstancedMesh(
                new THREE.BoxGeometry(2.3, 0.025, 8),
                this._materials.white,
                8
            );
            for (let i = 0; i < 8; i++) {
                dummy.position.set(-13.8 + i * 4.1, 0.05, z);
                dummy.updateMatrix();
                threshold.setMatrixAt(i, dummy.matrix);
            }
            threshold.instanceMatrix.needsUpdate = true;
            this.group.add(threshold);
        }

        this.addFloorText('18', 26, -181, 12, '#f5f5ef', 0.76, Math.PI);
        this.addFloorText('36', -26, 181, 12, '#f5f5ef', 0.76, 0);

        const hangarMat = material('#596267', { roughness: 0.78, metalness: 0.22 });
        for (let i = 0; i < 3; i++) {
            const z = -88 + i * 92;
            this.addObstacleBox({
                x: -118, z, width: 46, depth: 36, height: 11.5, mat: hangarMat, roof: true
            });
            this.addMesh(
                new THREE.BoxGeometry(37, 6.8, 0.24),
                this._materials.darkSteel,
                { x: -118, y: 3.4, z: z + 18.12, receive: false }
            );
            for (let bay = -1; bay <= 1; bay++) {
                this.addMesh(
                    new THREE.BoxGeometry(0.16, 6.1, 0.1),
                    this._materials.hazard,
                    { x: -118 + bay * 11, y: 3.3, z: z + 18.27, receive: false }
                );
            }
        }

        this.addObstacleBox({
            x: 112, z: -88, width: 17, depth: 17, height: 26, mat: material('#30393e'), roof: false
        });
        this.addMesh(
            new THREE.BoxGeometry(12.5, 3.8, 12.5),
            this._materials.glass,
            { x: 112, y: 20.4, z: -88, receive: false }
        );
        this.addMesh(
            new THREE.BoxGeometry(18, 1.1, 18),
            this._materials.darkSteel,
            { x: 112, y: 27.2, z: -88, receive: true }
        );

        const crateMat = material('#785a37', { roughness: 0.9 });
        for (const crate of [
            { x: 51, z: -102, w: 5, h: 4, d: 5, yaw: 0.2 },
            { x: 57, z: -95, w: 3.4, h: 2.6, d: 3.4, yaw: -0.4 },
            { x: -53, z: 13, w: 4.5, h: 3.2, d: 4.5, yaw: 0.8 }
        ]) {
            this.addObstacleBox({
                x: crate.x, z: crate.z, width: crate.w, depth: crate.d,
                height: crate.h, yaw: crate.yaw, mat: crateMat
            });
        }

        this.addRamp({ x: 0, z: -24, width: 20, length: 36, height: 6.3, dir: 1 });
        this.addRamp({ x: 14, z: 103, width: 15, length: 28, height: 4.1, dir: 1 });
        this.addRamp({ x: -54, z: 51, width: 15, length: 25, height: 3.4, dir: -1 });

        const coneGeometry = new THREE.ConeGeometry(0.28, 0.8, 8);
        const coneMaterial = material('#fc7c33', { roughness: 0.7 });
        const coneCount = 34;
        const cones = new THREE.InstancedMesh(coneGeometry, coneMaterial, coneCount);
        let coneIndex = 0;
        for (let i = 0; i < 17; i++) {
            for (const side of [-1, 1]) {
                dummy.position.set(side * 43, 0.42, -190 + i * 23.5);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                cones.setMatrixAt(coneIndex++, dummy.matrix);
            }
        }
        cones.castShadow = true;
        cones.instanceMatrix.needsUpdate = true;
        this.group.add(cones);

        const mountainMat = material('#394a4e', { roughness: 1, flatShading: true });
        for (const mountain of [
            { x: -335, z: -260, r: 68, h: 92 },
            { x: -230, z: -315, r: 92, h: 120 },
            { x: 220, z: -295, r: 78, h: 104 },
            { x: 360, z: -190, r: 94, h: 84 },
            { x: 320, z: 280, r: 74, h: 78 }
        ]) {
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(mountain.r, mountain.h, 7, 1),
                mountainMat
            );
            cone.position.set(mountain.x, mountain.h / 2 - 3, mountain.z);
            cone.rotation.y = mountain.x * 0.01;
            this.group.add(cone);
        }

        this.spawnPlayer = {
            position: new THREE.Vector3(0, 0, -172),
            yaw: 0
        };
        this.spawnRival = {
            position: new THREE.Vector3(-14, 0, -148),
            yaw: 0
        };
    }

    getGroundInfo(x, z) {
        let bestHeight = 0;
        let bestSlopeZ = 0;
        let onRamp = false;

        for (const ramp of this.ramps) {
            const halfW = ramp.width / 2;
            const halfL = ramp.length / 2;
            const dx = x - ramp.x;
            const dz = z - ramp.z;
            if (Math.abs(dx) > halfW || Math.abs(dz) > halfL) continue;
            const t = ramp.dir > 0
                ? (dz + halfL) / ramp.length
                : (halfL - dz) / ramp.length;
            const height = clamp(t, 0, 1) * ramp.height;
            if (height >= bestHeight) {
                bestHeight = height;
                bestSlopeZ = ramp.dir > 0 ? ramp.height / ramp.length : -ramp.height / ramp.length;
                onRamp = true;
            }
        }

        return { height: bestHeight, slopeZ: bestSlopeZ, onRamp };
    }

    getSurfaceAt(x, z) {
        if (!this.airport) return { grip: 1, label: 'CONCRETE' };
        const onRunway = Math.abs(x) <= 40 && Math.abs(z) <= 212;
        if (onRunway) return { grip: 0.99, label: 'RUNWAY' };
        return { grip: 0.72, label: 'GRASS' };
    }

    get typeLabel() {
        return this.airport ? 'OPEN WORLD' : 'DERBY ARENA';
    }

    get layoutLabel() {
        return titleCase(this.profile.layout);
    }

    dispose() {
        this.group.removeFromParent();
        disposeObject(this.group);
        if (this.scene) {
            this.scene.fog = null;
        }
        this.obstacles.length = 0;
        this.ramps.length = 0;
    }
}

function standardGlass() {
    return new THREE.MeshStandardMaterial({
        color: '#16323d',
        roughness: 0.18,
        metalness: 0.75,
        transparent: true,
        opacity: 0.82
    });
}
