export class Minimap {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas?.getContext('2d') || null;
        this.size = 320;
    }

    draw({ world, player, rival, active = true } = {}) {
        const context = this.context;
        if (!context) return;
        const size = this.canvas.width;
        const center = size / 2;
        const scale = world?.airport
            ? Math.min((size * 0.39) / 255, (size * 0.39) / 225)
            : (size * 0.39) / 60.5;

        context.clearRect(0, 0, size, size);
        context.save();
        context.translate(center, center);

        context.fillStyle = 'rgba(5, 4, 9, 0.72)';
        context.fillRect(-center, -center, size, size);

        context.strokeStyle = 'rgba(141, 100, 255, 0.13)';
        context.lineWidth = 1;
        for (let i = -3; i <= 3; i++) {
            const offset = i * size * 0.13;
            context.beginPath();
            context.moveTo(-center, offset);
            context.lineTo(center, offset);
            context.stroke();
            context.beginPath();
            context.moveTo(offset, -center);
            context.lineTo(offset, center);
            context.stroke();
        }

        if (world?.bounds?.type === 'circle') {
            const radius = world.bounds.radius * scale;
            context.strokeStyle = 'rgba(87, 233, 255, 0.4)';
            context.lineWidth = 2;
            context.beginPath();
            context.arc(0, 0, radius, 0, Math.PI * 2);
            context.stroke();
            context.strokeStyle = 'rgba(255, 78, 203, 0.2)';
            context.lineWidth = 1;
            context.beginPath();
            context.arc(0, 0, 38 * scale, 0, Math.PI * 2);
            context.stroke();
            context.beginPath();
            context.arc(0, 0, 22 * scale, 0, Math.PI * 2);
            context.stroke();
        } else if (world?.bounds) {
            const width = world.bounds.halfX * 2 * scale;
            const height = world.bounds.halfZ * 2 * scale;
            context.strokeStyle = 'rgba(87, 233, 255, 0.36)';
            context.lineWidth = 2;
            context.strokeRect(-width / 2, -height / 2, width, height);
            context.strokeStyle = 'rgba(141, 100, 255, 0.18)';
            context.lineWidth = 1;
            context.strokeRect(-40 * scale, -202 * scale, 80 * scale, 404 * scale);
        }

        for (const obstacle of world?.obstacles || []) {
            context.save();
            context.translate(obstacle.x * scale, obstacle.z * scale);
            context.rotate(-obstacle.yaw || 0);
            context.fillStyle = 'rgba(184, 174, 203, 0.25)';
            context.fillRect(
                -obstacle.halfWidth * scale,
                -obstacle.halfDepth * scale,
                obstacle.halfWidth * 2 * scale,
                obstacle.halfDepth * 2 * scale
            );
            context.restore();
        }

        for (const ramp of world?.ramps || []) {
            context.save();
            context.translate(ramp.x * scale, ramp.z * scale);
            context.rotate(ramp.dir > 0 ? 0 : Math.PI);
            context.fillStyle = 'rgba(255, 157, 77, 0.42)';
            context.beginPath();
            context.moveTo(-ramp.width * scale / 2, ramp.length * scale / 2);
            context.lineTo(ramp.width * scale / 2, ramp.length * scale / 2);
            context.lineTo(0, -ramp.length * scale / 2);
            context.closePath();
            context.fill();
            context.restore();
        }

        if (rival?.group) {
            context.fillStyle = 'rgba(255, 85, 110, 0.92)';
            context.shadowColor = 'rgba(255, 85, 110, 0.7)';
            context.shadowBlur = 8;
            context.beginPath();
            context.arc(rival.group.position.x * scale, rival.group.position.z * scale, 4, 0, Math.PI * 2);
            context.fill();
            context.shadowBlur = 0;
        }

        if (player?.group) {
            const x = player.group.position.x * scale;
            const y = player.group.position.z * scale;
            context.save();
            context.translate(x, y);
            context.rotate(player.yaw || 0);
            context.fillStyle = active ? '#57e9ff' : '#7b718f';
            context.shadowColor = '#57e9ff';
            context.shadowBlur = 12;
            context.beginPath();
            context.moveTo(0, -9);
            context.lineTo(6, 7);
            context.lineTo(0, 4);
            context.lineTo(-6, 7);
            context.closePath();
            context.fill();
            context.restore();
        }

        context.restore();
        context.strokeStyle = 'rgba(141, 100, 255, 0.22)';
        context.lineWidth = 1;
        context.strokeRect(0.5, 0.5, size - 1, size - 1);
    }
}
