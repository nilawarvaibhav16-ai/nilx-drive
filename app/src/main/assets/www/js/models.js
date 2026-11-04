import * as THREE from '../vendor/three.module.js';

function standard(color, options = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.58,
        metalness: 0.24,
        flatShading: true,
        ...options
    });
}

function addBox(root, deformParts, materials, spec) {
    const {
        width, height, depth, x = 0, y = 0, z = 0,
        material = materials.body, segments = [1, 1, 1],
        deform = true, rotationX = 0, rotationY = 0, rotationZ = 0,
        castShadow = true, receiveShadow = true
    } = spec;
    const geometry = new THREE.BoxGeometry(
        width, height, depth,
        Math.max(1, segments[0]),
        Math.max(1, segments[1]),
        Math.max(1, segments[2])
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    root.add(mesh);
    if (deform) deformParts.push({ mesh });
    return mesh;
}

function makeWheel(root, materials, { x, z, radius, width, front }) {
    const pivot = new THREE.Group();
    pivot.position.set(x, radius, z);
    root.add(pivot);

    const spinner = new THREE.Group();
    pivot.add(spinner);

    const tireGeometry = new THREE.CylinderGeometry(radius, radius, width, 16, 1);
    tireGeometry.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeometry, materials.tire);
    tire.castShadow = true;
    tire.receiveShadow = true;
    spinner.add(tire);

    const rimGeometry = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width * 1.035, 10, 1);
    rimGeometry.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeometry, materials.rim);
    rim.castShadow = true;
    spinner.add(rim);

    const hubGeometry = new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width * 1.09, 8, 1);
    hubGeometry.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeometry, materials.dark);
    spinner.add(hub);

    return { pivot, spinner, front };
}

function buildHeavy(root, vehicle) {
    const materials = {
        body: standard(vehicle.livery, { roughness: 0.66, metalness: 0.3 }),
        accent: standard(vehicle.accent, { roughness: 0.58, metalness: 0.32 }),
        dark: standard('#12181d', { roughness: 0.78, metalness: 0.22 }),
        glass: standard('#071116', { roughness: 0.19, metalness: 0.72 }),
        tire: standard('#090b0c', { roughness: 0.94, metalness: 0.02 }),
        rim: standard('#9ca5a5', { roughness: 0.34, metalness: 0.8 }),
        light: new THREE.MeshStandardMaterial({
            color: '#fffbe8', emissive: '#ffe2a0', emissiveIntensity: 2.2, roughness: 0.16
        }),
        tail: new THREE.MeshStandardMaterial({
            color: '#5b0808', emissive: '#ff2116', emissiveIntensity: 1.7, roughness: 0.3
        })
    };
    const deformParts = [];

    addBox(root, deformParts, materials, {
        width: 2.25, height: 0.64, depth: 4.7, y: 0.7, material: materials.body,
        segments: [4, 2, 9]
    });
    addBox(root, deformParts, materials, {
        width: 2.04, height: 0.3, depth: 1.48, y: 1.04, z: 1.53,
        material: materials.body, segments: [3, 1, 5]
    });
    addBox(root, deformParts, materials, {
        width: 1.76, height: 0.74, depth: 1.92, y: 1.27, z: -0.28,
        material: materials.body, segments: [3, 2, 5]
    });
    addBox(root, deformParts, materials, {
        width: 2.2, height: 0.16, depth: 0.5, y: 0.42, z: 1.95,
        material: materials.dark, segments: [4, 1, 2]
    });
    addBox(root, deformParts, materials, {
        width: 2.42, height: 0.38, depth: 0.2, y: 0.66, z: 2.46,
        material: materials.accent, segments: [4, 2, 1]
    });
    addBox(root, deformParts, materials, {
        width: 2.34, height: 0.28, depth: 0.18, y: 0.6, z: -2.45,
        material: materials.accent, segments: [3, 2, 1]
    });
    addBox(root, deformParts, materials, {
        width: 0.46, height: 0.43, depth: 1.42, x: -1.05, y: 0.8, z: 1.53,
        material: materials.body, segments: [2, 1, 5]
    });
    addBox(root, deformParts, materials, {
        width: 0.46, height: 0.43, depth: 1.42, x: 1.05, y: 0.8, z: 1.53,
        material: materials.body, segments: [2, 1, 5]
    });
    addBox(root, deformParts, materials, {
        width: 0.46, height: 0.43, depth: 1.42, x: -1.05, y: 0.8, z: -1.53,
        material: materials.body, segments: [2, 1, 5]
    });
    addBox(root, deformParts, materials, {
        width: 0.46, height: 0.43, depth: 1.42, x: 1.05, y: 0.8, z: -1.53,
        material: materials.body, segments: [2, 1, 5]
    });
    addBox(root, deformParts, materials, {
        width: 1.36, height: 0.13, depth: 1.38, y: 1.7, z: -0.24,
        material: materials.dark, segments: [2, 1, 4]
    });
    addBox(root, deformParts, materials, {
        width: 0.035, height: 0.39, depth: 1.28, x: -0.892, y: 1.3, z: -0.3,
        material: materials.glass, segments: [1, 1, 3], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 0.035, height: 0.39, depth: 1.28, x: 0.892, y: 1.3, z: -0.3,
        material: materials.glass, segments: [1, 1, 3], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 1.62, height: 0.045, depth: 0.8, y: 1.21, z: 1.27,
        material: materials.accent, segments: [3, 1, 2], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 1.52, height: 0.045, depth: 0.36, y: 1.05, z: 2.25,
        material: materials.dark, segments: [3, 1, 1], castShadow: false
    });

    for (const side of [-1, 1]) {
        const light = addBox(root, deformParts, materials, {
            width: 0.43, height: 0.18, depth: 0.045, x: side * 0.68, y: 0.92, z: 2.365,
            material: materials.light, deform: false, castShadow: false
        });
        light.receiveShadow = false;
        addBox(root, deformParts, materials, {
            width: 0.38, height: 0.16, depth: 0.045, x: side * 0.72, y: 0.84, z: -2.365,
            material: materials.tail, deform: false, castShadow: false
        });
    }

    const wheels = [];
    for (const z of [-1.56, 1.56]) {
        for (const x of [-1.08, 1.08]) {
            wheels.push(makeWheel(root, materials, {
                x, z, radius: 0.46, width: 0.38, front: z > 0
            }));
        }
    }

    addBox(root, deformParts, materials, {
        width: 0.73, height: 0.11, depth: 0.28, y: 1.79, z: 0.24,
        material: materials.accent, deform: false, castShadow: false
    });
    for (const x of [-0.26, 0, 0.26]) {
        addBox(root, deformParts, materials, {
            width: 0.12, height: 0.08, depth: 0.1, x, y: 1.85, z: 0.22,
            material: materials.light, deform: false, castShadow: false
        });
    }

    return {
        deformParts,
        wheels,
        materials,
        dimensions: { width: 2.5, length: 5.15, height: 1.9 }
    };
}

function buildSport(root, vehicle) {
    const materials = {
        body: standard(vehicle.livery, { roughness: 0.34, metalness: 0.46 }),
        accent: standard(vehicle.accent, { roughness: 0.4, metalness: 0.5 }),
        dark: standard('#101417', { roughness: 0.74, metalness: 0.28 }),
        glass: standard('#07151a', { roughness: 0.11, metalness: 0.8 }),
        tire: standard('#080a0b', { roughness: 0.94, metalness: 0.02 }),
        rim: standard('#c7d0d0', { roughness: 0.22, metalness: 0.9 }),
        light: new THREE.MeshStandardMaterial({
            color: '#f6ffff', emissive: '#bffaff', emissiveIntensity: 2.4, roughness: 0.12
        }),
        tail: new THREE.MeshStandardMaterial({
            color: '#4d070a', emissive: '#ff2333', emissiveIntensity: 2.1, roughness: 0.22
        })
    };
    const deformParts = [];

    addBox(root, deformParts, materials, {
        width: 2.05, height: 0.4, depth: 4.55, y: 0.48,
        material: materials.body, segments: [4, 1, 10]
    });
    addBox(root, deformParts, materials, {
        width: 1.95, height: 0.2, depth: 1.37, y: 0.71, z: 1.56,
        material: materials.body, segments: [3, 1, 5], rotationX: -0.055
    });
    addBox(root, deformParts, materials, {
        width: 1.52, height: 0.39, depth: 1.98, y: 0.9, z: -0.26,
        material: materials.glass, segments: [3, 1, 5], castShadow: true
    });
    addBox(root, deformParts, materials, {
        width: 1.26, height: 0.07, depth: 1.42, y: 1.11, z: -0.25,
        material: materials.accent, segments: [2, 1, 3], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 2.26, height: 0.075, depth: 0.55, y: 0.26, z: 2.3,
        material: materials.accent, segments: [4, 1, 2], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 2.02, height: 0.16, depth: 0.33, y: 1.13, z: -2.14,
        material: materials.accent, segments: [3, 1, 1], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 0.08, height: 0.37, depth: 0.12, x: -0.82, y: 0.94, z: -2.02,
        material: materials.dark, deform: false
    });
    addBox(root, deformParts, materials, {
        width: 0.08, height: 0.37, depth: 0.12, x: 0.82, y: 0.94, z: -2.02,
        material: materials.dark, deform: false
    });
    addBox(root, deformParts, materials, {
        width: 0.1, height: 0.15, depth: 2.7, x: -1.02, y: 0.31, z: 0.04,
        material: materials.accent, segments: [1, 1, 5], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 0.1, height: 0.15, depth: 2.7, x: 1.02, y: 0.31, z: 0.04,
        material: materials.accent, segments: [1, 1, 5], castShadow: false
    });
    addBox(root, deformParts, materials, {
        width: 2.08, height: 0.17, depth: 0.5, y: 0.3, z: -2.18,
        material: materials.dark, segments: [3, 1, 2]
    });
    addBox(root, deformParts, materials, {
        width: 0.06, height: 0.22, depth: 0.42, x: -0.7, y: 0.99, z: -1.47,
        material: materials.dark, deform: false
    });
    addBox(root, deformParts, materials, {
        width: 0.06, height: 0.22, depth: 0.42, x: 0.7, y: 0.99, z: -1.47,
        material: materials.dark, deform: false
    });

    for (const side of [-1, 1]) {
        addBox(root, deformParts, materials, {
            width: 0.38, height: 0.11, depth: 0.04, x: side * 0.59, y: 0.64, z: 2.335,
            material: materials.light, deform: false, castShadow: false
        });
    }
    addBox(root, deformParts, materials, {
        width: 1.72, height: 0.075, depth: 0.045, y: 0.58, z: -2.32,
        material: materials.tail, deform: false, castShadow: false
    });

    const wheels = [];
    for (const z of [-1.5, 1.5]) {
        for (const x of [-0.99, 0.99]) {
            wheels.push(makeWheel(root, materials, {
                x, z, radius: 0.4, width: 0.34, front: z > 0
            }));
        }
    }

    return {
        deformParts,
        wheels,
        materials,
        dimensions: { width: 2.28, length: 4.92, height: 1.2 }
    };
}

const NEON_COLORS = {
    'neon-none': null,
    'neon-violet': '#8d64ff',
    'neon-cyan': '#57e9ff',
    'neon-pink': '#ff4ecb',
    'neon-amber': '#ffb24d'
};

const DECAL_COLORS = {
    'decal-none': null,
    'decal-blade': '#57e9ff',
    'decal-split': '#8d64ff',
    'decal-hazard': '#ffb24d',
    'decal-circuit': '#ff4ecb'
};

function makeDecalTexture(kind, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 12;
    context.lineCap = 'round';

    if (kind === 'decal-blade') {
        context.beginPath();
        context.moveTo(32, 500);
        context.lineTo(208, 14);
        context.lineTo(238, 14);
        context.lineTo(62, 500);
        context.stroke();
        context.globalAlpha = 0.45;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(8, 440);
        context.lineTo(170, 18);
        context.stroke();
    } else if (kind === 'decal-split') {
        for (const x of [52, 104, 156, 208]) {
            context.globalAlpha = 0.2 + x / 300;
            context.fillRect(x - 9, 30, 18, 420);
        }
        context.globalAlpha = 0.9;
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(20, 250);
        context.lineTo(236, 170);
        context.stroke();
    } else if (kind === 'decal-hazard') {
        for (let y = -40; y < 540; y += 54) {
            context.save();
            context.translate(128, y);
            context.rotate(-0.55);
            context.globalAlpha = 0.78;
            context.fillRect(-190, -13, 380, 26);
            context.restore();
        }
    } else if (kind === 'decal-circuit') {
        context.globalAlpha = 0.86;
        context.lineWidth = 7;
        const points = [[26, 460], [26, 354], [92, 354], [92, 240], [168, 240], [168, 118], [226, 118], [226, 24]];
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (const [x, y] of points.slice(1)) context.lineTo(x, y);
        context.stroke();
        for (const [x, y] of points) {
            context.beginPath();
            context.arc(x, y, 9, 0, Math.PI * 2);
            context.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

function makeGlowTexture(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 128, 2, 64, 128, 124);
    gradient.addColorStop(0, `${color}cc`);
    gradient.addColorStop(0.42, `${color}52`);
    gradient.addColorStop(1, `${color}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

export function applyVehicleCustomization(model, customization = {}) {
    if (!model?.materials) return null;
    const { body, accent, rim } = model.materials;
    if (body && customization.paint) body.color.set(customization.paint);
    if (accent && customization.accent) accent.color.set(customization.accent);
    if (rim && customization.rim) {
        rim.color.set(customization.rim);
        rim.metalness = 0.86;
        rim.roughness = 0.22;
    }

    if (model.customizationExtras) {
        model.customizationExtras.removeFromParent();
        model.customizationExtras.traverse((object) => {
            object.geometry?.dispose?.();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach((entry) => {
                        entry.map?.dispose?.();
                        entry.dispose?.();
                    });
                } else {
                    object.material.map?.dispose?.();
                    object.material.dispose?.();
                }
            }
        });
        model.customizationExtras = null;
    }

    const extras = new THREE.Group();
    extras.name = 'customization';
    model.group.add(extras);
    model.customizationExtras = extras;

    const neonColor = NEON_COLORS[customization.neon] || null;
    if (neonColor) {
        const texture = makeGlowTexture(neonColor);
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(model.dimensions.width * 1.9, model.dimensions.length * 1.12),
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.06;
        glow.renderOrder = 3;
        extras.add(glow);

        for (const side of [-1, 1]) {
            const light = new THREE.PointLight(neonColor, 1.5, 4.6, 2);
            light.position.set(side * model.dimensions.width * 0.38, 0.24, 0);
            extras.add(light);
        }
    }

    const decalColor = DECAL_COLORS[customization.decal] || null;
    if (decalColor) {
        const texture = makeDecalTexture(customization.decal, decalColor);
        const sport = model.dimensions.height < 1.5;
        const hoodWidth = sport ? 1.02 : 1.06;
        const hoodLength = sport ? 1.15 : 1.3;
        const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(hoodWidth, hoodLength),
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -2
            })
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(0, sport ? 0.632 : 1.046, sport ? 1.55 : 1.53);
        decal.renderOrder = 5;
        extras.add(decal);
    }

    return extras;
}

export function buildVehicleModel(vehicle, customization = null) {
    const root = new THREE.Group();
    root.name = `nilx-${vehicle.id}`;
    const built = vehicle.chassis === 'sport'
        ? buildSport(root, vehicle)
        : buildHeavy(root, vehicle);

    const frontSteerPivots = [];
    const wheelSpinners = [];
    for (const wheel of built.wheels) {
        wheelSpinners.push(wheel.spinner);
        if (wheel.front) frontSteerPivots.push(wheel.pivot);
    }

    root.userData.vehicleId = vehicle.id;
    const model = {
        group: root,
        deformParts: built.deformParts,
        frontSteerPivots,
        wheelSpinners,
        dimensions: built.dimensions,
        wheelRadius: vehicle.chassis === 'sport' ? 0.4 : 0.46,
        materials: built.materials,
        customizationExtras: null
    };
    if (customization) applyVehicleCustomization(model, customization);
    return model;
}
