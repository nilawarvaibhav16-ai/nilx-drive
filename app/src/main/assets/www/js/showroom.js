import * as THREE from '../vendor/three.module.js';
import { buildVehicleModel, applyVehicleCustomization } from './models.js';
import { disposeObject } from './util.js';

function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    draw(context, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

function windowsTexture() {
    return canvasTexture(128, 256, (context, width, height) => {
        context.fillStyle = '#05040a';
        context.fillRect(0, 0, width, height);
        for (let y = 8; y < height; y += 15) {
            for (let x = 7; x < width; x += 13) {
                const lit = Math.random();
                if (lit > 0.55) {
                    context.fillStyle = lit > 0.92
                        ? 'rgba(255, 220, 172, .95)'
                        : lit > 0.78 ? 'rgba(124, 223, 255, .72)' : 'rgba(143, 103, 255, .42)';
                    context.fillRect(x, y, 5, 7);
                }
            }
        }
        context.fillStyle = 'rgba(141, 100, 255, .08)';
        for (let x = 0; x < width; x += 13) context.fillRect(x, 0, 1, height);
    });
}

function signTexture(text, color, sub = '') {
    return canvasTexture(512, 256, (context, width, height) => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'rgba(3, 2, 6, .6)';
        context.fillRect(0, 0, width, height);
        context.strokeStyle = color;
        context.lineWidth = 5;
        context.strokeRect(9, 9, width - 18, height - 18);
        context.shadowColor = color;
        context.shadowBlur = 24;
        context.fillStyle = color;
        context.font = '900 94px Arial Narrow, Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, width / 2, height / 2 - 12);
        context.shadowBlur = 8;
        context.fillStyle = `${color}b8`;
        context.font = '600 26px Consolas, monospace';
        context.fillText(sub, width / 2, height / 2 + 66);
    });
}

function addBox(parent, geometry, material, position, rotation = null, cast = false, receive = false) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
}

export class Showroom {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#050409');
        this.scene.fog = new THREE.FogExp2('#080611', 0.024);
        this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 260);
        this.camera.position.set(2, 2.4, 7.2);

        this.orbit = 0.58;
        this.pitch = 0.14;
        this.autoOrbit = true;
        this.dragging = false;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.layout = 'menu';
        this.quality = 'balanced';
        this.stageRoot = null;
        this.currentVehicle = null;
        this.customization = null;
        this.elapsed = 0;

        this.city = new THREE.Group();
        this.city.name = 'neon-city';
        this.scene.add(this.city);
        this.buildLights();
        this.buildFloor();
        this.buildSkyline();
        this.buildBridge();
        this.buildSigns();
        this.bindDrag();
        this.resize();
    }

    buildLights() {
        this.ambient = new THREE.HemisphereLight('#8fd8ff', '#170b24', 0.7);
        this.scene.add(this.ambient);

        this.key = new THREE.DirectionalLight('#d9cbff', 2.1);
        this.key.position.set(-5, 8, 5);
        this.key.castShadow = true;
        this.key.shadow.mapSize.set(1024, 1024);
        this.key.shadow.camera.left = -7;
        this.key.shadow.camera.right = 7;
        this.key.shadow.camera.top = 7;
        this.key.shadow.camera.bottom = -7;
        this.key.shadow.camera.near = 1;
        this.key.shadow.camera.far = 28;
        this.key.shadow.bias = -0.0005;
        this.scene.add(this.key);

        this.violetLight = new THREE.PointLight('#8d64ff', 15, 18, 2);
        this.violetLight.position.set(-4.2, 2.4, 3.4);
        this.scene.add(this.violetLight);

        this.cyanLight = new THREE.PointLight('#57e9ff', 13, 16, 2);
        this.cyanLight.position.set(4.4, 1.9, 2.4);
        this.scene.add(this.cyanLight);

        this.rimLight = new THREE.SpotLight('#ff58d0', 18, 15, 0.54, 0.8, 1.4);
        this.rimLight.position.set(0.3, 4.2, -5.2);
        this.rimLight.target.position.set(0, 0.4, 0);
        this.scene.add(this.rimLight, this.rimLight.target);

        this.frontFill = new THREE.PointLight('#a8c6ff', 7, 10, 2);
        this.frontFill.position.set(0, 1.1, 5.2);
        this.scene.add(this.frontFill);
    }

    buildFloor() {
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: '#07060c',
            roughness: 0.19,
            metalness: 0.8
        });
        const floor = addBox(
            this.city,
            new THREE.PlaneGeometry(70, 70),
            floorMaterial,
            new THREE.Vector3(0, -0.015, 0),
            { x: -Math.PI / 2 },
            false,
            true
        );
        floor.name = 'wet-floor';

        const grid = new THREE.GridHelper(52, 52, '#7d51ff', '#241743');
        grid.position.y = 0.005;
        grid.material.transparent = true;
        grid.material.opacity = 0.24;
        grid.material.depthWrite = false;
        this.city.add(grid);

        const crossGrid = new THREE.GridHelper(52, 13, '#2d8b9e', '#10232c');
        crossGrid.position.y = 0.008;
        crossGrid.material.transparent = true;
        crossGrid.material.opacity = 0.16;
        crossGrid.material.depthWrite = false;
        this.city.add(crossGrid);

        const stripMaterial = new THREE.MeshBasicMaterial({
            color: '#8d64ff',
            transparent: true,
            opacity: 0.62,
            depthWrite: false
        });
        for (const [x, z, w, d, color] of [
            [-7.2, 0, 0.025, 17, '#57e9ff'],
            [7.2, 0, 0.025, 17, '#8d64ff'],
            [0, -6.8, 16, 0.025, '#28154f'],
            [0, 7.1, 14, 0.02, '#ff4ecb']
        ]) {
            const strip = new THREE.Mesh(
                new THREE.PlaneGeometry(w, d),
                stripMaterial.clone()
            );
            strip.material.color.set(color);
            strip.material.opacity = color === '#28154f' ? 0.25 : 0.5;
            strip.rotation.x = -Math.PI / 2;
            strip.position.set(x, 0.012, z);
            strip.renderOrder = 2;
            this.city.add(strip);
        }

        const haloTexture = canvasTexture(256, 256, (context, width, height) => {
            const gradient = context.createRadialGradient(
                width / 2, height / 2, 4, width / 2, height / 2, width / 2
            );
            gradient.addColorStop(0, 'rgba(125, 81, 255, .28)');
            gradient.addColorStop(0.52, 'rgba(86, 39, 170, .1)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);
        });
        const halo = new THREE.Mesh(
            new THREE.PlaneGeometry(13, 13),
            new THREE.MeshBasicMaterial({
                map: haloTexture,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.018;
        halo.renderOrder = 1;
        this.city.add(halo);

        this.particles = this.makeParticles();
        this.city.add(this.particles);
    }

    makeParticles() {
        const count = 130;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 28;
            positions[i * 3 + 1] = Math.random() * 6 + 0.2;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: '#a88aff',
            size: 0.025,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const points = new THREE.Points(geometry, material);
        points.name = 'showroom-dust';
        return points;
    }

    buildSkyline() {
        const texture = windowsTexture();
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.2, 1.4);
        const material = new THREE.MeshStandardMaterial({
            color: '#120d1e',
            map: texture,
            emissive: '#ffffff',
            emissiveMap: texture,
            emissiveIntensity: 0.58,
            roughness: 0.46,
            metalness: 0.42
        });

        const count = 72;
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const buildings = new THREE.InstancedMesh(geometry, material, count);
        const dummy = new THREE.Object3D();
        const rng = (seed) => {
            const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
            return x - Math.floor(x);
        };

        for (let i = 0; i < count; i++) {
            const ring = i < 34 ? 0 : 1;
            const angle = -Math.PI * 0.94 + (i / count) * Math.PI * 1.88 + rng(i) * 0.1;
            const radius = ring === 0 ? 12.5 + rng(i + 1) * 7 : 22 + rng(i + 2) * 15;
            const width = ring === 0 ? 1.3 + rng(i + 4) * 2.5 : 2 + rng(i + 5) * 4;
            const depth = ring === 0 ? 1.2 + rng(i + 6) * 2.2 : 2 + rng(i + 7) * 3.6;
            const height = ring === 0 ? 3.5 + rng(i + 8) * 14 : 6 + rng(i + 9) * 24;
            dummy.position.set(Math.cos(angle) * radius, height / 2 - 0.3, Math.sin(angle) * radius - 2.2);
            dummy.scale.set(width, height, depth);
            dummy.rotation.y = -angle + rng(i + 10) * 0.35;
            dummy.updateMatrix();
            buildings.setMatrixAt(i, dummy.matrix);
        }
        buildings.instanceMatrix.needsUpdate = true;
        this.city.add(buildings);

        const crownGeometry = new THREE.BoxGeometry(1, 1, 1);
        const crownMaterial = new THREE.MeshBasicMaterial({ color: '#8d64ff' });
        const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, 24);
        for (let i = 0; i < 24; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const x = side * (11 + rng(i + 22) * 14);
            const z = -10 + rng(i + 24) * 20;
            const height = 9 + rng(i + 26) * 15;
            dummy.position.set(x, height, z);
            dummy.scale.set(1.5 + rng(i) * 1.2, 0.05, 1.5 + rng(i + 2) * 1.2);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            crowns.setMatrixAt(i, dummy.matrix);
        }
        crowns.instanceMatrix.needsUpdate = true;
        this.city.add(crowns);

        const hazeMaterial = new THREE.MeshBasicMaterial({
            color: '#4a2a96',
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        for (let i = 0; i < 5; i++) {
            const haze = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), hazeMaterial);
            haze.position.set(-9 + i * 4.4, 1.1 + i * 0.45, -9.5);
            haze.rotation.y = -0.18;
            this.city.add(haze);
        }
    }

    buildBridge() {
        const steel = new THREE.MeshStandardMaterial({
            color: '#171021',
            roughness: 0.62,
            metalness: 0.7
        });
        const neon = new THREE.MeshBasicMaterial({
            color: '#57e9ff',
            transparent: true,
            opacity: 0.72
        });

        for (const side of [-1, 1]) {
            addBox(
                this.city,
                new THREE.BoxGeometry(0.13, 7.8, 0.13),
                steel,
                new THREE.Vector3(side * 9.7, 3.9, -7.6)
            );
            addBox(
                this.city,
                new THREE.BoxGeometry(0.05, 6.7, 0.05),
                neon,
                new THREE.Vector3(side * 9.7, 4.1, -7.52)
            );
            addBox(
                this.city,
                new THREE.BoxGeometry(0.1, 4.2, 0.1),
                steel,
                new THREE.Vector3(side * 6.3, 2.1, -7.6),
                { z: side * 0.22 }
            );
        }

        addBox(
            this.city,
            new THREE.BoxGeometry(21, 0.12, 0.34),
            steel,
            new THREE.Vector3(0, 5.8, -7.6)
        );
        addBox(
            this.city,
            new THREE.BoxGeometry(19, 0.035, 0.04),
            neon,
            new THREE.Vector3(0, 5.86, -7.4)
        );

        const cableMaterial = new THREE.LineBasicMaterial({
            color: '#a88aff',
            transparent: true,
            opacity: 0.32
        });
        for (let i = 0; i < 8; i++) {
            const x = -9 + i * 2.6;
            const points = [
                new THREE.Vector3(x, 5.75, -7.6),
                new THREE.Vector3(x + 1.3, 5.05, -7.6)
            ];
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cableMaterial);
            this.city.add(line);
        }

        const towerMaterial = new THREE.MeshStandardMaterial({
            color: '#0a0712',
            emissive: '#8d64ff',
            emissiveIntensity: 0.14,
            roughness: 0.4,
            metalness: 0.5
        });
        addBox(this.city, new THREE.BoxGeometry(1.2, 9, 1.2), towerMaterial, new THREE.Vector3(-15, 4.5, -15));
        addBox(this.city, new THREE.BoxGeometry(0.8, 5, 0.8), towerMaterial, new THREE.Vector3(16, 2.5, -18));
    }

    buildSigns() {
        const signData = [
            { text: 'NILX', sub: 'NIGHT CITY', color: '#57e9ff', x: -5.6, y: 2.7, z: -5.89, w: 2.6, h: 1.3, ry: 0.26 },
            { text: 'DRIVE', sub: 'LIVE', color: '#ff4ecb', x: 6.6, y: 3.4, z: -7.1, w: 2.4, h: 1.2, ry: -0.33 },
            { text: 'NO LIMITS', sub: 'SECTOR 09', color: '#8d64ff', x: 0.5, y: 1.17, z: -4.1, w: 1.9, h: 0.95, ry: 0.04, small: true }
        ];

        for (const sign of signData) {
            const texture = signTexture(sign.text, sign.color, sign.sub);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.86,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(sign.w, sign.h), material);
            plane.position.set(sign.x, sign.y, sign.z);
            plane.rotation.y = sign.ry;
            plane.renderOrder = 1;
            this.city.add(plane);
        }

        const screen = canvasTexture(512, 256, (context, width, height) => {
            const gradient = context.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#11091d');
            gradient.addColorStop(1, '#250d30');
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);
            context.strokeStyle = 'rgba(87, 233, 255, .35)';
            context.lineWidth = 1;
            for (let y = 0; y < height; y += 16) {
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y);
                context.stroke();
            }
            context.fillStyle = 'rgba(141, 100, 255, .8)';
            context.fillRect(34, 168, 440, 2);
            context.fillStyle = '#57e9ff';
            context.font = '600 18px Consolas, monospace';
            context.fillText('NILX / CITY NETWORK', 34, 132);
            context.fillStyle = 'rgba(255,255,255,.36)';
            context.font = '500 12px Consolas, monospace';
            context.fillText('OFFLINE SANDBOX / NO LIVE SERVER', 34, 154);
            context.fillStyle = '#8d64ff';
            for (let i = 0; i < 7; i++) {
                const heightBar = 20 + (i * 41) % 72;
                context.fillRect(350 + i * 17, 190 - heightBar, 9, heightBar);
            }
        });
        const billboard = new THREE.Mesh(
            new THREE.PlaneGeometry(3.8, 1.9),
            new THREE.MeshBasicMaterial({ map: screen, transparent: true, opacity: 0.75 })
        );
        billboard.position.set(4.8, 5.5, -9.2);
        billboard.rotation.y = -0.25;
        this.city.add(billboard);

        this.cones = new THREE.Group();
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: '#8d64ff',
            transparent: true,
            opacity: 0.075,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        for (const x of [-4.9, 4.9]) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 24, 1, true), coneMaterial);
            cone.position.set(x, 4.5, -2);
            cone.rotation.x = Math.PI;
            this.cones.add(cone);
        }
        this.city.add(this.cones);
    }

    bindDrag() {
        this.onPointerDown = (event) => {
            if (event.button !== undefined && event.button !== 0) return;
            this.dragging = true;
            this.autoOrbit = false;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
            if (event.pointerId !== undefined) {
                try {
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                } catch {
                    // Pointer capture is an enhancement only.
                }
            }
        };
        this.onPointerMove = (event) => {
            if (!this.dragging) return;
            const dx = event.clientX - this.lastPointerX;
            const dy = event.clientY - this.lastPointerY;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
            this.orbit -= dx * 0.008;
            this.pitch = Math.max(-0.05, Math.min(0.38, this.pitch + dy * 0.0025));
        };
        this.onPointerUp = () => {
            this.dragging = false;
            window.setTimeout(() => {
                if (!this.dragging) this.autoOrbit = true;
            }, 2400);
        };
        const canvas = document.getElementById('game-canvas');
        if (canvas) {
            canvas.addEventListener('pointerdown', this.onPointerDown);
            canvas.addEventListener('pointermove', this.onPointerMove);
            canvas.addEventListener('pointerup', this.onPointerUp);
            canvas.addEventListener('pointercancel', this.onPointerUp);
            canvas.addEventListener('lostpointercapture', this.onPointerUp);
        }
    }

    setLayout(layout) {
        this.layout = layout;
    }

    setQuality(quality) {
        this.quality = quality;
        this.cones.visible = quality !== 'performance';
        this.particles.visible = quality !== 'performance';
        this.rimLight.visible = quality !== 'performance';
        this.key.castShadow = quality !== 'performance';
        this.cyanLight.intensity = quality === 'performance' ? 8 : 13;
        this.violetLight.intensity = quality === 'performance' ? 9 : 15;
    }

    stage(vehicle, customization = null) {
        if (!vehicle) return;
        if (this.currentVehicle?.id === vehicle.id && this.customization === customization) {
            if (this.stageRoot) applyVehicleCustomization(this.stageRoot, customization);
            return;
        }
        this.currentVehicle = vehicle;
        this.customization = customization;

        if (this.stageRoot) {
            this.stageRoot.group.removeFromParent();
            disposeObject(this.stageRoot.group);
            this.stageRoot = null;
        }

        const model = buildVehicleModel(vehicle, customization);
        model.group.position.set(1.15, 0, 0);
        model.group.rotation.y = 0.14;
        this.scene.add(model.group);
        this.stageRoot = model;
    }

    updateCustomization(customization) {
        this.customization = customization;
        if (this.stageRoot) applyVehicleCustomization(this.stageRoot, customization);
    }

    resize(width = window.innerWidth, height = window.innerHeight) {
        this.camera.aspect = Math.max(0.1, width / Math.max(1, height));
        this.camera.updateProjectionMatrix();
    }

    update(dt) {
        this.elapsed += dt;
        if (this.autoOrbit && !this.dragging) this.orbit += dt * 0.055;

        const radius = this.layout === 'garage' ? 7.1 : 7.5;
        const carX = 1.15;
        const targetShift = this.layout === 'menu' ? -1.55 : this.layout === 'results' ? -0.55 : 0;
        const camX = carX + Math.sin(this.orbit) * radius;
        const camZ = Math.cos(this.orbit) * radius;
        const camY = 1.8 + this.pitch * 3.6;
        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(carX + targetShift, 0.75, 0);

        if (this.stageRoot) {
            this.stageRoot.group.rotation.y += dt * 0.035;
        }

        this.violetLight.position.x = -4.2 + Math.sin(this.elapsed * 0.22) * 0.5;
        this.cyanLight.position.z = 2.4 + Math.cos(this.elapsed * 0.18) * 0.5;
        this.particles.rotation.y += dt * 0.006;
        if (this.cones) this.cones.children.forEach((cone, index) => {
            cone.material.opacity = 0.055 + Math.sin(this.elapsed * 0.8 + index) * 0.02;
        });
    }

    dispose() {
        if (this.stageRoot) {
            this.stageRoot.group.removeFromParent();
            disposeObject(this.stageRoot.group);
        }
        this.city.removeFromParent();
        disposeObject(this.city);
        const canvas = document.getElementById('game-canvas');
        if (canvas) {
            canvas.removeEventListener('pointerdown', this.onPointerDown);
            canvas.removeEventListener('pointermove', this.onPointerMove);
            canvas.removeEventListener('pointerup', this.onPointerUp);
            canvas.removeEventListener('pointercancel', this.onPointerUp);
            canvas.removeEventListener('lostpointercapture', this.onPointerUp);
        }
    }
}
