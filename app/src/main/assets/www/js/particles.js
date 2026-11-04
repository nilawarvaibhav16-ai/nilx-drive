import * as THREE from '../vendor/three.module.js';
import { clamp, rand } from './util.js';

const MAX_PARTICLES = 360;
const SPARK_COLORS = [
    new THREE.Color('#ffd36a'),
    new THREE.Color('#ff9b3e'),
    new THREE.Color('#fff3cb'),
    new THREE.Color('#ff6a2f')
];

export class ParticleField {
    constructor(scene) {
        this.positions = new Float32Array(MAX_PARTICLES * 3);
        this.colors = new Float32Array(MAX_PARTICLES * 3);
        this.velocities = new Float32Array(MAX_PARTICLES * 3);
        this.life = new Float32Array(MAX_PARTICLES);
        this.maxLife = new Float32Array(MAX_PARTICLES);
        this.cursor = 0;

        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.positions[i * 3 + 1] = -1000;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        const material = new THREE.PointsMaterial({
            size: 0.17,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 4;
        scene.add(this.points);
    }

    spawn(contact, normal, impactSpeed) {
        const amount = clamp(Math.round(impactSpeed * 1.25 + 6), 8, 34);
        const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
        for (let i = 0; i < amount; i++) {
            const index = this.cursor;
            this.cursor = (this.cursor + 1) % MAX_PARTICLES;
            const offset = index * 3;

            this.positions[offset] = contact.x + rand(-0.45, 0.45);
            this.positions[offset + 1] = contact.y + rand(-0.25, 0.4);
            this.positions[offset + 2] = contact.z + rand(-0.45, 0.45);

            const scatter = rand(0.9, 3.4);
            this.velocities[offset] = normal.x * scatter + rand(-2.1, 2.1);
            this.velocities[offset + 1] = rand(0.8, 4.4);
            this.velocities[offset + 2] = normal.z * scatter + rand(-2.1, 2.1);

            const colorOffset = offset;
            this.colors[colorOffset] = color.r;
            this.colors[colorOffset + 1] = color.g;
            this.colors[colorOffset + 2] = color.b;

            const life = rand(0.32, 0.9);
            this.life[index] = life;
            this.maxLife[index] = life;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.geometry.attributes.color.needsUpdate = true;
    }

    update(dt) {
        let changed = false;
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.life[i] <= 0) continue;
            changed = true;
            const offset = i * 3;
            this.life[i] -= dt;
            if (this.life[i] <= 0) {
                this.positions[offset + 1] = -1000;
                continue;
            }
            this.velocities[offset + 1] -= 12.5 * dt;
            this.positions[offset] += this.velocities[offset] * dt;
            this.positions[offset + 1] += this.velocities[offset + 1] * dt;
            this.positions[offset + 2] += this.velocities[offset + 2] * dt;
            const fade = this.life[i] / this.maxLife[i];
            this.colors[offset] *= 0.94 + fade * 0.06;
            this.colors[offset + 1] *= 0.93 + fade * 0.07;
            this.colors[offset + 2] *= 0.9 + fade * 0.1;
        }
        if (changed) {
            this.points.geometry.attributes.position.needsUpdate = true;
            this.points.geometry.attributes.color.needsUpdate = true;
        }
    }

    clear() {
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.life[i] = 0;
            this.positions[i * 3 + 1] = -1000;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
    }
}
