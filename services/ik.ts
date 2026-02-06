
import { Utils } from '../utils';

export interface IKJoint {
    x: number;
    y: number;
    length: number; // Distance to next joint
}

export class IKChain {
    joints: IKJoint[];
    count: number;
    baseX: number;
    baseY: number;

    constructor(count: number, length: number) {
        this.count = count;
        this.joints = [];
        for(let i=0; i<count; i++) {
            this.joints.push({ x: 0, y: 0, length: length });
        }
        this.baseX = 0;
        this.baseY = 0;
    }

    // Forward And Backward Reaching Inverse Kinematics (FABRIK)
    resolve(targetX: number, targetY: number) {
        if (this.count === 0) return;

        // Check reach
        // (Simplified for performance, we just execute the reach)

        const head = this.joints[0];
        const tail = this.joints[this.count - 1];

        // Store original base
        const rootX = this.baseX;
        const rootY = this.baseY;

        // Iterations (2-3 is usually enough for games)
        const iterations = 2;

        for(let iter=0; iter<iterations; iter++) {
            // BACKWARD REACHING (Target -> Base)
            // Set tail to target
            tail.x = targetX;
            tail.y = targetY;

            for (let i = this.count - 2; i >= 0; i--) {
                const curr = this.joints[i];
                const next = this.joints[i+1];

                const dx = curr.x - next.x;
                const dy = curr.y - next.y;
                const dist = Math.hypot(dx, dy);
                const scale = curr.length / dist;

                curr.x = next.x + dx * scale;
                curr.y = next.y + dy * scale;
            }

            // FORWARD REACHING (Base -> Target)
            // Set head to base
            head.x = rootX;
            head.y = rootY;

            for (let i = 0; i < this.count - 1; i++) {
                const curr = this.joints[i];
                const next = this.joints[i+1];

                const dx = next.x - curr.x;
                const dy = next.y - curr.y;
                const dist = Math.hypot(dx, dy);
                const scale = curr.length / dist;

                next.x = curr.x + dx * scale;
                next.y = curr.y + dy * scale;
            }
        }
    }

    // For snake-like movement, we often just want to constrain lengths without targeting a specific point (Follow the leader)
    // This is "Forward Reaching" only.
    constrain() {
        this.joints[0].x = this.baseX;
        this.joints[0].y = this.baseY;

        for (let i = 0; i < this.count - 1; i++) {
            const curr = this.joints[i];
            const next = this.joints[i+1];

            const dx = next.x - curr.x;
            const dy = next.y - curr.y;
            const dist = Math.hypot(dx, dy);

            // If distance is wrong, pull next towards curr
            if (dist > curr.length || dist < curr.length * 0.5) { // Allow some compression? No, stick to length.
                 // Actually for snakes, we usually just drag.
                 const scale = curr.length / (dist || 1);
                 next.x = curr.x + dx * scale;
                 next.y = curr.y + dy * scale;
            }
        }
    }
}
