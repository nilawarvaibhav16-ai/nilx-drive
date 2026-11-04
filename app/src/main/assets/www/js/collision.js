import * as THREE from '../vendor/three.module.js';
import { clamp } from './util.js';

/**
 * Axis-aligned 2D OBB representation in the X/Z plane, with yaw.
 * The SAT result reports the minimum translation normal pointing from
 * the other box toward this box.
 */
export class OBB2 {
    constructor(centerX, centerZ, halfWidth, halfDepth, yaw) {
        this.cx = centerX;
        this.cz = centerZ;
        this.hx = halfWidth;
        this.hz = halfDepth;
        this.yaw = yaw;
        this.axisX = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        this.axisZ = { x: Math.sin(yaw), z: Math.cos(yaw) };
    }

    extentAlong(x, z) {
        return this.hx * Math.abs(this.axisX.x * x + this.axisX.z * z)
            + this.hz * Math.abs(this.axisZ.x * x + this.axisZ.z * z);
    }

    overlap(other) {
        const axes = [
            this.axisX,
            this.axisZ,
            other.axisX,
            other.axisZ
        ];
        const dx = this.cx - other.cx;
        const dz = this.cz - other.cz;
        let bestOverlap = Number.POSITIVE_INFINITY;
        let bestAxis = null;

        for (const axis of axes) {
            const distance = Math.abs(dx * axis.x + dz * axis.z);
            const radiusA = this.extentAlong(axis.x, axis.z);
            const radiusB = other.extentAlong(axis.x, axis.z);
            const overlap = radiusA + radiusB - distance;
            if (overlap <= 0) return null;
            if (overlap < bestOverlap) {
                bestOverlap = overlap;
                bestAxis = axis;
            }
        }

        if (!bestAxis) return null;
        let nx = bestAxis.x;
        let nz = bestAxis.z;
        if (dx * nx + dz * nz < 0) {
            nx = -nx;
            nz = -nz;
        }
        return { normal: { x: nx, z: nz }, depth: bestOverlap };
    }
}

/**
 * Permanently displaces vertices inside a spherical impact zone. The vertex
 * cloud is deformed in mesh-local space and normals are rebuilt after every
 * hit. Vertices are pushed inward along the collision normal and also pulled
 * slightly toward the part's local geometric center.
 */
export class DeformationEngine {
    static deform(car, contactWorld, inwardNormal, impactSpeed) {
        if (!car?.model?.deformParts?.length) return 0;
        if (!Number.isFinite(impactSpeed) || impactSpeed < 2.8) return 0;

        const severity = clamp((impactSpeed - 2) / 27, 0.04, 1.28);
        const massFactor = clamp(1550 / car.stats.massKg, 0.42, 1.5);
        const radius = 1.05 + severity * 2.35;
        const maxDepth = (0.035 + severity * 0.36) * massFactor;
        const normal = new THREE.Vector3(inwardNormal.x, 0, inwardNormal.z).normalize();
        const contact = contactWorld.clone();
        const vertex = new THREE.Vector3();
        const localContact = new THREE.Vector3();
        const localNormal = new THREE.Vector3();
        const towardCenter = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const inverseQuaternion = new THREE.Quaternion();
        let movedVertices = 0;

        car.group.updateMatrixWorld(true);

        for (const part of car.model.deformParts) {
            const mesh = part.mesh;
            const geometry = mesh.geometry;
            const position = geometry.attributes.position;
            if (!position) continue;

            contact.y = clamp(contact.y, car.group.position.y + 0.25, car.group.position.y + 1.65);
            localContact.copy(contact).applyMatrix4(mesh.matrixWorld.clone().invert());
            mesh.getWorldQuaternion(worldQuaternion);
            inverseQuaternion.copy(worldQuaternion).invert();
            localNormal.copy(normal).applyQuaternion(inverseQuaternion).normalize();
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            const partCenter = geometry.boundingSphere?.center ?? new THREE.Vector3();

            for (let i = 0; i < position.count; i++) {
                vertex.fromBufferAttribute(position, i);
                const distance = vertex.distanceTo(localContact);
                if (distance >= radius) continue;

                const falloff = Math.pow(1 - distance / radius, 1.35);
                const shear = 0.82 + 0.18 * Math.sin(i * 12.9898 + severity * 40);
                const depth = maxDepth * falloff * shear;
                if (depth <= 0) continue;

                vertex.addScaledVector(localNormal, depth);
                towardCenter.copy(partCenter).sub(vertex);
                if (towardCenter.lengthSq() > 0.0001) {
                    towardCenter.normalize();
                    vertex.addScaledVector(towardCenter, depth * 0.22);
                }
                vertex.y += Math.sin(i * 31.77) * depth * 0.07;
                vertex.x += Math.cos(i * 17.13) * depth * 0.035;

                position.setXYZ(i, vertex.x, vertex.y, vertex.z);
                movedVertices++;
            }

            if (movedVertices > 0) {
                position.needsUpdate = true;
                geometry.computeVertexNormals();
                geometry.computeBoundingSphere();
                mesh.userData.deformed = true;
            }
        }

        return movedVertices;
    }
}
